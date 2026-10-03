import {createHash} from 'node:crypto';
import {InputError,validateListing} from './listing.js';
import {readFile} from 'node:fs/promises';
import path from 'node:path';

const identifier=v=>typeof v==='string' && /^[A-Za-z0-9_-]{1,100}$/.test(v);
const numberId=v=>/^\d+$/.test(String(v || ''));
const escapeHTML=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function preparePublication(market,input,env) {
  const l=validateListing(input),missing=[];
  const studioOrigin=env.APP_URL || env.RENDER_EXTERNAL_URL;
  l.images=l.images.map(u=>u.startsWith('/media/') && studioOrigin?new URL(u,studioOrigin).href:u);
  if(l.images.some(u=>!u.startsWith('https:') || u.endsWith('.svg')))missing.push('Remplacer les images démo et utiliser une adresse publique HTTPS pour le studio');
  if(!/^[\da-f-]{36}$/i.test(l.id || ''))missing.push('Identifiant de fiche valide');
  if(l.price<=0)missing.push('Prix supérieur à zéro');
  if(!l.images.length)missing.push('Au moins une image');
  if(!numberId(l.category))missing.push('Identifiant numérique de catégorie');
  if(!Number.isInteger(l.quantity) || l.quantity<1 || l.quantity>999)missing.push('Stock réel entre 1 et 999');
  if(l.condition!=='Neuf')missing.push('Cette version publie uniquement les produits neufs');
  if(l.variants.length && !l.variants.includes(l.selectedVariant))missing.push('Sélectionner la variante à vendre');
  if(l.verified!==true)missing.push('Confirmer les informations produit et les droits sur les images');
  const selected=l.variants.length?l.selectedVariant:'';
  const title=selected?`${l.title} - ${selected}`:l.title;
  const description=selected?`${l.description}\n\nVariante proposée : ${selected}`:l.description;
  if(market==='ebay') {
    if(title.length>80)missing.push('Titre avec variante limité à 80 caractères pour eBay');
    if(l.currency!=='EUR')missing.push('Cette connexion eBay France utilise EUR');
    for(const key of ['EBAY_LOCATION_KEY','EBAY_PAYMENT_POLICY_ID','EBAY_RETURN_POLICY_ID','EBAY_FULFILLMENT_POLICY_ID'])if(!identifier(env[key]))missing.push(key);
    if(!env.EBAY_CLIENT_ID || !env.EBAY_CLIENT_SECRET)missing.push('Identifiants API eBay');
  } else if(market==='etsy') {
    if(title.length>140)missing.push('Titre avec variante limité à 140 caractères pour Etsy');
    if(l.etsyEligible!==true)missing.push('Confirmer l’éligibilité du produit aux règles Etsy');
    if(!['i_did','someone_else','collective'].includes(l.whoMade))missing.push('Indiquer qui a fabriqué le produit');
    if(!['made_to_order','2020_2026','2010_2019','2007_2009','before_2007','2000_2006','1990s','1980s','1970s','1960s','1950s','1940s','1930s','1920s','1910s','1900s','1800s','1700s','before_1700'].includes(l.whenMade))missing.push('Période de fabrication Etsy');
    if(typeof l.isSupply!=='boolean')missing.push('Indiquer si le produit est une fourniture créative');
    for(const key of ['ETSY_SHOP_ID','ETSY_SHIPPING_PROFILE_ID','ETSY_READINESS_STATE_ID','ETSY_RETURN_POLICY_ID'])if(!numberId(env[key]))missing.push(key);
    if(!env.ETSY_CLIENT_ID || !env.ETSY_SHARED_SECRET)missing.push('Identifiants API Etsy');
    if(l.currency!==(env.ETSY_CURRENCY || 'EUR'))missing.push('La devise doit correspondre à celle de la boutique Etsy');
    if(l.images.length>10)missing.push('Maximum 10 images dans cet adaptateur Etsy');
    if(l.images.some(u=>!imageAllowed(u) && !studioAsset(u,env)))missing.push('Pour Etsy, utiliser les images HTTPS AliExpress ou PNG/JPEG générées par ce studio');
  } else throw new InputError('Marketplace inconnue.');
  if(missing.length)throw new InputError('À compléter : '+missing.join(' · '),422);
  return {listing:l,title,description,selected,market,sandbox:market==='ebay' && env.EBAY_SANDBOX!=='false',summary:{title,price:l.price,currency:l.currency,quantity:l.quantity,variant:selected || 'Sans variante',images:l.images.length}};
}
export function imageAllowed(value) {
  try {const u=new URL(value);return u.protocol==='https:' && !u.port && !u.username && !u.password && ['aliexpress-media.com','alicdn.com'].some(d=>u.hostname===d || u.hostname.endsWith('.'+d));}catch{return false;}
}
function studioAsset(value,env={}) {
  try{const origin=new URL(env.APP_URL || env.RENDER_EXTERNAL_URL),u=new URL(value);return u.origin===origin.origin && !u.search && !u.hash && /^\/media\/[a-f0-9-]{36}\.(png|jpg)$/.test(u.pathname)?u.pathname.split('/').pop():null;}catch{return null;}
}
export async function downloadImage(url,request=fetch,env={}) {
  const asset=studioAsset(url,env);
  if(asset && env.DATA_DIR){const data=await readFile(path.join(env.DATA_DIR,'media',asset));if(data.length>8000000)throw new InputError('Image supérieure à 8 Mo.',422);return {data,type:asset.endsWith('.png')?'image/png':'image/jpeg',ext:asset.split('.').pop()};}
  for(let n=0;n<4;n++) {
    if(!imageAllowed(url))throw new InputError('Hébergeur image non autorisé.',422);
    const res=await request(url,{redirect:'manual',signal:AbortSignal.timeout(15000)});
    if([301,302,303,307,308].includes(res.status)){await res.body?.cancel();url=new URL(res.headers.get('location'),url).href;continue;}
    if(!res.ok)throw new InputError('Une image fournisseur est inaccessible.',422);
    const reader=res.body?.getReader();if(!reader)throw new InputError('Image vide.',422);
    let size=0;const chunks=[];
    try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>8000000)throw new InputError('Image supérieure à 8 Mo.',422);chunks.push(value);}}finally{await reader.cancel();}
    const data=Buffer.concat(chunks),png=data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),jpg=data[0]===255 && data[1]===216 && data[2]===255;
    if(!png && !jpg)throw new InputError('Etsy : utilisez des images JPEG ou PNG.',422);
    return {data,type:png?'image/png':'image/jpeg',ext:png?'png':'jpg'};
  }throw new InputError('Trop de redirections image.',422);
}

