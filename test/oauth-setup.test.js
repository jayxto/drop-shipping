import test from 'node:test';
import assert from 'node:assert/strict';
import {connectionSetup, beginOAuth} from '../server/oauth.js';

test('missing marketplace credentials give actionable setup without exposing secrets',()=>{
  assert.deepEqual(connectionSetup('ebay',{EBAY_CLIENT_ID:'private-id'}),{ready:false,missing:['Cert ID eBay','RuName eBay']});
  assert.equal(connectionSetup('etsy',{ETSY_CLIENT_ID:'   '}).ready,false);
  assert.throws(()=>beginOAuth('ebay',{},{}),e=>e.status===409 && e.message.includes('Réglages → eBay') && !e.message.includes('README'));
});
test('configured marketplaces still start the correct OAuth flows',()=>{
  const env={EBAY_CLIENT_ID:'app-id',EBAY_CLIENT_SECRET:'secret',EBAY_REDIRECT_URI:'my-runame',EBAY_SANDBOX:'false',ETSY_CLIENT_ID:'etsy-id',ETSY_REDIRECT_URI:'https://studio.example/api/oauth/etsy/callback'};
  for(const market of ['etsy','ebay']){
    assert.deepEqual(connectionSetup(market,env),{ready:true,missing:[]});
    assert.ok(!JSON.stringify(connectionSetup(market,env)).includes('secret'));
    const session={},url=new URL(beginOAuth(market,session,env));
    assert.equal(url.searchParams.get('state'),session.oauth.state);
    if(market==='ebay'){assert.equal(url.hostname,'auth.ebay.com');assert.equal(url.searchParams.get('redirect_uri'),'my-runame');}
    else assert.equal(url.searchParams.get('code_challenge_method'),'S256');
  }
});
