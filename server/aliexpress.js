import { InputError, parseImport } from './listing.js';

const hosts = new Set(['aliexpress.com','www.aliexpress.com','fr.aliexpress.com','m.aliexpress.com','aliexpress.us','www.aliexpress.us']);
export function productUrl(value) {
  let u;
  try { u=new URL(value); } catch { throw new InputError('Collez une URL AliExpress valide.'); }
  if(u.protocol!=='https:' || !hosts.has(u.hostname) || u.port || u.username || u.password || !/^\/item\/\d+\.html$/.test(u.pathname)) {
    throw new InputError('Utilisez le lien complet HTTPS de la fiche AliExpress : https://www.aliexpress.com/item/123456789.html');
  }
  u.search='';u.hash='';return u;
}
const decode = value => String(value || '').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#(\d+);/g,(_,n)=>Number(n)<=0x10ffff?String.fromCodePoint(Number(n)):'');
function attributes(tag) {
  const attrs={};
  for(const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[m[1].toLowerCase()]=decode(m[2] ?? m[3]);
  return attrs;
}
export function extractProduct(html,url) {
  const meta={};
  for(const tag of html.match(/<meta\b[^>]*>/gi)||[]) {const a=attributes(tag);meta[a.property || a.name]=a.content;}
  let product;
  function visit(value,depth=0) {
    if(!value || typeof value!=='object' || depth>12 || product)return;
    const types=Array.isArray(value['@type'])?value['@type']:[value['@type']];
    if(types.includes('Product')) {product=value;return;}
    for(const item of Array.isArray(value)?value:Object.values(value)) visit(item,depth+1);
  }
  for(const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if(attributes(script[1]).type!=='application/ld+json')continue;
    try{visit(JSON.parse(script[2]));}catch{/* Broken structured data is ignored; never execute page scripts. */}
  }
  const title=product?.name || meta['og:title'];
  if(!title || /captcha|access denied|verify.*human|security check|just a moment/i.test(title)) throw new InputError('AliExpress ne fournit pas les données de cette page. Réessayez avec le lien complet ou utilisez l’import via extension.',422);
  const offers=Array.isArray(product?.offers)?product.offers[0]:product?.offers;
  const amount=offers?.price ?? offers?.lowPrice ?? meta['product:price:amount'] ?? meta['og:price:amount'];
  let images=product?.image || meta['og:image'] || [];
  if(!Array.isArray(images))images=[images];
  images=images.map(i=>typeof i==='object'?i.url:i).filter(Boolean);
  // Generic login/home pages can have an og:title; require actual product evidence.
  if(!product && (amount==null || !images.length)) throw new InputError('La page AliExpress charge ses données avec JavaScript ou bloque l’accès. Configurez un service d’extraction ou utilisez l’import via extension.',422);
  const specifics={};
  for(const p of Array.isArray(product?.additionalProperty)?product.additionalProperty:[]) if(typeof p.name==='string' && typeof p.value==='string')specifics[p.name]=p.value;
  return parseImport(JSON.stringify({sourceTitle:decode(title),description:decode(product?.description || meta['og:description'] || ''),price:amount,currency:offers?.priceCurrency || meta['product:price:currency'] || 'EUR',images,specifics,materials:typeof product?.material==='string'?[product.material]:[],variants:(Array.isArray(product?.hasVariant)?product.hasVariant:[]).map(v=>v.name).filter(Boolean),sourceUrl:url}));
}
async function limitedText(response,max=3000000) {
  if(Number(response.headers.get('content-length'))>max) throw new InputError('La page reçue est trop volumineuse.',422);
  const reader=response.body?.getReader();if(!reader)throw new InputError('Réponse vide du service d’extraction.',502);
  let size=0;const chunks=[];
  try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max)throw new InputError('La page reçue est trop volumineuse.',422);chunks.push(value);}}
  finally{await reader.cancel();}
  return Buffer.concat(chunks).toString('utf8');
}
export async function importUrl(value,env=process.env,request=fetch) {
  const url=productUrl(value);
  try {
    // Optional operator-configured extractor: never take its URL or key from the browser.
    if(env.SCRAPER_API_URL) {
      const endpoint=new URL(env.SCRAPER_API_URL);
      if(endpoint.protocol!=='https:')throw new InputError('Le service d’extraction serveur doit utiliser HTTPS.',409);
      const response=await request(endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(25000),headers:{'Content-Type':'application/json',...(env.SCRAPER_API_KEY?{Authorization:`Bearer ${env.SCRAPER_API_KEY}`}:{})},body:JSON.stringify({url:url.href})});
      if(!response.ok)throw new InputError('Le service d’extraction a refusé la demande. Vérifiez sa configuration serveur.',502);
      const data=JSON.parse(await limitedText(response,200000));
      const source=parseImport(JSON.stringify(data.product || data));
      source.sourceUrl=url.href;return {source,method:'provider',warnings:source.cost===null?['Prix absent : renseignez le coût fournisseur.']:[]};
    }
    let current=url;
    for(let redirects=0;redirects<4;redirects++) {
      const response=await request(current,{redirect:'manual',signal:AbortSignal.timeout(20000),headers:{Accept:'text/html','Accept-Language':'fr-FR,fr;q=0.9,en;q=0.8','User-Agent':'DropStudio/1.0 (product metadata importer)'}});
      if([301,302,303,307,308].includes(response.status)) {
        await response.body?.cancel();current=productUrl(new URL(response.headers.get('location'),current).href);continue;
      }
      if(!response.ok)throw new InputError('AliExpress bloque l’import direct de ce lien. Utilisez un service d’extraction configuré ou l’import via extension.',422);
      const source=extractProduct(await limitedText(response),url.href);
      return {source,method:'metadata',warnings:['Import des informations publiques : vérifiez le prix, les images et les variantes avant utilisation.',...(source.cost===null?['Prix absent : renseignez le coût fournisseur.']:[])]};
    }
    throw new InputError('Trop de redirections AliExpress. Utilisez le lien complet du produit.',422);
  } catch(e) {
    if(e instanceof InputError)throw e;
    throw new InputError('Impossible de récupérer cette annonce. AliExpress peut exiger un navigateur. Configurez le service d’extraction ou utilisez l’extension.',502);
  }
}
