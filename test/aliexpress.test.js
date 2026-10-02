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
  await assert.rejects(()=>importUrl(url,{ALIEXPRESS_IMPORT_MODE:'metadata'},async()=>{count++;return new Response(null,{status:302,headers:{location:'https://127.0.0.1/private'}});}),/lien complet/);assert.equal(count,1);
  await assert.rejects(()=>importUrl(url,{ALIEXPRESS_IMPORT_MODE:'metadata'},async()=>new Response('blocked',{status:403})),/bloque/);
});
test('service d’extraction optionnel, clé serveur et contrat JSON',async()=>{
  const result=await importUrl(url,{SCRAPER_API_URL:'https://extractor.example/import',SCRAPER_API_KEY:'test-only-key'},async(endpoint,opts)=>{
    assert.equal(endpoint.hostname,'extractor.example');assert.equal(opts.headers.Authorization,'Bearer test-only-key');assert.equal(JSON.parse(opts.body).url,url);
    return Response.json({product:{sourceTitle:'Produit',price:5,images:[]}});
  });assert.equal(result.source.cost,5);assert.equal(result.method,'provider');
});
