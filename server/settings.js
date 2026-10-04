import {InputError} from './listing.js';

export const fields={
  MARKETPLACE_MODE:{label:'Mode de publication',group:'Publication',options:['demo','live']},
  EBAY_SANDBOX:{label:'Environnement eBay',group:'eBay',options:['true','false']},
  EBAY_CLIENT_ID:{label:'Client ID eBay',secret:true,group:'eBay'},EBAY_CLIENT_SECRET:{label:'Client secret eBay',secret:true,group:'eBay'},EBAY_REDIRECT_URI:{label:'RuName eBay',group:'eBay'},
  EBAY_LOCATION_KEY:{label:'Clé de l’emplacement eBay',group:'eBay'},EBAY_PAYMENT_POLICY_ID:{label:'ID politique de paiement',group:'eBay'},EBAY_RETURN_POLICY_ID:{label:'ID politique de retour',group:'eBay'},EBAY_FULFILLMENT_POLICY_ID:{label:'ID politique de livraison',group:'eBay'},
  ETSY_CLIENT_ID:{label:'Keystring Etsy',secret:true,group:'Etsy'},ETSY_SHARED_SECRET:{label:'Shared secret Etsy',secret:true,group:'Etsy'},ETSY_REDIRECT_URI:{label:'URL HTTPS de retour Etsy',group:'Etsy'},ETSY_SHOP_ID:{label:'ID boutique Etsy',group:'Etsy'},ETSY_SHIPPING_PROFILE_ID:{label:'ID profil de livraison Etsy',group:'Etsy'},ETSY_READINESS_STATE_ID:{label:'ID profil de préparation Etsy',group:'Etsy'},ETSY_RETURN_POLICY_ID:{label:'ID politique de retour Etsy',group:'Etsy'},ETSY_CURRENCY:{label:'Devise de la boutique Etsy',group:'Etsy',options:['EUR','USD','GBP']}
};
export function publicSettings(env) {
  return Object.entries(fields).map(([key,f])=>({key,...f,value:f.secret?'':env[key] || (key==='MARKETPLACE_MODE'?'demo':key==='EBAY_SANDBOX'?'true':key==='ETSY_CURRENCY'?'EUR':''),configured:Boolean(env[key])}));
}
export function settingsPatch(input) {
  if(!input || typeof input!=='object' || Array.isArray(input))throw new InputError('Réglages invalides.');
  const patch={};
  for(const [key,value] of Object.entries(input)) {
    if(!fields[key] || typeof value!=='string' || value.length>2000)throw new InputError('Réglage invalide.');
    if(fields[key].secret && !value.trim())continue;
    if(fields[key].options && !fields[key].options.includes(value))throw new InputError('Option invalide.');
    if(key==='ETSY_REDIRECT_URI' && value && !/^https:\/\//.test(value))throw new InputError('Etsy exige une URL HTTPS.');
    patch[key]=value.trim();
  }return patch;
}
