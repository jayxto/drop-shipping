import { randomBytes, createHash } from 'node:crypto';
import { InputError } from './listing.js';

const random = () => randomBytes(32).toString('base64url');
export function provider(market, env) {
  if (!['etsy','ebay'].includes(market)) throw new InputError('Marketplace inconnue.');
  const sandbox = env.EBAY_SANDBOX !== 'false';
  return market === 'etsy' ? {
    id:env.ETSY_CLIENT_ID, secret:env.ETSY_SHARED_SECRET, redirect:env.ETSY_REDIRECT_URI,
    auth:'https://www.etsy.com/oauth/connect', token:'https://api.etsy.com/v3/public/oauth/token', scope:'listings_r listings_w shops_r'
  } : {
    id:env.EBAY_CLIENT_ID, secret:env.EBAY_CLIENT_SECRET, redirect:env.EBAY_REDIRECT_URI,
    auth:`https://auth.${sandbox ? 'sandbox.' : ''}ebay.com/oauth2/authorize`, token:`https://api.${sandbox ? 'sandbox.' : ''}ebay.com/identity/v1/oauth2/token`, scope:'https://api.ebay.com/oauth/api_scope/sell.inventory'
  };
}
export function beginOAuth(market, session, env) {
  const p = provider(market,env);
  if (!p.id || !p.redirect || (market === 'ebay' && !p.secret)) throw new InputError('Connexion non configurée. Renseignez les variables serveur décrites dans le README.',409);
  const state = random(), verifier = random();
  session.oauth = { market, state, verifier, expires: Date.now() + 10*60*1000 };
  const u = new URL(p.auth);
  for (const [k,v] of Object.entries({ response_type:'code', client_id:p.id, redirect_uri:p.redirect, scope:p.scope, state })) u.searchParams.set(k,v);
  if (market === 'etsy') { u.searchParams.set('code_challenge',createHash('sha256').update(verifier).digest('base64url')); u.searchParams.set('code_challenge_method','S256'); }
  return u.href;
}
export async function finishOAuth(market, session, params, env, request = fetch) {
  const pending = session.oauth; delete session.oauth;
  if (!pending || pending.market !== market || pending.state !== params.get('state') || pending.expires < Date.now()) throw new InputError('Session OAuth invalide ou expirée. Recommencez la connexion.',403);
  if (params.has('error') || !params.get('code')) throw new InputError('Connexion annulée ou code manquant.');
  const p = provider(market, env);
  const body = new URLSearchParams({ grant_type:'authorization_code', code:params.get('code'), redirect_uri:p.redirect });
  const headers = { 'Content-Type':'application/x-www-form-urlencoded' };
  if (market === 'etsy') { body.set('client_id',p.id); body.set('code_verifier',pending.verifier); }
  else headers.Authorization = `Basic ${Buffer.from(`${p.id}:${p.secret}`).toString('base64')}`;
  let response;
  try { response = await request(p.token,{ method:'POST', headers, body, signal:AbortSignal.timeout(15000) }); }
  catch { throw new InputError('La marketplace ne répond pas. Recommencez la connexion.',502); }
  if (!response.ok) throw new InputError('Échange OAuth refusé. Vérifiez les identifiants et la redirection côté serveur.',502);
  const data = await response.json();
  if (!data.access_token) throw new InputError('Réponse OAuth incomplète.',502);
  // Persisted by the caller in the encrypted vault, never sent to the browser.
  session.tokens[market] = { accessToken:data.access_token, refreshToken:data.refresh_token, expires:Date.now()+Number(data.expires_in || 3600)*1000 };
}

export async function freshToken(market,tokens,env,request=fetch) {
  const token=tokens[market];
  if(!token)throw new InputError(`Connectez votre compte ${market} dans Connexions.`,409);
  if(token.expires>Date.now()+60000)return token.accessToken;
  if(!token.refreshToken)throw new InputError(`Reconnectez votre compte ${market}.`,409);
  const p=provider(market,env),body=new URLSearchParams({grant_type:'refresh_token',refresh_token:token.refreshToken});
  const headers={'Content-Type':'application/x-www-form-urlencoded'};
  if(market==='etsy')body.set('client_id',p.id);
  else {headers.Authorization=`Basic ${Buffer.from(`${p.id}:${p.secret}`).toString('base64')}`;body.set('scope',p.scope);}
  let response;try{response=await request(p.token,{method:'POST',headers,body,signal:AbortSignal.timeout(15000)});}catch{throw new InputError('Renouvellement OAuth indisponible.',502);}
  if(!response.ok)throw new InputError(`La connexion ${market} a expiré. Reconnectez le compte.`,409);
  const data=await response.json();if(!data.access_token)throw new InputError('Réponse OAuth incomplète.',502);
  tokens[market]={accessToken:data.access_token,refreshToken:data.refresh_token || token.refreshToken,expires:Date.now()+Number(data.expires_in || 3600)*1000};
  return data.access_token;
}
