import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const code=await readFile(new URL('../extension/background.js',import.meta.url),'utf8');
const bridge=await readFile(new URL('../extension/bridge.js',import.meta.url),'utf8');
const aliScript=await readFile(new URL('../extension/aliexpress.js',import.meta.url),'utf8');
const productTab={id:42,url:'https://fr.aliexpress.com/item/100500123456789.html'};
test('already-open AliExpress tab recovers its missing receiver once, then reads the current product',async()=>{
  let sends=0,injections=0;const product={sourceTitle:'Current product'};
  const context=vm.createContext({URL,chrome:{tabs:{sendMessage:async id=>{assert.equal(id,42);if(++sends===1)throw Error('Could not establish connection. Receiving end does not exist.');return {ok:true,data:product};}},scripting:{executeScript:async options=>{injections++;assert.equal(options.target.tabId,42);assert.equal(options.files[0],'aliexpress.js');}}}});
  vm.runInContext(bridge,context);
  assert.equal(await context.readAliExpressProduct(productTab),product);assert.equal(injections,1);assert.equal(sends,2);
  await context.readAliExpressProduct(productTab);assert.equal(injections,1);
});
test('recovery refuses other sites and reports blocked access without an endless retry',async()=>{
  let injections=0,sends=0;
  const context=vm.createContext({URL,chrome:{tabs:{sendMessage:async()=>{sends++;throw Error('Receiving end does not exist.');}},scripting:{executeScript:async()=>{injections++;throw Error('Access denied');}}}});vm.runInContext(bridge,context);
  await assert.rejects(context.readAliExpressProduct({id:42,url:'https://aliexpress.com.evil.test/item/123.html'}),/fiche produit/);assert.equal(sends,0);
  await assert.rejects(context.readAliExpressProduct(productTab),/Autorisez l’extension/);assert.equal(injections,1);assert.equal(sends,1);
});
test('reinjected extractor registers only one listener and still extracts the product',()=>{
  const listeners=new Set();const context=vm.createContext({location:{href:productTab.url},document:{images:[],title:'Collier',querySelector:()=>null,querySelectorAll:()=>[]},chrome:{runtime:{onMessage:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}}}});
  vm.runInContext(aliScript,context);vm.runInContext(aliScript,context);assert.equal(listeners.size,1);
  let response;[...listeners][0]({type:'ALI_SCRAPE'},null,r=>response=r);assert.equal(response.ok,true);assert.equal(response.data.sourceTitle,'Collier');
});
async function worker(fetch) {
  let handler;const store={studioBase:'https://studio.example',studioToken:'test-import-token-'.repeat(3)};
  const chrome={storage:{local:{setAccessLevel:async()=>{},get:async()=>({...store}),set:async patch=>Object.assign(store,patch)}},permissions:{contains:async()=>true},runtime:{id:'extension-id',getURL:p=>'chrome-extension://extension-id/'+p,onMessage:{addListener:fn=>handler=fn}}};
  vm.runInNewContext(code,{chrome,URL,crypto:webcrypto,Uint8Array,TextEncoder,AbortSignal,fetch,Error});
  const send=(product,sender={id:'extension-id',url:chrome.runtime.getURL('popup.html')})=>new Promise(resolve=>handler({type:'DROP_STUDIO_SEND',product},sender,resolve));
  return {send,store};
}
test('extension only sends from popup; token stays in worker; retries reuse key without leaking through redirects',async()=>{
  const requests=[];let fail=true;
  const {send}=await worker(async(url,options)=>{requests.push({url,options});if(fail)throw Error('Network unavailable');return Response.json({id:'12345678-1234-1234-1234-123456789012',studioUrl:'https://evil.example'});});
  const denied=await send({},{id:'extension-id',url:'https://fr.aliexpress.com/item/1.html'});assert.equal(denied.ok,false);assert.equal(requests.length,0);
  const product={sourceTitle:'Product',scrapedAt:'first'};
  const first=await send(product);assert.equal(first.ok,false);assert.match(first.error,/inaccessible/);
  await new Promise(r=>setImmediate(r));fail=false;
  const second=await send({...product,scrapedAt:'second'});assert.equal(second.ok,true);assert.equal(second.studioUrl,'https://studio.example/?import=12345678-1234-1234-1234-123456789012');
  assert.equal(requests[0].options.headers['Idempotency-Key'],requests[1].options.headers['Idempotency-Key']);assert.equal(requests[0].options.redirect,'error');assert.equal(requests[0].options.credentials,'omit');assert.ok(!requests[0].options.body.includes('test-import-token'));
});
test('extension refuses nonlocal HTTP and embeds no API key or broad required studio permissions',async()=>{
  const {send,store}=await worker(()=>{throw Error('Must not fetch');});store.studioBase='http://studio.example';assert.equal((await send({})).ok,false);
  const manifest=JSON.parse(await readFile(new URL('../extension/manifest.json',import.meta.url)));
  assert.ok(!manifest.host_permissions.includes('https://*/*'));assert.ok(manifest.optional_host_permissions.includes('https://*/*'));
  for(const file of ['background.js','drop-studio.js','popup.js'])assert.ok(!(await readFile(new URL('../extension/'+file,import.meta.url),'utf8')).includes('OPENAI_API_KEY'));
});
