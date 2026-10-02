import test from 'node:test';
import assert from 'node:assert/strict';
import {parseImport,parsePrice,pricing,demoListing,validateListing,marketplacePlan} from '../server/listing.js';
import {generate} from '../server/generate.js';
import {beginOAuth,finishOAuth} from '../server/oauth.js';

const raw=JSON.stringify({sourceTitle:'Vase céramique',prices:['8,50 €'],specifics:{Matériau:'Céramique'},images:[{url:'https://example.com/a.jpg'},{url:'javascript:alert(1)'}],variants:['Ivoire']});
test('importe le prompt réel du bridge, conserve les données sans exécuter ses instructions',()=>{
  const source=parseImport('Consignes {"title":"wrong"}\nDONNÉES SCRAPÉES :\n'+raw);
  assert.equal(source.title,'Vase céramique');assert.equal(source.cost,8.5);assert.deepEqual(source.images,['https://example.com/a.jpg']);
  assert.deepEqual(source.variants,['Ivoire']);
});
test('images sélectionnées prioritaires, même si sélection vide',()=>{
  const source=parseImport(JSON.stringify({...JSON.parse(raw),selectedImages:[]}));assert.deepEqual(source.images,[]);
});
test('formats JSON, ancien export, texte libre et erreurs explicites',()=>{
  assert.equal(parseImport('```json\n'+raw+'\n```').cost,8.5);
  assert.equal(parseImport('EBAY_LISTING_JSON_START'+raw+'EBAY_LISTING_JSON_END').title,'Vase céramique');
  assert.equal(parseImport('Objet\nDescription').cost,null);
  assert.throws(()=>parseImport('{"broken":'),/JSON invalide/);
  assert.throws(()=>parseImport('[]'),/objet produit/);
  assert.throws(()=>parseImport('{}'),/titre/);
});
test('prix FR/US, devises et frais',()=>{
  assert.equal(parsePrice('1.234,56 €'),1234.56);assert.equal(parsePrice('$1,234.56'),1234.56);
  assert.equal(parsePrice('4,26 € - 7,99 €'),4.26);assert.equal(parsePrice('inconnu'),null);
  assert.equal(parseImport('{"title":"Test","price":"$12.00"}').currency,'USD');
  assert.equal(pricing(8.5).price,23.45);assert.equal(pricing(null).price,0);
  assert.throws(()=>pricing(2,{fees:100}));assert.throws(()=>pricing(2,{multiplier:'abc'}));
});
test('la démo ne crée pas de faits inconnus, les plans signalent les limites',()=>{
  const listing=demoListing(parseImport(raw));assert.deepEqual(listing.materials,['Céramique']);assert.equal(listing.generation,'demo');
  assert.equal(validateListing(listing).title,listing.title);
  assert.throws(()=>validateListing({...listing,images:['http://example.com']}));
  assert.throws(()=>validateListing({...listing,tags:['x'.repeat(21)]}));
  assert.throws(()=>validateListing({...listing,price:NaN}));
  assert.ok(marketplacePlan('etsy',listing).warnings.some(w=>w.includes('éligibilité')));
  assert.ok(marketplacePlan('ebay',{...listing,title:'x'.repeat(100)}).warnings.some(w=>w.includes('80')));
});
test('IA: contrat structuré, conserve matériaux/prix/images, ne divulgue pas les erreurs amont',async()=>{
  const source=parseImport(raw),env={OPENAI_API_KEY:'test-only-secret',OPENAI_MODEL:'configured-model'};
  const result=await generate(source,{},env,async(url,opts)=>{
    const req=JSON.parse(opts.body);assert.equal(req.store,false);assert.equal(req.text.format.strict,true);
    return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({title:'Vase mat',description:'Vase en céramique.',tags:['vase']})}]}]})};
  });
  assert.equal(result.generation,'openai');assert.equal(result.price,23.45);assert.deepEqual(result.materials,['Céramique']);
  await assert.rejects(()=>generate(source,{},env,async()=>({ok:false,status:401})),/HTTP 401/);
  await assert.rejects(()=>generate(source,{},env,async()=>({ok:true,json:async()=>({status:'incomplete'})})),/incomplète/);
});
test('OAuth Etsy: PKCE, état à usage unique, jetons serveur',async()=>{
  const session={tokens:{}}, env={ETSY_CLIENT_ID:'test-id',ETSY_REDIRECT_URI:'http://localhost:3000/api/oauth/etsy/callback'};
  const url=new URL(beginOAuth('etsy',session,env));assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.ok(url.searchParams.get('code_challenge'));
  const params=new URLSearchParams({code:'test-code',state:url.searchParams.get('state')});
  await finishOAuth('etsy',session,params,env,async(_,opts)=>{assert.ok(opts.body.get('code_verifier'));return {ok:true,json:async()=>({access_token:'test-token',expires_in:3600})};});
  assert.equal(session.tokens.etsy.accessToken,'test-token');
  await assert.rejects(()=>finishOAuth('etsy',session,params,env),/invalide/);
  beginOAuth('etsy',session,env);
  await assert.rejects(()=>finishOAuth('etsy',session,new URLSearchParams({state:'wrong',code:'x'}),env),/invalide/);
});
test('OAuth eBay utilise RuName, Basic côté serveur et sandbox par défaut',async()=>{
  const env={EBAY_CLIENT_ID:'id',EBAY_CLIENT_SECRET:'secret',EBAY_REDIRECT_URI:'registered-runame'},session={tokens:{}};
  const url=new URL(beginOAuth('ebay',session,env));assert.equal(url.hostname,'auth.sandbox.ebay.com');assert.equal(url.searchParams.get('redirect_uri'),'registered-runame');
  await finishOAuth('ebay',session,new URLSearchParams({state:session.oauth.state,code:'code'}),env,async(url,opts)=>{
    assert.equal(new URL(url).hostname,'api.sandbox.ebay.com');assert.ok(opts.headers.Authorization.startsWith('Basic '));return {ok:true,json:async()=>({access_token:'test-token'})};
  });
  assert.throws(()=>beginOAuth('etsy',{tokens:{}},{}),/non configurée/);
});
