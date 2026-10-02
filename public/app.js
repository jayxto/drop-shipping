import {mountWorkspace,updateVariantOptions,loadSettings,loadHistory,confirmPublication} from './workspace.js';
mountWorkspace();
const $ = id => document.getElementById(id);
let config, listing, drafts = [], busy = false, noticeTimer;
const money = (n,c=listing?.currency || 'EUR') => new Intl.NumberFormat('fr-FR',{style:'currency',currency:c}).format(n);
const split = (s,delimiter=',') => s.split(delimiter).map(x=>x.trim()).filter(Boolean);
function notify(message,error=false) {
  $('notice').textContent=message; $('notice').classList.toggle('error',error); $('notice').hidden=false;
  clearTimeout(noticeTimer); noticeTimer=setTimeout(()=>$('notice').hidden=true,8000);
}
async function api(path,data) {
  const res=await fetch('/api/'+path,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json','X-CSRF-Token':config?.csrf || ''}:{},body:data?JSON.stringify(data):undefined});
  const result=await res.json();
  if(!res.ok) { const e=new Error(result.error || 'Une erreur est survenue.'); e.plan=result.plan; throw e; }
  return result;
}
async function refreshConfig() {
  config=await api('config');
  $('mode').textContent=config.generation==='demo'?'● Mode démo':'● IA connectée';
  $('generationHelp').textContent=config.generation==='demo'?'Démo locale · génération déterministe, sans IA':'Génération IA · les données seront transmises à OpenAI';
  for(const m of ['etsy','ebay']) $(m+'State').textContent=config.connections[m]?'Connecté · enregistré sur le serveur':'Non connecté';
  const demo=config.marketplaceMode==='demo';
  document.querySelector('.publish-panel .pill').textContent=demo?'MODE TEST':'PUBLICATION';
  document.querySelector('.publish-panel .subtext').textContent=demo?'Testez le parcours d’envoi. Aucune annonce ne sera mise en ligne.':`Un récapitulatif sera demandé avant l’envoi. eBay : ${config.ebaySandbox?'Sandbox (test)':'production'}. Etsy : boutique réelle.`;
  $('publishEtsy').querySelector('span').textContent=demo?'Simuler sur Etsy':'Préparer pour Etsy';
  $('publishEbay').querySelector('span').textContent=demo?'Simuler sur eBay':'Préparer pour eBay';
}
function page(name) {
  document.querySelectorAll('.page').forEach(el=>el.hidden=el.id!==name);
  document.querySelectorAll('.nav').forEach(el=>el.classList.toggle('active',el.dataset.page===name));
  $('breadcrumb').textContent={studio:'Atelier de fiches',drafts:'Mes brouillons',connections:'Connexions',settings:'Réglages',history:'Historique'}[name];
  if(name==='settings')loadSettings(api).catch(e=>notify(e.message,true));
  if(name==='history')loadHistory(api).catch(e=>notify(e.message,true));
  window.scrollTo({top:0,behavior:'smooth'});
}
document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>page(b.dataset.page)));
async function refreshDrafts() {
  drafts=(await api('drafts')).drafts; $('draftCount').textContent=drafts.length;
  $('draftList').replaceChildren();
  if(!drafts.length) { const p=document.createElement('p'); p.textContent='Aucun brouillon pour le moment. Générez une fiche dans l’atelier puis enregistrez-la.'; $('draftList').append(p); }
  drafts.forEach(d=>{
    const card=document.createElement('section'); card.className='panel draft-card';
    const title=document.createElement('h2'); title.textContent=d.title;
    const details=document.createElement('p'); details.textContent=`${money(d.price,d.currency)} · ${new Date(d.updatedAt).toLocaleString('fr-FR')}`;
    const badge=document.createElement('span'); badge.className='pill'; badge.textContent=d.generation==='openai'?'IA · BROUILLON':'DÉMO · BROUILLON';
    const button=document.createElement('button'); button.className='secondary'; button.textContent='Ouvrir la fiche →';
    button.onclick=()=>{
      listing=structuredClone(d);
      $('productUrl').value='';
      if(d.source) $('raw').value=JSON.stringify(d.source,null,2);
      for(const key of ['multiplier','shipping','fees']) if(d.pricing?.[key]!==undefined) $(key).value=d.pricing[key];
      $('sourceSummary').hidden=true; populate(); page('studio');
    };
    card.append(badge,title,details,button); $('draftList').append(card);
  });
}
function populate() {
  for(const key of ['title','description','price','currency','category']) $(key).value=listing[key] ?? '';
  for(const key of ['tags','materials','variants','images']) $(key).value=(listing[key] || []).join(['tags','materials'].includes(key)?', ':'\n');
  $('quantity').value=listing.quantity || '';
  $('specifics').value=Object.entries(listing.specifics || {}).map(([k,v])=>`${k} : ${v}`).join('\n');
  for(const key of ['verified','isSupply','etsyEligible'])$(key).checked=Boolean(listing[key]);
  for(const key of ['whoMade','whenMade'])$(key).value=listing[key] || '';
  updateVariantOptions(listing);
  $('editor').hidden=false; $('emptyEditor').hidden=true;
  $('editorStatus').textContent=listing.generation==='openai'?'GÉNÉRÉE PAR IA':'BROUILLON DÉMO';
  $('publishEtsy').disabled=false; $('publishEbay').disabled=false;
  $('publishResult').hidden=true;
  document.querySelectorAll('.step').forEach(el=>el.classList.add('active'));
  updatePreview(); renderImages();
}
function collect() {
  if(!listing) return;
  const previous=listing.images.join('\n');
  for(const key of ['title','description','currency','category']) listing[key]=$(key).value;
  listing.price=Number($('price').value);
  const oldVariants=listing.variants.join('\n');
  listing.quantity=Number($('quantity').value);listing.selectedVariant=$('selectedVariant').value;
  for(const key of ['verified','isSupply','etsyEligible'])listing[key]=$(key).checked;
  for(const key of ['whoMade','whenMade'])listing[key]=$(key).value;
  listing.specifics=Object.fromEntries(split($('specifics').value,'\n').map(line=>{const i=line.indexOf(':');return i>0?[line.slice(0,i).trim(),line.slice(i+1).trim()]:null;}).filter(Boolean));
  for(const key of ['tags','materials','variants','images']) listing[key]=split($(key).value,['tags','materials'].includes(key)?',':'\n');
  if(oldVariants!==listing.variants.join('\n'))updateVariantOptions(listing);
  updatePreview(); if(previous!==listing.images.join('\n')) renderImages();
  $('publishResult').hidden=true;
}
function updatePreview() {
  $('titleCount').textContent=`${listing.title.length} / 140`;
  $('previewTitle').textContent=listing.title || 'Titre à renseigner';
  $('previewDescription').textContent=listing.description;
  $('previewPrice').textContent=money(listing.price);
  $('previewKicker').textContent=listing.generation==='openai'?'VOTRE FICHE · GÉNÉRÉE PAR IA':'VOTRE FICHE · DÉMONSTRATION';
  $('previewTags').replaceChildren(...listing.tags.map(t=>{const span=document.createElement('span');span.textContent=t;return span;}));
  $('cost').textContent=listing.source?.cost==null?'À renseigner':money(listing.source.cost,listing.source.currency);
  const p=listing.pricing;
  $('profit').textContent=listing.source?.cost==null || listing.currency!==listing.source.currency?'À recalculer':money(listing.price*(1-(p?.fees || 0)/100)-listing.source.cost-(p?.shipping || 0));
}
function renderImages() {
  const images=listing.images.filter(u=>{try{return new URL(u).protocol==='https:';}catch{return false;}});
  $('imageLabel').textContent=images.length?`${images.length} IMAGE(S) PRODUIT`:'ILLUSTRATION · AUCUNE IMAGE IMPORTÉE';
  $('productImage').src=images[0] || '/sample-product.svg';
  $('productImage').alt=images.length?listing.title:'Illustration de présentation, pas une photo du produit';
  $('thumbnails').replaceChildren(...images.map((url,i)=>{
    const b=document.createElement('button'); b.type='button'; b.setAttribute('aria-label',`Afficher l’image ${i+1}`);
    const img=document.createElement('img'); img.src=url; img.alt=`Image ${i+1}`; img.referrerPolicy='no-referrer';
    b.append(img); b.onclick=()=>{ $('productImage').src=url; $('imageLabel').textContent=`IMAGE ${i+1} / ${images.length}`; }; return b;
  }));
}
$('productImage').addEventListener('error',()=>{if(!$('productImage').src.endsWith('/sample-product.svg')){$('productImage').src='/sample-product.svg';$('imageLabel').textContent='IMAGE INDISPONIBLE · ILLUSTRATION';}});
$('editor').addEventListener('input',collect);
$('loadSample').onclick=async()=>{
  try { $('productUrl').value=''; $('raw').value=JSON.stringify(await (await fetch('/sample.json')).json(),null,2); await inspectImport(); notify('Exemple chargé. Cliquez sur Générer ma fiche.'); }
  catch { notify('Impossible de charger l’exemple.',true); }
};
async function inspectImport() {
  const {source}=await api('import',{raw:$('raw').value});
  $('sourceSummary').textContent=`${source.title} · ${source.cost===null?'coût à vérifier':money(source.cost,source.currency)} · ${source.images.length} image(s) · ${source.variants.length} variante(s)`;
  $('sourceSummary').hidden=false;
}
$('raw').addEventListener('input',()=>{$('sourceSummary').hidden=true;});
$('productUrl').addEventListener('input',()=>{$('sourceSummary').hidden=true;});
$('file').onchange=async e=>{
  const file=e.target.files[0]; if(!file)return;
  if(file.size>200000)return notify('Fichier trop volumineux (200 Ko maximum).',true);
  try {$('productUrl').value='';$('raw').value=await file.text();await inspectImport();} catch(e){notify(e.message,true);} finally{e.target.value='';}
};
$('generate').onclick=async()=>{
  if(busy)return;
  if(listing && !confirm('Générer une nouvelle fiche remplacera les modifications affichées. Continuer ?'))return;
  for(const key of ['multiplier','shipping','fees'])if(!$(key).reportValidity())return;
  busy=true; $('generate').disabled=true; $('generate').textContent='✦ Création de votre fiche…';
  try {
    let warnings=[];
    if($('productUrl').value.trim()) {
      if(!$('productUrl').reportValidity())return;
      $('generate').textContent='↓ Chargement de l’annonce dans le navigateur…';
      const imported=await api('import-url',{url:$('productUrl').value.trim()});
      $('raw').value=JSON.stringify(imported.source); warnings=imported.warnings || [];
      $('generate').textContent='✦ Création de votre fiche…';
    }
    await inspectImport();
    const result=await api('generate',{raw:$('raw').value,options:{multiplier:Number($('multiplier').value),shipping:Number($('shipping').value),fees:Number($('fees').value)}});
    listing=result.listing; populate(); notify('Fiche créée. Vous pouvez modifier chaque champ.');
    if(warnings.length) $('sourceSummary').textContent+=' · '+warnings.join(' ');
  } catch(e){notify(e.message,true);} finally{busy=false;$('generate').disabled=false;$('generate').textContent='✦ Générer ma fiche →';}
};
$('editor').onsubmit=async e=>{
  e.preventDefault();collect();
  const button=e.submitter; button.disabled=true;
  try {listing=(await api('drafts',{listing})).listing;await refreshDrafts();notify('Brouillon enregistré sur ce serveur.');}
  catch(e){notify(e.message,true);} finally{button.disabled=false;}
};
function download(name,data) {
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('export').onclick=()=>{collect();download(`fiche-${listing.id}.json`,{...listing,selectedImageUrls:listing.images});};
function showPlan(result) {
  const box=$('publishResult');box.replaceChildren();box.hidden=false;
  const title=document.createElement('strong');title.textContent=result.message || 'Préparation API · aucune publication';
  const ul=document.createElement('ul');
  for(const w of result.plan.warnings){const li=document.createElement('li');li.textContent=w;ul.append(li);}
  const details=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');
  summary.textContent='Voir le plan API';pre.textContent=JSON.stringify(result.plan,null,2);details.append(summary,pre);
  const button=document.createElement('button');button.className='ghost';button.textContent='↓ Télécharger le plan';button.onclick=()=>download(`${result.plan.market}-plan.json`,result.plan);
  box.append(title,ul,details,button);
}
for(const market of ['etsy','ebay']){
  const button=$(market==='etsy'?'publishEtsy':'publishEbay');
  button.onclick=async()=>{
    collect();if(!listing)return;button.disabled=true;const snapshot=structuredClone(listing);
    try {
      if(config.marketplaceMode==='demo'){showPlan(await api(`publish/${market}`,{listing:snapshot}));return;}
      const prepared=await api(`prepare/${market}`,{listing:snapshot});
      if(!await confirmPublication(prepared))return;
      const result=await api(`publish/${market}`,{listing:snapshot,confirmation:prepared.confirmation});
      $('publishResult').replaceChildren();$('publishResult').hidden=false;
      const p=document.createElement('p');p.textContent=result.sandbox?'Annonce créée dans eBay Sandbox.':'Annonce publiée avec succès.';
      const a=document.createElement('a');a.textContent='Voir l’annonce ↗';a.href=result.url;a.target='_blank';a.rel='noopener noreferrer';$('publishResult').append(p,a);
      notify(p.textContent);
    }catch(e){notify(e.message,true);}finally{button.disabled=false;}
  };
}
$('settingsForm').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;try{await api('settings',{settings:Object.fromEntries(new FormData(e.target))});await refreshConfig();await loadSettings(api);notify('Réglages enregistrés.');}catch(e){notify(e.message,true);}finally{button.disabled=false;}};
$('refreshHistory').onclick=()=>loadHistory(api).catch(e=>notify(e.message,true));
document.querySelectorAll('[data-connect]').forEach(b=>b.onclick=async()=>{
  b.disabled=true;try{const {url}=await api(`oauth/${b.dataset.connect}/start`,{});window.location.assign(url);}catch(e){notify(e.message,true);b.disabled=false;}
});
document.querySelectorAll('[data-disconnect]').forEach(b=>b.onclick=async()=>{
  try {await api(`oauth/${b.dataset.disconnect}/disconnect`,{});await refreshConfig();notify('Compte déconnecté du serveur.');}catch(e){notify(e.message,true);}
});
try {await refreshConfig();await refreshDrafts();if(new URLSearchParams(location.search).has('connected')){page('connections');history.replaceState(null,'','/');notify('Compte connecté. Vérifiez les réglages avant publication.');}}
catch(e){notify('Connexion au serveur impossible. Rechargez la page. '+e.message,true);}
