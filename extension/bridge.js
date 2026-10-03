// Tabs already open when the extension is installed/reloaded have no receiver.
// Recover only this transport failure; never retry a product extraction error.
async function readAliExpressProduct(tab) {
  let url;try{url=new URL(tab?.url||'');}catch{}
  if(!url || url.protocol!=='https:' || !/(^|\.)aliexpress\.(com|us)$/.test(url.hostname) || !/^\/(item|i)\/\d+(\.html)?\/?$/.test(url.pathname))throw Error('Ouvrez une fiche produit AliExpress.');
  let response;
  try {response=await chrome.tabs.sendMessage(tab.id,{type:'ALI_SCRAPE'});}
  catch(error) {
    if(!/receiving end does not exist|could not establish connection/i.test(error.message||''))throw Error('La page ne répond plus. Rechargez la fiche AliExpress puis réessayez.');
    try {
      await chrome.scripting.executeScript({target:{tabId:tab.id},files:['aliexpress.js']});
      response=await chrome.tabs.sendMessage(tab.id,{type:'ALI_SCRAPE'});
    }catch{throw Error('Impossible de lire cet onglet. Autorisez l’extension sur AliExpress, rechargez la fiche puis réessayez.');}
  }
  if(!response?.ok || !response.data)throw Error('Extraction impossible. Attendez le chargement de la fiche AliExpress puis réessayez.');
  return response.data;
}
