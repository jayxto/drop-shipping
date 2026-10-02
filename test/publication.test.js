import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {secretStore,jsonStore} from '../server/storage.js';
import {preparePublication,publisher,downloadImage} from '../server/marketplaces.js';
import {demoListing,parseImport} from '../server/listing.js';
import {publicSettings,settingsPatch} from '../server/settings.js';
import {freshToken} from '../server/oauth.js';

const image='https://ae01.aliexpress-media.com/kf/image.jpg';
const base=()=>({...demoListing(parseImport(JSON.stringify({title:'Vase',price:5,images:[image]}))),category:'123',quantity:2,verified:true,whoMade:'someone_else',whenMade:'made_to_order',isSupply:true,etsyEligible:true});
const env={EBAY_CLIENT_ID:'test-id',EBAY_CLIENT_SECRET:'test-secret',EBAY_LOCATION_KEY:'paris',EBAY_PAYMENT_POLICY_ID:'1',EBAY_RETURN_POLICY_ID:'2',EBAY_FULFILLMENT_POLICY_ID:'3',ETSY_SHOP_ID:'123',ETSY_CLIENT_ID:'test-key',ETSY_SHARED_SECRET:'test-secret',ETSY_SHIPPING_PROFILE_ID:'1',ETSY_READINESS_STATE_ID:'2',ETSY_RETURN_POLICY_ID:'3'};
async function temp(fn){const dir=await mkdtemp(path.join(os.tmpdir(),'drop-publish-'));try{await fn(dir);}finally{await rm(dir,{recursive:true,force:true});}}
test('coffre chiffré persistant, écritures concurrentes et secrets non réaffichés',()=>temp(async dir=>{
  const store=secretStore(dir);await Promise.all([store.update(d=>{d.settings.OPENAI_API_KEY='not-a-real-secret';}),store.update(d=>{d.tokens.ebay={accessToken:'not-a-real-token'};})]);
  const disk=await readFile(path.join(dir,'vault.enc'),'utf8');assert.ok(!disk.includes('not-a-real'));const second=secretStore(dir);assert.equal((await second.load()).settings.OPENAI_API_KEY,'not-a-real-secret');
  assert.equal(publicSettings({OPENAI_API_KEY:'secret'}).find(f=>f.key==='OPENAI_API_KEY').value,'');assert.deepEqual(settingsPatch({OPENAI_API_KEY:''}),{});assert.throws(()=>settingsPatch({APP_PASSWORD:'evil'}));
}));
test('validation réelle : consentement, variante, stock, titre et Etsy',()=>{
  assert.equal(preparePublication('ebay',base(),env).sandbox,true);
  assert.throws(()=>preparePublication('ebay',{...base(),verified:false},env),/Confirmer/);
  assert.throws(()=>preparePublication('ebay',{...base(),variants:['Bleu']},env),/variante/);
  assert.throws(()=>preparePublication('ebay',{...base(),quantity:0},env),/Stock/);
  assert.throws(()=>preparePublication('etsy',{...base(),etsyEligible:false},env),/éligibilité/);
  assert.throws(()=>preparePublication('etsy',{...base(),images:['https://localhost/image.jpg']},env),/images HTTPS/);
});
test('eBay : inventaire → offre → publication, SKU stable et double clic idempotent',()=>temp(async dir=>{
  const calls=[];const publish=publisher(jsonStore(dir,'pub.json'),async(url,options)=>{
    calls.push({url,options});if(url.endsWith('/publish'))return Response.json({listingId:'987'});if(url.endsWith('/offer'))return Response.json({offerId:'456'});return new Response(null,{status:204});
  });
  const plan=preparePublication('ebay',base(),env);const result=await publish(plan,env,'test-token');assert.equal(result.listingId,'987');assert.equal(result.sandbox,true);assert.equal(calls.length,3);
  assert.equal(JSON.parse(calls[0].options.body).availability.shipToLocationAvailability.quantity,2);assert.equal(JSON.parse(calls[1].options.body).listingPolicies.returnPolicyId,'2');
  assert.deepEqual(await publish(plan,env,'test-token'),result);assert.equal(calls.length,3);
}));
test('Etsy : images binaires, brouillon et activation confirmée',()=>temp(async dir=>{
  const calls=[];const publish=publisher(jsonStore(dir,'pub.json'),async(url,options)=>{
    calls.push({url,options});if(url===image)return new Response(Buffer.from([255,216,255,1,2,3]));
    if(url.endsWith('/images')){assert.ok(options.body instanceof FormData);assert.equal(options.body.get('rank'),'1');return Response.json({listing_image_id:22});}
    if(options.method==='PATCH')return Response.json({listing_id:11,state:'active'});
    assert.ok(options.body instanceof URLSearchParams);assert.equal(options.body.get('readiness_state_id'),'2');return Response.json({listing_id:11});
  });
  const result=await publish(preparePublication('etsy',base(),env),env,'test-token');assert.equal(result.published,true);assert.equal(calls.length,4);assert.equal(calls[0].options.headers,undefined);
}));
test('réponse incertaine : aucun retry qui créerait un doublon',()=>temp(async dir=>{
  let calls=0;const publish=publisher(jsonStore(dir,'pub.json'),async()=>{calls++;throw Error('timeout');});
  const plan=preparePublication('ebay',base(),env);await assert.rejects(()=>publish(plan,env,'token'),/incertaine/);
  await assert.rejects(()=>publish(plan,env,'token'),/vérification manuelle/);assert.equal(calls,1);
}));
test('reprise après refus explicite conserve les étapes réussies',()=>temp(async dir=>{
  const calls=[];let refused=true;
  const publish=publisher(jsonStore(dir,'pub.json'),async(url)=>{calls.push(url);if(url.endsWith('/publish')){if(refused){refused=false;return new Response('',{status:422});}return Response.json({listingId:'3'});}if(url.endsWith('/offer'))return Response.json({offerId:'2'});return new Response(null,{status:204});});
  const plan=preparePublication('ebay',base(),env);await assert.rejects(()=>publish(plan,env,'token'),/refusé/);await publish(plan,env,'token');assert.equal(calls.length,4);
}));
test('images : redirection privée et contenu non image refusés',async()=>{
  await assert.rejects(()=>downloadImage(image,async()=>new Response(null,{status:302,headers:{location:'http://127.0.0.1'}})),/non autorisé/);
  await assert.rejects(()=>downloadImage(image,async()=>new Response('<script>bad</script>')),/JPEG ou PNG/);
});
test('renouvellement OAuth conserve le refresh token si non renouvelé',async()=>{
  const tokens={ebay:{accessToken:'old',refreshToken:'refresh',expires:0}};
  const access=await freshToken('ebay',tokens,env,async(url,opts)=>{assert.equal(opts.body.get('grant_type'),'refresh_token');return Response.json({access_token:'new',expires_in:7200});});
  assert.equal(access,'new');assert.equal(tokens.ebay.refreshToken,'refresh');assert.ok(tokens.ebay.expires>Date.now());
});
