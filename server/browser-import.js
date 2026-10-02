import { InputError, parseImport } from './listing.js';

let active = 0;
// Only resources owned by the marketplace/CDN are allowed. No arbitrary URL proxy.
export function allowedResource(value) {
  try {
    const u=new URL(value);
    return u.protocol==='https:' && !u.port && !u.username && !u.password &&
      ['aliexpress.com','aliexpress.us','alicdn.com','aliexpress-media.com','mmstat.com'].some(d=>u.hostname===d || u.hostname.endsWith('.'+d));
  } catch { return false; }
}

// Executed in a fresh browser context; only reads the rendered document.
export function readRenderedProduct() {
  const text = el => (el?.innerText || el?.textContent || '').trim();
  const visible = el => Boolean(el.getClientRects().length);
  const heading = text(document.querySelector('h1'));
  const barrierText = `${document.title} ${heading} ${text(document.body).slice(0,1800)}`;
  const barrier = /verify (?:that )?you(?:'re| are) human|security verification|access denied|unusual traffic|slide to verify|vérification de sécurité|faites glisser.*vérif/i.test(barrierText) ||
    [...document.querySelectorAll('iframe[src*="captcha"],#nc_1_wrapper,[id*="captcha"]')].some(visible);
  if (barrier) return { barrier:true };
  const title=heading || document.querySelector('meta[property="og:title"]')?.content || '';
  const prices=[...document.querySelectorAll('[class*="price--current"],[class*="price-current"],[class*="price-default"],[class*="price--sale"],[itemprop="price"]')]
    .filter(visible).map(el=>el.getAttribute('content') || text(el)).filter(t=>/\d/.test(t)).slice(0,10);
  const images=[...document.images].filter(el=>visible(el) && (el.naturalWidth || el.width)>=180)
    .map(el=>el.currentSrc || el.src).filter(u=>/^https:\/\/[^/]*aliexpress-media\.com\/kf\//i.test(u));
  const variants=[...document.querySelectorAll('[class*="sku"] button,[class*="sku"] [title],[class*="sku"] [aria-label],[role="radio"]')]
    .filter(visible).map(el=>el.title || el.getAttribute('aria-label') || text(el)).filter(t=>t && t.length<100).slice(0,80);
  const specifics={};
  for(const el of document.querySelectorAll('[class*="specification"] li,[class*="specification"] tr')) {
    const t=text(el),parts=t.split(/[:：]/);if(t.length<220 && parts.length>=2) specifics[parts.shift().trim()]=parts.join(':').trim();
  }
  return { sourceTitle:title, prices, images:[...new Set(images)], variants:[...new Set(variants)], specifics,
    description:document.querySelector('meta[name="description"]')?.content || title };
}

export async function renderProduct(url, env=process.env, dependencies={}) {
  if(active>=2)throw new InputError('Deux imports sont déjà en cours. Réessayez dans un instant.',429);
  active++;
  let browser, timer;
  try {
    let chromium;
    try {chromium=dependencies.chromium || (await import('playwright')).chromium;}
    catch {throw new InputError('Navigateur non installé sur le serveur. Lancez npm install puis npx playwright install chromium.',503);}
    try { browser=await chromium.launch({headless:true,channel:env.BROWSER_CHANNEL || 'chromium',timeout:15000}); }
    catch {throw new InputError('Chromium ne peut pas démarrer. Installez-le avec npx playwright install chromium (Linux : --with-deps).',503);}
    const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{reject(new InputError('Le chargement du produit a dépassé 45 secondes. Réessayez.',504));void browser.close().catch(()=>{});},45000);});
    return await Promise.race([deadline,(async()=>{
      const context=await browser.newContext({locale:'fr-FR',serviceWorkers:'block',acceptDownloads:false});
      await context.route('**/*',async route=>{
        if(allowedResource(route.request().url()))await route.continue();else await route.abort();
      });
      await context.routeWebSocket('**/*',socket=>socket.close());
      const page=await context.newPage();
      page.on('popup',popup=>void popup.close());
      await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:25000});
      // Stop at explicit login/challenge redirects rather than extracting them as a product.
      if(!/^\/item\/\d+\.html$/.test(new URL(page.url()).pathname))throw new InputError('AliExpress demande une connexion ou une vérification. Ouvrez le produit dans votre navigateur et utilisez l’extension.',422);
      try {
        await page.waitForFunction(()=>{
          const blocks=[...document.querySelectorAll('script[type="application/ld+json"]')];
          if(blocks.some(el=>/"Product"/.test(el.textContent) && /"(?:price|lowPrice)"/.test(el.textContent)))return true;
          return Boolean(document.querySelector('h1') && document.querySelector('[class*="price--current"],[class*="price-current"],[class*="price-default"],[class*="price--sale"]') && [...document.images].some(i=>i.complete && i.naturalWidth>=180)) || /security verification|slide to verify|access denied/i.test(document.body?.innerText || '');
        },null,{timeout:15000});
      }catch{/* Inspect the final DOM and report missing data instead of inventing a product. */}
      const dom=await page.evaluate(readRenderedProduct);
      if(dom.barrier)throw new InputError('AliExpress affiche une vérification de sécurité. Le navigateur automatique ne la franchit pas. Utilisez votre navigateur et l’extension.',422);
      const html=await page.content();
      let source;
      try {
        if(html.length>3000000)throw new Error('large page');
        source=dependencies.extractProduct(html,url.href);
      } catch { /* Some pages expose the product only in the rendered DOM. */ }
      if(!source) {
        if(!dom.sourceTitle || !dom.prices?.length || !dom.images?.length)throw new InputError('Le navigateur a chargé la page, mais les informations produit restent indisponibles. Utilisez l’extension sur la fiche ouverte.',422);
        source=parseImport(JSON.stringify({...dom,sourceUrl:url.href}));
      }else{
        if(!source.variants.length)source.variants=dom.variants || [];
        if(!source.images.length)source.images=dom.images || [];
        if(source.cost===null && dom.prices?.length){const parsed=parseImport(JSON.stringify(dom));source.cost=parsed.cost;source.currency=parsed.currency;}
      }
      return {source,method:'browser',warnings:['Produit chargé dans Chromium. Vérifiez le prix de la variante, les images et la livraison avant publication.']};
    })()]);
  } catch(e) {
    if(e instanceof InputError)throw e;
    throw new InputError('Le navigateur n’a pas pu charger cette annonce. Réessayez ou utilisez l’extension sur la fiche ouverte.',502);
  } finally {
    clearTimeout(timer);
    try {await browser?.close();}catch{/* Browser may already be closed by the deadline. */}
    active--;
  }
}
