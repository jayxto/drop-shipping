import {randomUUID,createHash} from 'node:crypto';
import {jsonStore} from './storage.js';
import {parseImport,InputError,validateListing,marketplacePlan,pricing} from './listing.js';
import {generate} from './generate.js';
import {defaultTemplates,templates,imagePrompt,generateImage,imageFormat,storeImage} from './images.js';
import {productUrl} from './aliexpress-url.js';

const running=new Set(['queued','generating_listing','generating_images']);
export function createWorkflow({dataDir,env,request,saveDraft,loadDrafts}) {
  const imports=jsonStore(dataDir,'imports.json'),styles=jsonStore(dataDir,'image-templates.json',defaultTemplates);
  let queue=Promise.resolve();const pending=new Set();
  // An interrupted paid call has an unknown outcome. Require an explicit retry.
  const ready=imports.update(data=>{for(const item of Object.values(data))if(running.has(item.status)){item.status='interrupted';item.error='Traitement interrompu par un redémarrage. Reprendre peut relancer une génération facturée.';}});
  ready.catch(()=>{});
  const get=async id=>{await ready;const item=(await imports.load())[id];if(!item)throw new InputError('Import introuvable.',404);return item;};
  const patch=(id,change)=>imports.update(data=>{Object.assign(data[id],change,{updatedAt:new Date().toISOString()});return data[id];});
  async function persistListing(item) {
    const saved=(await loadDrafts()).find(d=>d.id===item.listing.id);
    const listing={...item.listing,...saved,images:item.gallery.filter(Boolean).map(i=>i.url),importId:item.id,updatedAt:new Date().toISOString()};
    await saveDraft(listing);await patch(item.id,{listing});return listing;
  }
  function enqueue(id,task) {
    pending.add(id);
    const operation=queue.then(task).catch(async e=>{await patch(id,{status:'failed',error:e.status?e.message:'Erreur serveur. La progression enregistrée est conservée.'});}).finally(()=>pending.delete(id));
    queue=operation.catch(()=>{});
  }
  async function processItem(id,index) {
    let item=await get(id);
    if(!item.listing){
      await patch(id,{status:'generating_listing',error:null});
      const listing={...await generate(item.source,item.options,env,request),id,importId:id,images:[]};
      await saveDraft(listing);item=await patch(id,{listing});
    }
    await patch(id,{status:'generating_images',error:null});
    for(const [i,type] of Object.keys(defaultTemplates.types).entries()) {
      if(index!==undefined ? i!==index : Boolean(item.gallery[i]))continue;
      const prompt=imagePrompt(item.source,item.templates,type,item.productPrompt);
      const image=await generateImage({source:item.source,prompt,type,dataDir,env,request});
      item.gallery[i]={...image,createdAt:new Date().toISOString()};
      item=await patch(id,{gallery:item.gallery});await persistListing(item);
    }
    await patch(id,{status:'ready',error:null});
  }
  return {
    ready,idle:()=>queue,
    list:async()=>{await ready;return Object.values(await imports.load()).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));},get,
    getTemplates:()=>styles.load(),setTemplates:async input=>{const value=templates(input);await styles.update(data=>Object.assign(data,value));return value;},
    async receive(input,key) {
      await ready;
      if(!input || typeof input!=='object' || Array.isArray(input))throw new InputError('Un objet produit est requis.');
      if(typeof key!=='string' || !/^[\w-]{16,100}$/.test(key))throw new InputError('Idempotency-Key requis (16 à 100 caractères).');
      const raw=input.product ?? input;
      const source=parseImport(JSON.stringify(raw));
      source.sourceUrl=productUrl(source.sourceUrl).href;
      const productPrompt=input.productPrompt ?? '';if(typeof productPrompt!=='string' || productPrompt.length>4000)throw new InputError('Consigne produit trop longue.');
      const options=input.options ?? {};pricing(source.cost,options);
      const hash=createHash('sha256').update(JSON.stringify(input)).digest('hex');
      const style=await styles.load();let created=false;
      const item=await imports.update(data=>{
        const prior=Object.values(data).find(i=>i.key===key);
        if(prior){if(prior.hash!==hash)throw new InputError('Clé d’import déjà utilisée pour un autre produit.',409);return prior;}
        if(Object.keys(data).length>=500)throw new InputError('Limite de 500 imports atteinte. Archivez les données serveur.',409);
        if(pending.size>=20)throw new InputError('File de génération pleine. Réessayez plus tard.',429);
        const id=randomUUID(),now=new Date().toISOString();created=true;
        return data[id]={id,key,hash,raw,source,options,templates:style,productPrompt,status:'queued',gallery:[],createdAt:now,updatedAt:now,error:null};
      });
      if(created)enqueue(item.id,()=>processItem(item.id));
      return item;
    },
    async retry(id,input={}) {
      const item=await get(id);
      if(pending.has(id) || running.has(item.status))throw new InputError('Génération déjà en cours.',409);
      if(pending.size>=20)throw new InputError('File de génération pleine.',429);
      const index=input.index;
      if(index!==undefined && (!Number.isInteger(index) || index<0 || index>2))throw new InputError('Image invalide.');
      if(input.productPrompt!==undefined && (typeof input.productPrompt!=='string' || input.productPrompt.length>4000))throw new InputError('Consigne produit invalide.');
      const style=input.useCurrentTemplates?await styles.load():item.templates;
      if(pending.has(id))throw new InputError('Génération déjà en cours.',409);
      pending.add(id);
      try{await patch(id,{status:'queued',error:null,productPrompt:input.productPrompt ?? item.productPrompt,templates:style});}
      catch(e){pending.delete(id);throw e;}
      enqueue(id,()=>processItem(id,index));return get(id);
    },
    async replace(id,index,b64) {
      const item=await get(id);if(pending.has(id))throw new InputError('Patientez pendant la génération.',409);
      if(!item.listing || !Number.isInteger(index) || index<0 || index>2 || typeof b64!=='string' || b64.length>11000000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64))throw new InputError('Image de remplacement invalide (8 Mo maximum).');
      const bytes=Buffer.from(b64,'base64');if(bytes.length>8*1024*1024)throw new InputError('Image trop volumineuse.',413);
      const format=imageFormat(bytes);pending.add(id);
      try {
      const url=await storeImage(dataDir,bytes,format);
      item.gallery[index]={url,mode:'uploaded',type:Object.keys(defaultTemplates.types)[index],createdAt:new Date().toISOString()};
      await patch(id,{gallery:item.gallery});await persistListing(item);
      if(item.gallery.filter(Boolean).length===3)await patch(id,{status:'ready',error:null});return get(id);
      } finally {pending.delete(id);}
    },
    async prepare(market,input) {
      const listing=validateListing(input);
      if(!/^[a-f0-9-]{36}$/.test(listing.id||''))throw new InputError('Identifiant de fiche invalide.');
      if(listing.importId && pending.has(listing.importId))throw new InputError('Patientez pendant la génération.',409);
      const plan=marketplacePlan(market,listing);
      const base=env.APP_URL || env.RENDER_EXTERNAL_URL || 'http://localhost:3000';
      const images=listing.images.map(u=>u.startsWith('/media/')?new URL(u,base).href:u);
      if(images.some(u=>u.endsWith('.svg')))plan.warnings.push('Remplacez les illustrations de démonstration avant l’envoi.');
      if(images.some(u=>!u.startsWith('https:')))plan.warnings.push('Les images locales nécessitent une URL publique HTTPS pour la marketplace.');
      if(market==='ebay'){plan.payload.inventoryItem.product.imageUrls=images;plan.steps=['Créer un article de stock','Créer une offre NON PUBLIÉE'];}
      else {plan.payload.images=images;plan.steps=['Créer la fiche Etsy en état draft','Ajouter les images et le stock'];}
      const prepared={...plan,preparedAt:new Date().toISOString(),localOnly:true};
      await saveDraft({...listing,preparedDrafts:{...listing.preparedDrafts,[market]:prepared},updatedAt:new Date().toISOString()});
      return prepared;
    }
  };
}
