function studioBase(value) {
  const u=new URL(value);
  if(u.username || u.password || u.search || u.hash || (u.pathname!=='/' && u.pathname!==''))throw Error('Indiquez uniquement l’origine du studio, sans chemin ni identifiants.');
  if(u.protocol!=='https:' && !(u.protocol==='http:' && ['localhost','127.0.0.1'].includes(u.hostname)))throw Error('HTTPS requis (HTTP autorisé uniquement en local).');
  return u.origin;
}
const studioStatus=document.getElementById('studioStatus');
chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
chrome.storage.local.get(['studioBase','studioToken']).then(data=>{document.getElementById('studioBase').value=data.studioBase||'';document.getElementById('studioToken').value=data.studioToken||'';});
document.getElementById('saveStudio').onclick=async()=>{
  try {
    const base=studioBase(document.getElementById('studioBase').value.trim()),token=document.getElementById('studioToken').value.trim();
    if(token.length<32)throw Error('Le jeton d’import doit comporter au moins 32 caractères.');
    const allowed=await chrome.permissions.request({origins:[base+'/*']});
    if(!allowed)throw Error('Autorisez l’accès au studio pour envoyer le produit.');
    await chrome.storage.local.set({studioBase:base,studioToken:token});studioStatus.textContent='Connexion enregistrée sur cet appareil.';
  }catch(e){studioStatus.textContent=e.message;}
};
document.getElementById('sendStudio').onclick=async()=>{
  const b=document.getElementById('sendStudio');b.disabled=true;studioStatus.textContent='Envoi du produit…';
  try {
    const tab=(await chrome.tabs.query({active:true,currentWindow:true}))[0];
    const url=new URL(tab?.url||'');
    if(!/(^|\.)aliexpress\.(com|us)$/.test(url.hostname) || !/^\/(item|i)\/\d+(\.html)?\/?$/.test(url.pathname))throw Error('Ouvrez une fiche produit AliExpress.');
    // Always read the active product; never silently send a stale saved product.
    const result=await chrome.tabs.sendMessage(tab.id,{type:'ALI_SCRAPE'});
    if(!result?.ok)throw Error('Extraction impossible. Rechargez la page produit.');
    const same=source?.sourceUrl===result.data.sourceUrl;
    const product=same?{...result.data,sourceTitle:document.getElementById('rawTitle').value,price:document.getElementById('rawPrice').value,shipping:[document.getElementById('shipping').value],selectedImages:selectedImages()} : result.data;
    const response=await chrome.runtime.sendMessage({type:'DROP_STUDIO_SEND',product});
    if(!response?.ok)throw Error(response?.error||'Envoi interrompu. Réessayez : les doublons sont détectés.');
    studioStatus.textContent='Import enregistré. La génération continue dans Drop Studio.';
    await chrome.tabs.create({url:response.studioUrl});
  }catch(e){studioStatus.textContent=e.message||'Rechargez la fiche AliExpress puis réessayez.';}finally{b.disabled=false;}
};
