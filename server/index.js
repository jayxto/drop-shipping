import http from 'node:http';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseImport, validateListing, marketplacePlan, InputError } from './listing.js';
import { generate } from './generate.js';
import { beginOAuth, finishOAuth, freshToken } from './oauth.js';
import { importUrl } from './aliexpress.js';
import {secretStore,jsonStore} from './storage.js';
import {publicSettings,settingsPatch} from './settings.js';
import {preparePublication,publisher} from './marketplaces.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const equal = (a,b) => { const x=Buffer.from(a||''), y=Buffer.from(b||''); return x.length===y.length && timingSafeEqual(x,y); };
export function createApp({ env:baseEnv=process.env, dataDir=baseEnv.DATA_DIR || path.join(root,'.data'), request=fetch } = {}) {
  const origin = new URL(baseEnv.APP_URL || baseEnv.RENDER_EXTERNAL_URL || 'http://localhost:3000');
  const vault=secretStore(dataDir,baseEnv),journal=jsonStore(dataDir,'publications.json');
  const publishLive=publisher(journal,request);
  const confirmationHash=(listing,env)=>createHash('sha256').update(JSON.stringify({listing,settings:publicSettings(env)})).digest('hex');
  const sessions = new Map();
  let writeQueue = Promise.resolve();
  const loadDrafts = async () => { try { return JSON.parse(await readFile(path.join(dataDir,'drafts.json'),'utf8')); } catch(e) { if(e.code==='ENOENT') return []; throw e; } };
  const saveDraft = d => {
    const operation = writeQueue.then(async()=>{
      const drafts = await loadDrafts(), index = drafts.findIndex(x=>x.id===d.id);
      if (index>=0) drafts[index]=d; else drafts.unshift(d);
      await mkdir(dataDir,{recursive:true});
      await writeFile(path.join(dataDir,'drafts.tmp'),JSON.stringify(drafts.slice(0,200),null,2));
      await rename(path.join(dataDir,'drafts.tmp'),path.join(dataDir,'drafts.json'));
      return d;
    });
    writeQueue = operation.catch(()=>{}); return operation;
  };
  async function body(req) {
    if (!req.headers['content-type']?.startsWith('application/json')) throw new InputError('JSON requis.',415);
    let size=0; const chunks=[];
    for await (const c of req) { size+=c.length; if(size>300000) throw new InputError('Requête trop volumineuse.',413); chunks.push(c); }
    try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { throw new InputError('JSON invalide.'); }
  }
  return http.createServer(async(req,res)=>{
    const send=(status,data)=>{ res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(data)); };
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      if(req.url==='/healthz' && req.method==='GET')return send(200,{ok:true});
      if (req.headers.host !== origin.host) throw new InputError('Hôte non autorisé. Utilisez APP_URL.',403);
      if (baseEnv.APP_PASSWORD) {
        const encoded = req.headers.authorization?.startsWith('Basic ') ? req.headers.authorization.slice(6) : '';
        const credentials=Buffer.from(encoded,'base64').toString();
        if (!equal(credentials.slice(credentials.indexOf(':')+1),baseEnv.APP_PASSWORD)) { res.setHeader('WWW-Authenticate','Basic realm="Drop Studio", charset="UTF-8"'); return send(401,{error:'Authentification requise.'}); }
      }
      const secrets=await vault.load();
      const env={...baseEnv,...secrets.settings};
      const url=new URL(req.url,origin), route=url.pathname;
      // Browser sessions expire; seller tokens persist encrypted in the vault.
      for(const [key,s] of sessions) if(s.expires<Date.now()) sessions.delete(key);
      const cookie=req.headers.cookie?.match(/(?:^|;\s*)drop_session=([A-Za-z0-9_-]+)/)?.[1];
      let s=sessions.get(cookie);
      if(!s) {
        if(sessions.size>=1000) throw new InputError('Trop de sessions actives.',503);
        const id=randomBytes(32).toString('base64url');
        s={ csrf:randomBytes(32).toString('base64url'), tokens:{}, expires:Date.now()+8*3600000, requests:[] };
        sessions.set(id,s); res.setHeader('Set-Cookie',`drop_session=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${origin.protocol==='https:'?'; Secure':''}`);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        if(req.headers.origin!==origin.origin || !equal(req.headers['x-csrf-token'],s.csrf)) throw new InputError('Requête non autorisée. Rechargez la page.',403);
        s.requests=s.requests.filter(t=>t>Date.now()-60000);
        if(s.requests.length>=30) throw new InputError('Trop de requêtes. Patientez une minute.',429);
        s.requests.push(Date.now());
      }
      if(route==='/api/config' && req.method==='GET') return send(200,{csrf:s.csrf, generation:env.OPENAI_API_KEY && env.OPENAI_MODEL?'openai':'demo', marketplaceMode:env.MARKETPLACE_MODE || 'demo',ebaySandbox:env.EBAY_SANDBOX!=='false',connections:Object.fromEntries(['etsy','ebay'].map(m=>[m,Boolean(secrets.tokens[m] && (secrets.tokens[m].expires>Date.now() || secrets.tokens[m].refreshToken))]))});
      if(route==='/api/settings' && req.method==='GET')return send(200,{fields:publicSettings(env)});
      if(route==='/api/settings' && req.method==='POST'){
        const patch=settingsPatch((await body(req)).settings);
        await vault.update(data=>{for(const market of ['etsy','ebay'])if(Object.keys(patch).some(k=>k.startsWith(market.toUpperCase()+'_') && /CLIENT|SECRET|REDIRECT|SANDBOX|SHOP_ID/.test(k) && patch[k]!==env[k]))delete data.tokens[market];Object.assign(data.settings,patch);});
        return send(200,{ok:true});
      }
      if(route==='/api/history' && req.method==='GET')return send(200,{publications:Object.values(await journal.load()).map(({title,market,variant,status,step,error,result,createdAt,sandbox})=>({title,market,variant,status,step,error,result,createdAt,sandbox})).reverse()});
      if(route==='/api/import' && req.method==='POST') return send(200,{source:parseImport((await body(req)).raw)});
      if(route==='/api/import-url' && req.method==='POST') return send(200,await importUrl((await body(req)).url,env));
      if(route==='/api/generate' && req.method==='POST') { const b=await body(req); const source=parseImport(b.raw); return send(200,{listing:await generate(source,b.options,env,request)}); }
      if(route==='/api/drafts' && req.method==='GET') return send(200,{drafts:await loadDrafts()});
      if(route==='/api/drafts' && req.method==='POST') {
        const d=validateListing((await body(req)).listing);
        if(!/^[\da-f-]{36}$/i.test(d.id||'')) throw new InputError('Identifiant de brouillon invalide.');
        return send(200,{listing:await saveDraft({...d,updatedAt:new Date().toISOString()})});
      }
      const prepare=route.match(/^\/api\/prepare\/(etsy|ebay)$/);
      if(prepare && req.method==='POST'){
        const {listing}=await body(req),plan=preparePublication(prepare[1],listing,env);
        if(!secrets.tokens[prepare[1]])throw new InputError('Connectez le compte vendeur avant de publier.',409);
        const confirmation=randomBytes(32).toString('base64url');
        s.confirmation={value:confirmation,market:prepare[1],hash:confirmationHash(listing,env),expires:Date.now()+300000};
        return send(200,{confirmation,summary:plan.summary,sandbox:plan.sandbox,market:plan.market});
      }
      const publish=route.match(/^\/api\/publish\/(etsy|ebay)$/);
      if(publish && req.method==='POST') {
        const b=await body(req),market=publish[1];
        if((env.MARKETPLACE_MODE || 'demo')==='demo')return send(200,{simulated:true,message:`Simulation ${market} réussie. Aucune annonce publiée.`,plan:marketplacePlan(market,b.listing)});
        if(env.MARKETPLACE_MODE!=='live')throw new InputError('Choisissez le mode Simulation ou Vente réelle dans Réglages.',409);
        const confirmation=s.confirmation;delete s.confirmation;
        if(!confirmation || confirmation.market!==market || confirmation.expires<Date.now() || !equal(confirmation.value,b.confirmation) || confirmation.hash!==confirmationHash(b.listing,env))throw new InputError('Validez le récapitulatif avant publication. Toute modification exige une nouvelle validation.',409);
        const plan=preparePublication(market,b.listing,env);
        const accessToken=await vault.update(data=>freshToken(market,data.tokens,env,request));
        return send(200,await publishLive(plan,env,accessToken));
      }
      const start=route.match(/^\/api\/oauth\/(etsy|ebay)\/start$/);
      if(start && req.method==='POST') { await body(req); return send(200,{url:beginOAuth(start[1],s,env)}); }
      const callback=route.match(/^\/api\/oauth\/(etsy|ebay)\/callback$/);
      if(callback && req.method==='GET') { await finishOAuth(callback[1],s,url.searchParams,env,request);await vault.update(data=>{data.tokens[callback[1]]=s.tokens[callback[1]];});delete s.tokens[callback[1]]; res.writeHead(303,{Location:'/?connected='+callback[1]}); return res.end(); }
      const disconnect=route.match(/^\/api\/oauth\/(etsy|ebay)\/disconnect$/);
      if(disconnect && req.method==='POST') { await body(req);await vault.update(data=>{delete data.tokens[disconnect[1]];}); return send(200,{ok:true}); }
      const files={'/':'index.html','/app.js':'app.js','/workspace.js':'workspace.js','/styles.css':'styles.css','/sample.json':'sample.json','/sample-product.svg':'sample-product.svg'};
      if(files[route] && req.method==='GET') {
        const file=files[route]; const types={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',json:'application/json',svg:'image/svg+xml'};
        res.writeHead(200,{'Content-Type':types[file.split('.').pop()]}); return res.end(await readFile(path.join(root,'public',file)));
      }
      send(404,{error:'Page introuvable.'});
    } catch(e) { send(e.status || 500,{error:e.status ? e.message : 'Erreur serveur. Réessayez ou consultez la configuration.'}); }
  });
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const host=process.env.HOST || '127.0.0.1';
  if((!['127.0.0.1','localhost','::1'].includes(host) || process.env.RENDER_EXTERNAL_URL) && !process.env.APP_PASSWORD) throw new Error('APP_PASSWORD est obligatoire pour exposer le serveur.');
  createApp().listen(Number(process.env.PORT || 3000),host,()=>console.log(`Drop Studio : ${process.env.APP_URL || 'http://localhost:3000'}`));
}