// One seller, one process. Durable checkpoints prevent duplicate paid publications.
export function publisher(journal,request=fetch) {
  const locks=new Set();
  return async function publish(plan,env,accessToken) {
    const {listing:l,market,title,description,selected,sandbox}=plan;
    const account=market==='etsy'?env.ETSY_SHOP_ID:env.EBAY_CLIENT_ID+':'+(sandbox?'sandbox':'production');
    const key=createHash('sha256').update([market,account,l.id,selected].join(':')).digest('hex');
    if(locks.has(key))throw new InputError('Publication déjà en cours. Attendez le résultat.',409);
    locks.add(key);
    let record;
    const persist=()=>journal.update(data=>{data[key]=record;});
    const apiBase=market==='etsy'?'https://api.etsy.com/v3/application':`https://api.${sandbox?'sandbox.':''}ebay.com/sell/inventory/v1`;
    const headers={Authorization:`Bearer ${accessToken}`,...(market==='etsy'?{'x-api-key':`${env.ETSY_CLIENT_ID}:${env.ETSY_SHARED_SECRET}`}:{'Content-Language':'fr-FR'})};
    async function api(method,route,body) {
      let res;
      const multipart=body instanceof FormData,form=market==='etsy' && !multipart;
      const encoded=body===undefined?undefined:multipart?body:form?new URLSearchParams(Object.entries(body).map(([k,v])=>[k,Array.isArray(v)?v.join(','):String(v)])):JSON.stringify(body);
      try{res=await request(apiBase+route,{method,headers:{...headers,...(multipart?{}:{'Content-Type':form?'application/x-www-form-urlencoded':'application/json'})},body:encoded,signal:AbortSignal.timeout(30000)});}
      catch {const e=new InputError('Réponse marketplace incertaine. Consultez l’historique et votre compte avant de réessayer.',502);e.uncertain=true;throw e;}
      if(!res.ok){throw new InputError(`${market} a refusé l’étape « ${record.step} » (HTTP ${res.status}). Vérifiez la catégorie, les caractéristiques et les profils vendeur.`,422);}
      if(res.status===204)return {};
      try{return await res.json();}catch{const e=new InputError('Réponse marketplace illisible : vérifiez l’état de l’annonce dans votre compte.',502);e.uncertain=true;throw e;}
    }
    async function step(name,fn) {
      if(Object.hasOwn(record.completed,name))return record.completed[name];
      record.step=name;record.status='pending';await persist();
      const result=await fn();record.completed[name]=result;record.status='working';await persist();return result;
    }
    function requireId(data,key) {if(!data?.[key]){const e=new InputError('La marketplace ne confirme pas l’identifiant créé. Vérifiez votre compte.',502);e.uncertain=true;throw e;}return data;}
    try {
      record=(await journal.load())[key];
      if(record?.status==='published')return record.result;
      if(record && ['pending','working','uncertain'].includes(record.status))throw new InputError('Une tentative précédente nécessite une vérification manuelle. Aucun nouvel envoi effectué ; consultez Historique.',409);
      const {updatedAt,...stableListing}=l;
      const fingerprint=createHash('sha256').update(JSON.stringify({l:stableListing,env:Object.fromEntries(Object.keys(env).filter(k=>/^(ETSY_|EBAY_)/.test(k) && !/SECRET|CLIENT_ID/.test(k)).sort().map(k=>[k,env[k]]))})).digest('hex');
      if(record && record.fingerprint!==fingerprint)throw new InputError('Cette tentative possède déjà des étapes enregistrées. Reprenez la même fiche ou vérifiez l’annonce dans votre compte avant de créer une nouvelle fiche.',409);
      if(!record){record={key,market,title,listingId:l.id,variant:selected,status:'working',fingerprint,completed:{},createdAt:new Date().toISOString(),sandbox};await persist();}
      let result;
      if(market==='ebay') {
        const sku='drop-'+key.slice(0,32);
        const aspects=Object.fromEntries(Object.entries(l.specifics || {}).filter(([k,v])=>k.length<=65 && typeof v==='string').map(([k,v])=>[k,[v]]));
        await step('inventaire',()=>api('PUT','/inventory_item/'+sku,{availability:{shipToLocationAvailability:{quantity:l.quantity}},condition:'NEW',product:{title,description:escapeHTML(description).replace(/\n/g,'<br>'),imageUrls:l.images,aspects}}));
        const offer=await step('offre',async()=>requireId(await api('POST','/offer',{sku,marketplaceId:'EBAY_FR',format:'FIXED_PRICE',availableQuantity:l.quantity,categoryId:l.category,merchantLocationKey:env.EBAY_LOCATION_KEY,listingDescription:escapeHTML(description).replace(/\n/g,'<br>'),listingPolicies:{paymentPolicyId:env.EBAY_PAYMENT_POLICY_ID,returnPolicyId:env.EBAY_RETURN_POLICY_ID,fulfillmentPolicyId:env.EBAY_FULFILLMENT_POLICY_ID},pricingSummary:{price:{value:l.price.toFixed(2),currency:l.currency}}}),'offerId'));
        const published=await step('activation',async()=>requireId(await api('POST',`/offer/${encodeURIComponent(offer.offerId)}/publish`,{}),'listingId'));
        result={published:true,sandbox,market,listingId:published.listingId,url:`https://www.${sandbox?'sandbox.':''}ebay.fr/itm/${encodeURIComponent(published.listingId)}`};
      }else{
        // Download all images before creating a paid listing; no secrets sent to image hosts.
        const images=[];for(const image of l.images)images.push(await downloadImage(image,request,env));
        const base=`/shops/${env.ETSY_SHOP_ID}/listings`;
        const draft=await step('brouillon',async()=>requireId(await api('POST',base,{quantity:l.quantity,title,description,price:l.price,who_made:l.whoMade,when_made:l.whenMade,is_supply:l.isSupply,taxonomy_id:Number(l.category),shipping_profile_id:Number(env.ETSY_SHIPPING_PROFILE_ID),readiness_state_id:Number(env.ETSY_READINESS_STATE_ID),return_policy_id:Number(env.ETSY_RETURN_POLICY_ID),tags:l.tags,materials:l.materials,type:'physical'}),'listing_id'));
        for(let i=0;i<images.length;i++)await step('image-'+(i+1),async()=>{const form=new FormData();form.set('image',new Blob([images[i].data],{type:images[i].type}),`product-${i+1}.${images[i].ext}`);form.set('rank',String(i+1));return requireId(await api('POST',`${base}/${draft.listing_id}/images`,form),'listing_image_id');});
        const activated=await step('activation',async()=>{const data=await api('PATCH',`${base}/${draft.listing_id}`,{state:'active'});if(data.state!=='active'){const e=new InputError('Etsy ne confirme pas l’activation. Consultez votre boutique.',502);e.uncertain=true;throw e;}return data;});
        result={published:true,sandbox:false,market,listingId:activated.listing_id || draft.listing_id,url:`https://www.etsy.com/listing/${draft.listing_id}`};
      }
      record.status='published';record.result=result;record.finishedAt=new Date().toISOString();await persist();return result;
    }catch(e){
      // Validation/duplicate guards must not alter an existing uncertain/publication record.
      if(record && e.status!==409){record.status=e.uncertain || !e.status?'uncertain':'failed';record.error=e.status?e.message:'Erreur interne. Vérifiez votre compte vendeur.';await persist();}
      throw e;
    }finally{locks.delete(key);}
  };
}
