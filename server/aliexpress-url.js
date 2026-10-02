import { InputError } from './listing.js';

// Check domain boundaries, never a substring: lookalike hosts must not be fetched.
export function isProductUrl(url) {
  return url.protocol==='https:' && !url.port && !url.username && !url.password &&
    ['aliexpress.com','aliexpress.us'].some(domain=>url.hostname===domain || url.hostname.endsWith('.'+domain)) &&
    /^\/(?:item|i)\/\d+(?:\.html)?\/?$/.test(url.pathname);
}

export function productUrl(value) {
  let url;
  try { url=new URL(value); } catch { throw new InputError('Collez une URL AliExpress valide.'); }
  if(!isProductUrl(url))throw new InputError('Utilisez une URL HTTPS de fiche produit AliExpress, par exemple : https://www.aliexpress.com/item/123456789.html');
  const id=url.pathname.match(/\d+/)[0];
  url.pathname=`/item/${id}.html`;
  url.search='';url.hash='';
  return url;
}

export function productRedirect(value,base) {
  let url;
  try { if(value?.trim())url=new URL(value,base); } catch { /* Invalid upstream Location. */ }
  if(!url || !isProductUrl(url))throw new InputError('AliExpress a redirigé vers une page de connexion, de vérification ou une destination non autorisée. Ouvrez la fiche dans votre navigateur et utilisez l’import via extension.',422);
  // Preserve redirect parameters: removing them can cause a redirect loop.
  url.hash='';
  return url;
}
