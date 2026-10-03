import test from 'node:test';
import assert from 'node:assert/strict';
import {productUrl,extractProduct,importUrl} from '../server/aliexpress.js';

const url='https://www.aliexpress.com/item/1005001234567890.html';
const html='<html><script type="application/ld+json">'+JSON.stringify({'@context':'https://schema.org','@type':'Product',name:'Vase en céramique',description:'Hauteur 18 cm',image:['https://example.com/vase.jpg'],material:'Céramique',offers:{price:'8.50',priceCurrency:'EUR'},additionalProperty:[{name:'Hauteur',value:'18 cm'}]})+'</script></html>';
test('liens produit canoniques, suivi retiré et destinations non autorisées rejetées',()=>{
  assert.equal(productUrl(url+'?tracking=abc#details').href,url);
  for(const bad of ['http://localhost/item/123.html','https://evil.com/item/123.html','https://www.aliexpress.com.evil.com/item/123.html','https://www.aliexpress.com:444/item/123.html','https://x@www.aliexpress.com/item/123.html','https://www.aliexpress.com/login.html','https://s.click.aliexpress.com/e/x'])assert.throws(()=>productUrl(bad));
});
test('extraction des métadonnées produit et refus des pages de login',()=>{
  const p=extractProduct(html,url);assert.equal(p.title,'Vase en céramique');assert.equal(p.cost,8.5);assert.equal(p.currency,'EUR');assert.deepEqual(p.materials,['Céramique']);assert.equal(p.specifics.Hauteur,'18 cm');
  assert.throws(()=>extractProduct('<meta property="og:title" content="AliExpress login">',url),/bloque/);
  assert.throws(()=>extractProduct('<meta property="og:title" content="Security check">',url),/ne fournit pas/);
});
test('import URL serveur, redirections externes bloquées sans les suivre',async()=>{
  const imported=await importUrl(url,{ALIEXPRESS_IMPORT_MODE:'metadata'},async()=>new Response(html));assert.equal(imported.source.cost,8.5);assert.equal(imported.method,'metadata');
  let count=0;
  await assert.rejects(()=>importUrl(url,{ALIEXPRESS_IMPORT_MODE:'metadata'},async()=>{count++;return new Response(null,{status:302,headers:{location:'https://127.0.0.1/private'}});}),/destination non autorisée/);assert.equal(count,1);
  await assert.rejects(()=>importUrl(url,{ALIEXPRESS_IMPORT_MODE:'metadata'},async()=>new Response('blocked',{status:403})),/bloque/);
});

test('liens régionaux, mobiles et paramètres de suivi normalisés',()=>{
  for(const host of ['de.aliexpress.com','es.aliexpress.com','pt.aliexpress.com','nl.aliexpress.com','m.fr.aliexpress.com','www.aliexpress.us']) {
    for(const path of ['/item/123.html','/item/123.html/','/item/123','/i/123.html']) {
      assert.equal(productUrl(` https://${host}${path}?spm=a2g0o&aff_fcid=abc&gatewayAdapt=glo2fra#details `).href,`https://${host}/item/123.html`);
    }
  }
  for(const bad of ['https://evilaliexpress.com/item/123.html','https://aliexpress.com.evil.test/item/123.html','https://127.0.0.1/item/123.html','http://fr.aliexpress.com/item/123.html','https://fr.aliexpress.com/item/abc.html','https://fr.aliexpress.com/item/123.html/login','https://fr.aliexpress.com/item/123.html%2Flogin','https://user:pass@fr.aliexpress.com/item/123.html'])assert.throws(()=>productUrl(bad));
});

test('redirections produit relatives et régionales : paramètres conservés',async()=>{
  const locations=['//de.aliexpress.com/item/123.html?gatewayAdapt=glo2deu','/i/123.html/?redirected=1'];
  const seen=[];
  const result=await importUrl(url,{ALIEXPRESS_IMPORT_MODE:'metadata'},async(current,options)=>{
    seen.push(current.href);assert.equal(options.redirect,'manual');
    return locations.length?new Response(null,{status:302,headers:{location:locations.shift()}}):new Response(html);
  });
  assert.deepEqual(seen,[url,'https://de.aliexpress.com/item/123.html?gatewayAdapt=glo2deu','https://de.aliexpress.com/i/123.html/?redirected=1']);
  assert.equal(result.source.sourceUrl,url);
});

test('login, challenge, redirections dangereuses ou malformées : erreur accès 422 sans suivi',async()=>{
  for(const location of ['/login.html','https://login.aliexpress.com/','/punish?return_url='+encodeURIComponent(url),'https://evil.test/item/123.html','http://www.aliexpress.com/item/123.html','https://www.aliexpress.com:444/item/123.html','https://user@www.aliexpress.com/item/123.html','https://[invalid','',null]) {
    let count=0,cancelled=false;
    await assert.rejects(()=>importUrl(url,{ALIEXPRESS_IMPORT_MODE:'metadata'},async()=>{
      count++;
      return {status:302,headers:new Headers(location===null?{}:{location}),body:{async cancel(){cancelled=true;}}};
    }),error=>error.status===422 && /redirigé/.test(error.message) && !/lien complet|URL HTTPS/.test(error.message));
    assert.equal(count,1);assert.equal(cancelled,true);
  }
});

test('boucles de redirection bornées sans accuser le lien saisi',async()=>{
  let count=0;
  await assert.rejects(()=>importUrl(url,{ALIEXPRESS_IMPORT_MODE:'metadata'},async()=>{
    count++;return new Response(null,{status:307,headers:{location:url}});
  }),error=>error.status===422 && /boucle/.test(error.message));
  assert.equal(count,4);
});
test('service d’extraction optionnel, clé serveur et contrat JSON',async()=>{
  const result=await importUrl(url,{SCRAPER_API_URL:'https://extractor.example/import',SCRAPER_API_KEY:'test-only-key'},async(endpoint,opts)=>{
    assert.equal(endpoint.hostname,'extractor.example');assert.equal(opts.headers.Authorization,'Bearer test-only-key');assert.equal(JSON.parse(opts.body).url,url);
    return Response.json({product:{sourceTitle:'Produit',price:5,images:[]}});
  });assert.equal(result.source.cost,5);assert.equal(result.method,'provider');
});
