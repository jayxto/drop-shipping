import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedResource,renderProduct} from '../server/browser-import.js';
import {importUrl,extractProduct} from '../server/aliexpress.js';

const url=new URL('https://www.aliexpress.com/item/123456789.html');
function fixture({dom,html='',redirect=url.href,lateRedirect,failGoto=false}={}) {
  const calls={closed:0};
  const page={on(){},async goto(){if(failGoto)throw Error('navigation failed');},url:()=>redirect,
    async waitForFunction(){calls.waited=true;if(lateRedirect)redirect=lateRedirect;},async evaluate(){return dom || {sourceTitle:'Produit rendu',prices:['19,95 €'],images:['https://ae01.aliexpress-media.com/kf/test.jpg'],variants:['Bleu']};},async content(){return html;}};
  const context={async route(pattern,fn){calls.route=fn;},async routeWebSocket(){},async newPage(){return page;}};
  const browser={async newContext(options){calls.options=options;return context;},async close(){calls.closed++;}};
  return {calls,chromium:{async launch(opts){calls.launch=opts;return browser;}}};
}
test('le navigateur est utilisé par défaut, sans requête HTML préalable',async()=>{
  let called=false;
  const r=await importUrl(url.href,{},()=>{throw Error('static fetch should not run');},async(u,env,deps)=>{called=true;assert.equal(u.href,url.href);assert.equal(deps.extractProduct,extractProduct);return {method:'browser'};});
  assert.equal(called,true);assert.equal(r.method,'browser');
});
test('isolation réseau : refuse IP locales, HTTP, ports et domaines trompeurs',()=>{
  assert.equal(allowedResource('https://ae01.aliexpress-media.com/kf/image.jpg'),true);
  for(const bad of ['http://127.0.0.1','https://127.0.0.1','https://aliexpress.com.evil.test','https://www.aliexpress.com:9000','file:///etc/passwd','https://evil.test'])assert.equal(allowedResource(bad),false);
});
test('lit le DOM après attente et ferme le navigateur après succès',async()=>{
  const f=fixture();const r=await renderProduct(url,{}, {...f,extractProduct});
  assert.equal(r.method,'browser');assert.equal(r.source.title,'Produit rendu');assert.equal(r.source.cost,19.95);assert.deepEqual(r.source.variants,['Bleu']);
  assert.equal(f.calls.waited,true);assert.equal(f.calls.closed,1);assert.equal(f.calls.launch.headless,true);assert.equal(f.calls.options.serviceWorkers,'block');
  let blocked=false;await f.calls.route({request:()=>({url:()=> 'http://localhost/private'}),abort:async()=>{blocked=true;}});assert.equal(blocked,true);
});
test('CAPTCHA et redirection login arrêtent l’extraction sans les franchir',async()=>{
  for(const opts of [{dom:{barrier:true}},{redirect:'https://www.aliexpress.com/login.html'},{redirect:'https://evil.test/item/123.html'},{lateRedirect:'https://www.aliexpress.com/punish'}]){
    const f=fixture(opts);await assert.rejects(()=>renderProduct(url,{}, {...f,extractProduct}),/vérification/);assert.equal(f.calls.closed,1);
  }
});

test('le navigateur accepte les mêmes variantes régionales de fiche produit',async()=>{
  const f=fixture({redirect:'https://de.aliexpress.com/i/123.html/?gatewayAdapt=glo2deu'});
  const result=await renderProduct(url,{}, {...f,extractProduct});
  assert.equal(result.method,'browser');assert.equal(f.calls.closed,1);
});
test('fermeture après erreur, données manquantes et installation manquante',async()=>{
  for(const opts of [{failGoto:true},{dom:{sourceTitle:'Chargement',prices:[],images:[]}}]){
    const f=fixture(opts);await assert.rejects(()=>renderProduct(url,{}, {...f,extractProduct}));assert.equal(f.calls.closed,1);
  }
  await assert.rejects(()=>renderProduct(url,{}, {chromium:{launch:async()=>{throw Error('missing binary');}}}),/Installez-le/);
});
