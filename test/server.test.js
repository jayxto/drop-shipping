import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../server/index.js';
import http from 'node:http';
import {secretStore} from '../server/storage.js';

// Node fetch owns its Host header. Use node:http to test explicit host validation.
function fetch(url, options={}) {
  return new Promise((resolve,reject)=>{
    const req=http.request(url,{method:options.method || 'GET',headers:options.headers},res=>{
      const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{
        resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:Object.fromEntries(Object.entries(res.headers).map(([k,v])=>[k,Array.isArray(v)?v.join(', '):v]))}));
      });
    });req.on('error',reject);req.end(options.body);
  });
}

test('parcours HTTP complet, persistance, CSRF, isolation statique et simulation',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'drop-studio-test-'));
  const env={APP_URL:'http://localhost:3000',MARKETPLACE_MODE:'demo'};
  let externalCalls=0;
  const server=createApp({env,dataDir:dir,request:async(url)=>{externalCalls++;if(url.endsWith('/publish'))return Response.json({listingId:'12345'});if(url.endsWith('/offer'))return Response.json({offerId:'678'});return new Response(null,{status:204});}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  const initial=await fetch(base+'/api/config',{headers:{host:'localhost:3000'}});
  const cookie=initial.headers.get('set-cookie').split(';')[0],cfg=await initial.json();
  const headers={host:'localhost:3000',origin:env.APP_URL,cookie,'x-csrf-token':cfg.csrf,'content-type':'application/json'};
  const request=(route,data)=>fetch(base+route,{method:data?'POST':'GET',headers,body:data?JSON.stringify(data):undefined});
  try {
    assert.equal(cfg.generation,'demo');assert.ok(!JSON.stringify(cfg).includes('accessToken'));
    assert.equal((await fetch(base+'/api/config')).status,403);
    assert.equal((await request('/.env')).status,404);
    assert.equal((await request('/server/index.js')).status,404);
    assert.match((await request('/')).headers.get('content-security-policy'),/frame-ancestors 'none'/);
    const forbidden=await fetch(base+'/api/generate',{method:'POST',headers:{...headers,'x-csrf-token':'wrong'},body:'{}'});assert.equal(forbidden.status,403);
    const source=await readFile(new URL('../public/sample.json',import.meta.url),'utf8');
    const generated=await request('/api/generate',{raw:source});assert.equal(generated.status,200);const {listing}=await generated.json();
    listing.title='Titre modifié';
    assert.equal((await request('/api/drafts',{listing})).status,200);
    const stored=await (await request('/api/drafts')).json();assert.equal(stored.drafts[0].title,'Titre modifié');
    const simulation=await (await request('/api/publish/ebay',{listing})).json();assert.equal(simulation.simulated,true);assert.equal(simulation.plan.market,'ebay');
    env.MARKETPLACE_MODE='live';assert.equal((await request('/api/publish/etsy',{listing})).status,409);
    assert.equal((await request('/api/oauth/etsy/start',{})).status,409);
    assert.equal((await request('/api/drafts',{listing:{...listing,title:''}})).status,400);
    const disk=JSON.parse(await readFile(path.join(dir,'drafts.json'),'utf8'));assert.equal(disk[0].title,'Titre modifié');
    assert.equal((await request('/healthz')).status,200);
    assert.equal((await request('/api/settings',{settings:{MARKETPLACE_MODE:'live',EBAY_CLIENT_ID:'test-id',EBAY_CLIENT_SECRET:'test-ebay-secret',EBAY_LOCATION_KEY:'location',EBAY_PAYMENT_POLICY_ID:'1',EBAY_RETURN_POLICY_ID:'2',EBAY_FULFILLMENT_POLICY_ID:'3'}})).status,200);
    const settings=await (await request('/api/settings')).json();assert.ok(!JSON.stringify(settings).includes('test-secret'));
    await secretStore(dir).update(d=>{d.tokens.ebay={accessToken:'test-token',expires:Date.now()+3600000};});
    const liveListing={...listing,title:'Vase',images:['https://example.com/photo.jpg'],quantity:2,category:'123',verified:true,selectedVariant:listing.variants[0]};
    const prepared=await (await request('/api/prepare/ebay',{listing:liveListing})).json();assert.ok(prepared.confirmation);
    assert.equal((await request('/api/publish/ebay',{listing:{...liveListing,price:99},confirmation:prepared.confirmation})).status,409);assert.equal(externalCalls,0);
    const again=await (await request('/api/prepare/ebay',{listing:liveListing})).json();
    const published=await (await request('/api/publish/ebay',{listing:liveListing,confirmation:again.confirmation})).json();assert.equal(published.published,true);assert.equal(externalCalls,3);
    assert.equal((await request('/api/publish/ebay',{listing:liveListing,confirmation:again.confirmation})).status,409);
    const history=await (await request('/api/history')).json();assert.equal(history.publications[0].status,'published');assert.ok(!JSON.stringify(history).includes('test-token'));
  } finally {await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});
