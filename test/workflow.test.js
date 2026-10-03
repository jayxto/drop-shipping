import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createApp} from '../server/index.js';
import {jsonStore} from '../server/storage.js';
import {allowedReference,templates,defaultTemplates,imagePrompt,generateImage} from '../server/images.js';

const token='test-import-token-'.repeat(3);
const product={sourceUrl:'https://fr.aliexpress.com/item/100500123456789.html',sourceTitle:'Collier fleur',price:{min:4.28,currency:'EUR'},specifics:{Material:'Acier'},variants:[{name:'Color',values:['Gold','Silver']}],sourceImages:['https://ae01.alicdn.com/kf/product.png']};
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
function call(server,route,{headers={},data,method}={}) {
  return new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port:server.address().port,path:route,method:method||(data?'POST':'GET'),headers:{host:'localhost:3000',...(data?{'content-type':'application/json'}:{}),...headers}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text:Buffer.concat(chunks).toString(),json:()=>JSON.parse(Buffer.concat(chunks).toString())}));});req.on('error',reject);req.end(data?JSON.stringify(data):undefined);});
}
async function fixture(t,options={}) {
  const dir=await mkdtemp(path.join(os.tmpdir(),'drop-workflow-'));
  const env={APP_URL:'http://localhost:3000',APP_PASSWORD:'test-password',DROP_STUDIO_IMPORT_TOKEN:token,...options.env};
  const server=createApp({env,dataDir:dir,request:options.request||(()=>{throw Error('Unexpected network request');})});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(async()=>{await server.workflow.idle();await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});});
  const auth={authorization:'Basic '+Buffer.from(':'+env.APP_PASSWORD).toString('base64')};
  const response=await call(server,'/api/config',{headers:auth}),config=response.json();
  const headers={...auth,cookie:response.headers['set-cookie'][0].split(';')[0],origin:env.APP_URL,'x-csrf-token':config.csrf};
  return {server,dir,env,headers,api:(route,data)=>call(server,route,{headers,data}),send:(key,data={product})=>call(server,'/api/import-extension',{headers:{authorization:'Bearer '+token,'idempotency-key':key},data})};
}
test('direct import authenticates, normalizes, deduplicates and persists demo workflow',async t=>{
  const {server,dir,api,send}=await fixture(t);
  assert.equal((await call(server,'/api/import-extension',{data:{product}})).status,401);
  assert.equal((await call(server,'/api/imports',{headers:{authorization:'Bearer '+token}})).status,401);
  const first=await send('request-test-000001');assert.equal(first.status,202);const id=first.json().id;
  assert.equal((await send('request-test-000001')).json().id,id);
  assert.equal((await send('request-test-000001',{product:{...product,sourceTitle:'Other'}})).status,409);
  await server.workflow.idle();
  const item=(await api('/api/imports/'+id)).json().item;
  assert.equal(item.status,'ready');assert.equal(item.source.cost,4.28);assert.equal(item.gallery.length,3);assert.ok(item.gallery.every(x=>x.mode==='demo'));
  assert.equal((await api('/api/drafts')).json().drafts[0].id,id);
  assert.equal((await call(server,item.gallery[0].url)).status,200);
  assert.equal((await call(server,'/media/../../vault.enc')).status,401);
  const stored=JSON.parse(await readFile(path.join(dir,'imports.json'),'utf8'));assert.equal(stored[id].status,'ready');assert.ok(!JSON.stringify(stored).includes(token));
  const listing={...item.listing,title:'Titre corrigé'};
  assert.equal((await api('/api/drafts',{listing})).status,200);
  const prepared=await api('/api/draft-plan/ebay',{listing});assert.equal(prepared.status,200);assert.equal(prepared.json().plan.localOnly,true);assert.ok(!prepared.json().plan.steps.some(s=>s.endsWith('/publish')));
  assert.ok(prepared.json().plan.warnings.some(s=>s.includes('démonstration')));
  const replaced=await api('/api/imports/'+id+'/replace',{index:0,base64:png.toString('base64')});assert.equal(replaced.status,200);
  assert.equal((await api('/api/drafts')).json().drafts[0].title,'Titre corrigé');
  assert.equal((await api('/api/imports/'+id+'/replace',{index:1,base64:Buffer.from('<svg onload="alert(1)"/>').toString('base64')})).status,400);
  assert.equal((await api('/api/settings',{settings:{OPENAI_API_KEY:'must-not-save'}})).status,400);
  assert.equal((await api('/api/imports/'+id+'/retry',{index:5})).status,400);
});
test('exact style snapshots, OpenAI reference edits, partial failure and targeted retry',async t=>{
  let calls=0,fail=true;const prompts=[];
  const {server,api,send}=await fixture(t,{env:{OPENAI_API_KEY:'server-only-test-key'},request:async(url,options)=>{
    if(url.startsWith('https://ae01.alicdn.com/')){assert.equal(options.redirect,'error');return new Response(png);}
    assert.equal(url,'https://api.openai.com/v1/images/edits');assert.equal(options.headers.Authorization,'Bearer server-only-test-key');assert.ok(options.body.get('image') instanceof Blob);
    calls++;prompts.push(options.body.get('prompt'));if(calls===2 && fail)return Response.json({error:'secret-provider-detail'},{status:429});return Response.json({data:[{b64_json:png.toString('base64')}]});
  }});
  const style={global:'  Exact prompt\nfrom ChatGPT.  ',types:{...defaultTemplates.types}};
  assert.equal((await api('/api/image-templates',{templates:style})).status,200);
  const id=(await send('request-test-000002',{product,productPrompt:'Fond crème'})).json().id;
  await server.workflow.idle();let item=(await api('/api/imports/'+id)).json().item;
  assert.equal(item.status,'failed');assert.equal(item.gallery.length,1);assert.match(item.error,/429/);assert.ok(!JSON.stringify(item).includes('server-only-test-key'));
  const firstUrl=item.gallery[0].url;
  await api('/api/image-templates',{templates:{...style,global:'different'}});
  fail=false;await api('/api/imports/'+id+'/retry',{});await server.workflow.idle();item=(await api('/api/imports/'+id)).json().item;
  assert.equal(item.status,'ready');assert.equal(item.gallery[0].url,firstUrl);assert.equal(calls,4);assert.ok(prompts.every(p=>p.startsWith(style.global)));assert.ok(prompts.every(p=>p.includes('Fond crème')));
  await api('/api/imports/'+id+'/retry',{index:0,useCurrentTemplates:true,productPrompt:'New detail'});await server.workflow.idle();
  assert.equal(calls,5);assert.ok(prompts.at(-1).startsWith('different'));assert.ok(prompts.at(-1).includes('New detail'));
});
test('restart keeps progress and requires explicit retry of interrupted jobs',async t=>{
  const {server,dir,send,api}=await fixture(t);const id=(await send('request-test-000003')).json().id;await server.workflow.idle();
  await jsonStore(dir,'imports.json').update(data=>{data[id].status='generating_images';});
  const restarted=createApp({env:{APP_URL:'http://localhost:3000'},dataDir:dir});await restarted.workflow.ready;
  assert.equal((await restarted.workflow.get(id)).status,'interrupted');assert.equal((await api('/api/drafts')).json().drafts.length,1);
});
test('reference allowlist, template validation and no accidental reference download in demo',async t=>{
  for(const u of ['http://ae01.alicdn.com/x','https://127.0.0.1/x','https://alicdn.com.evil.test/x','https://user:password@alicdn.com/x','https://alicdn.com:444/x'])assert.equal(allowedReference(u),false);
  assert.equal(allowedReference('https://ae01.alicdn.com/kf/product.png'),true);
  assert.throws(()=>templates({global:'x',types:{packshot:'y'}}));
  assert.ok(imagePrompt(product,defaultTemplates,'packshot','detail').includes('detail'));
  const dir=await mkdtemp(path.join(os.tmpdir(),'drop-image-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  await assert.rejects(generateImage({source:{images:['https://localhost/private']},prompt:'x',type:'detail',dataDir:dir,env:{OPENAI_API_KEY:'test'},request:()=>{throw Error('must not fetch');}}),/référence/);
});
