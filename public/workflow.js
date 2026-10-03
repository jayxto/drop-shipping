const $=id=>document.getElementById(id);
const labels={queued:'En attente',generating_listing:'Création de la fiche…',generating_images:'Création des images…',ready:'Prêt à relire',failed:'Échec — progression conservée',interrupted:'Interrompu — reprise nécessaire'};
const active=s=>['queued','generating_listing','generating_images'].includes(s);
const button=(text,fn)=>{const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent=text;b.onclick=fn;return b;};
export function mountWorkflow({api,notify,openListing,collectListing,showPlan}) {
  document.querySelector('#studio .steps').insertAdjacentHTML('afterend',`<section class="panel workflow-panel"><div class="panel-heading"><h2>Imports de l’extension</h2><button type="button" id="refreshImports" class="ghost">Actualiser</button></div><p>Sur AliExpress, cliquez sur « Envoyer à Drop Studio ». La fiche et trois visuels sont préparés automatiquement.</p><div id="importList" class="import-list" aria-live="polite"></div><div id="importDetail" hidden><h3 id="importTitle"></h3><p id="importStatus" role="status"></p><label for="productPrompt">Consigne image pour ce produit</label><textarea id="productPrompt" rows="3" maxlength="4000" placeholder="Ajoutez ici les détails propres à ce produit…"></textarea><label class="check-row"><input id="currentTemplates" type="checkbox">Utiliser les derniers modèles de style pour la prochaine génération</label><div id="importActions" class="button-row"></div><div id="generatedGallery" class="generated-gallery"></div></div></section>`);
  $('settingsForm').insertAdjacentHTML('afterend',`<section class="panel"><h2>Votre style d’image</h2><p>Collez le prompt exact trouvé dans ChatGPT. Le texte est conservé tel quel. Chaque import garde une copie de vos modèles.</p><p id="imageMode"></p><form id="templateForm"><label for="globalPrompt">Style global</label><textarea id="globalPrompt" maxlength="6000" rows="4"></textarea>${['packshot','lifestyle','detail'].map(t=>`<label for="prompt-${t}">${{packshot:'Packshot',lifestyle:'Mise en situation',detail:'Gros plan'}[t]}</label><textarea id="prompt-${t}" maxlength="4000" rows="3"></textarea>`).join('')}<button class="primary">Enregistrer les modèles</button></form><p>La clé et les modèles OpenAI se configurent uniquement dans les variables d’environnement du serveur.</p></section>`);
  const prep=document.createElement('div');prep.className='button-row';
  for(const market of ['etsy','ebay'])prep.append(button('Préparer le brouillon '+market,async()=>{try{const listing=collectListing();if(!listing)throw Error('Ouvrez d’abord une fiche.');const result=await api('draft-plan/'+market,{listing});showPlan(result);notify(result.message);}catch(e){notify(e.message,true);}}));
  document.querySelector('.publish-panel .market-buttons').before(prep);
  let selected=new URLSearchParams(location.search).get('import'),current,lastStatus,refreshing=false;
  const action=fn=>async()=>{try{await fn();await refresh();}catch(e){notify(e.message,true);}};
  function renderDetail(item) {
    const changed=current?.id!==item.id;
    current=item;$('importDetail').hidden=false;$('importTitle').textContent=item.source.title;
    $('importStatus').textContent=(labels[item.status] || item.status)+(item.error?' · '+item.error:'');
    if(changed)$('productPrompt').value=item.productPrompt;
    const inProgress=active(item.status);
    $('importActions').replaceChildren();
    if(item.listing && !inProgress)$('importActions').append(button('Ouvrir la fiche modifiable',action(async()=>{const {drafts}=await api('drafts');openListing(drafts.find(d=>d.id===item.id)||item.listing);})));
    if(!inProgress && item.status!=='ready')$('importActions').append(button('Reprendre les étapes manquantes',action(()=>api('imports/'+item.id+'/retry',{productPrompt:$('productPrompt').value,useCurrentTemplates:$('currentTemplates').checked}))));
    const gallery=$('generatedGallery');gallery.replaceChildren();
    for(const [index,type] of ['packshot','lifestyle','detail'].entries()) {
      const asset=item.gallery[index],card=document.createElement('section');card.className='generated-card';
      const h=document.createElement('h4');h.textContent=type;card.append(h);
      if(asset){const img=document.createElement('img');img.src=asset.url;img.alt=type+' — '+(asset.mode==='demo'?'illustration fictive':item.source.title);card.append(img);const label=document.createElement('p');label.textContent={demo:'DÉMO · illustration fictive',openai:'Image IA · vérifier la fidélité',uploaded:'Image remplacée'}[asset.mode];card.append(label);
        const details=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');summary.textContent='Prompt utilisé';pre.textContent=asset.prompt || 'Image importée manuellement';details.append(summary,pre);card.append(details);}
      else {const p=document.createElement('p');p.textContent='Image en attente';card.append(p);}
      if(item.listing && !inProgress){card.append(button('Régénérer',action(()=>api('imports/'+item.id+'/retry',{index,productPrompt:$('productPrompt').value,useCurrentTemplates:$('currentTemplates').checked}))));
        const label=document.createElement('label');label.textContent='Remplacer (PNG, JPEG, WebP · 8 Mo)';const input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg,image/webp';
        input.onchange=action(async()=>{const f=input.files[0];if(!f)return;if(f.size>8*1024*1024)throw Error('8 Mo maximum.');input.disabled=true;const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=reject;reader.readAsDataURL(f);});await api('imports/'+item.id+'/replace',{index,base64});notify('Image remplacée et enregistrée.');});label.append(input);card.append(label);}
      gallery.append(card);
    }
  }
  async function refresh() {
    if(refreshing)return;refreshing=true;
    try {
      const {imports}=await api('imports');$('importList').replaceChildren();
      if(!imports.length)$('importList').textContent='Aucun import reçu. Configurez l’adresse du studio et le jeton d’import dans l’extension.';
      for(const item of imports)$('importList').append(button(item.source.title+' · '+(labels[item.status]||item.status),()=>{selected=item.id;renderDetail(item);}));
      const item=imports.find(i=>i.id===selected) || imports[0];
      if(item){selected=item.id;if(current?.id!==item.id || current?.updatedAt!==item.updatedAt)renderDetail(item);if(lastStatus && lastStatus!==item.status && item.status==='ready')notify('Fiche et images prêtes. Ouvrez la fiche pour la relire.');lastStatus=item.status;}
    }finally{refreshing=false;}
  }
  $('refreshImports').onclick=action(refresh);
  $('templateForm').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{await api('image-templates',{templates:{global:$('globalPrompt').value,types:Object.fromEntries(['packshot','lifestyle','detail'].map(k=>[k,$('prompt-'+k).value]))}});notify('Style enregistré. Il sera utilisé pour les nouveaux imports.');}catch(e){notify(e.message,true);}finally{b.disabled=false;}};
  return async()=>{
    const data=await api('image-templates');$('globalPrompt').value=data.templates.global;for(const k of Object.keys(data.templates.types))$('prompt-'+k).value=data.templates.types[k];
    $('imageMode').textContent=data.imageMode==='demo'?'Mode démo : aucun appel image facturé. Les illustrations ne représentent pas le produit.':'OpenAI actif : chaque génération utilise le quota API du serveur.';
    await refresh();setInterval(()=>{if(!document.hidden)refresh().catch(e=>{$('importStatus').textContent='Actualisation impossible : '+e.message;});},5000);
  };
}
