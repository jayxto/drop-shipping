chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
let sending=false;
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(message?.type!=='DROP_STUDIO_SEND')return;
  // Content scripts and arbitrary web pages must never access the import token.
  if(sender.id!==chrome.runtime.id || sender.url!==chrome.runtime.getURL('popup.html')){reply({ok:false,error:'Envoi non autorisé.'});return;}
  if(sending){reply({ok:false,error:'Un envoi est déjà en cours.'});return;}
  sending=true;
  (async()=>{
    const data=await chrome.storage.local.get(['studioBase','studioToken','studioPending']);
    const base=new URL(data.studioBase||'');
    if(base.username || base.password || base.pathname!=='/' || base.search || base.hash || (base.protocol!=='https:' && !(base.protocol==='http:' && ['localhost','127.0.0.1'].includes(base.hostname))))throw Error('Configurez une adresse de studio HTTPS valide.');
    if(!data.studioToken || data.studioToken.length<32)throw Error('Configurez le jeton d’import du studio.');
    if(!await chrome.permissions.contains({origins:[base.origin+'/*']}))throw Error('Enregistrez la connexion pour autoriser cette adresse.');
    const product={...message.product};delete product.scrapedAt;
    const body=JSON.stringify({product});
    if(body.length>200000)throw Error('Produit trop volumineux. Réduisez les données sélectionnées.');
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(base.origin+body)))).map(x=>x.toString(16).padStart(2,'0')).join('');
    const key=data.studioPending?.hash===hash?data.studioPending.key:crypto.randomUUID();
    await chrome.storage.local.set({studioPending:{hash,key}});
    let response;try{response=await fetch(base.origin+'/api/import-extension',{method:'POST',credentials:'omit',redirect:'error',headers:{'Content-Type':'application/json','Authorization':'Bearer '+data.studioToken,'Idempotency-Key':key},body,signal:AbortSignal.timeout(25000)});}catch{throw Error('Studio inaccessible. Vérifiez l’adresse et réessayez ; la même clé évitera un doublon.');}
    let result;try{result=await response.json();}catch{throw Error('Le serveur ne répond pas au format attendu. Vérifiez l’adresse du studio.');}
    if(!response.ok)throw Error(result.error||'Import refusé (HTTP '+response.status+').');
    if(!/^[a-f0-9-]{36}$/.test(result.id))throw Error('Réponse du studio invalide.');
    reply({ok:true,studioUrl:base.origin+'/?import='+result.id});
  })().catch(e=>reply({ok:false,error:e.message||'Envoi impossible.'})).finally(()=>{sending=false;});
  return true;
});
