const uniq=a=>[...new Set(a.filter(Boolean))];
const text=e=>(e?.innerText||e?.textContent||"").trim();

function norm(u){
  if(!u)return "";
  if(u.startsWith("//"))u="https:"+u;
  return u.replace(/_\d+x\d+(?:q\d+)?[^.]*?(?=\.(?:jpg|jpeg|png|webp))/i,"");
}
function goodImg(img,u){
  if(!/^https?:/.test(u))return false;
  if(/bing\.com|alicdn\.com\/tps|logo|avatar|icon|sprite|qr|\/\d{1,3}x\d{1,3}\./i.test(u))return false;
  const w=img?.naturalWidth||img?.width||0,h=img?.naturalHeight||img?.height||0;
  if(w && h && (w<180 || h<180))return false;
  return /aliexpress-media\.com\/kf\//i.test(u);
}
function prices(){
  return uniq([...document.querySelectorAll('[class*="price"],[class*="Price"],[data-pl*="price"]')]
   .map(text).filter(x=>/[€$£]\s*\d|\d[\d\s,.]*\s*[€$£]/.test(x))).slice(0,12);
}
function scrape(){
  const title=text(document.querySelector("h1"))||document.querySelector('meta[property="og:title"]')?.content||document.title;
  const candidates=[...document.images].map(img=>({img,url:norm(img.currentSrc||img.src||img.getAttribute("data-src")||"")}));
  let urls=uniq(candidates.filter(x=>goodImg(x.img,x.url)).map(x=>x.url));
  const og=norm(document.querySelector('meta[property="og:image"]')?.content||"");
  if(og && /^https?:/.test(og)) urls=[og,...urls.filter(x=>x!==og)];
  const images=urls.slice(0,20).map((url,i)=>({id:i+1,url}));

  const variants=uniq([...document.querySelectorAll('[class*="sku"] button,[class*="variant"] button,[role="radio"],[aria-checked]')]
   .map(el=>el.title||el.getAttribute("aria-label")||text(el)).filter(x=>x&&x.length<100)).slice(0,80);

  const variantImages=uniq([...document.querySelectorAll('[class*="sku"] img,[class*="variant"] img')]
   .map(i=>norm(i.currentSrc||i.src||"")).filter(u=>/^https?:/.test(u)&&!/\/\d{1,3}x\d{1,3}\./i.test(u))).slice(0,30);

  const specifics={};
  [...document.querySelectorAll('li,[class*="property"],[class*="specification"],[class*="spec"]')].forEach(el=>{
    const t=text(el); if(!t||t.length>220)return;
    const p=t.split(/:|：/); if(p.length>=2&&Object.keys(specifics).length<50){
      const k=p.shift().trim(),v=p.join(":").trim(); if(k&&v&&k.length<70)specifics[k]=v;
    }
  });
  const shipping=uniq([...document.querySelectorAll('[class*="shipping"],[class*="delivery"],[data-pl*="shipping"]')]
   .map(text).filter(x=>x&&x.length<300)).slice(0,8);

  return {schema:"ALI_EBAY_BRIDGE_SOURCE_V2_1",sourceUrl:location.href,sourceTitle:title.replace(/\s+/g," ").trim(),
    prices:prices(),shipping,description:document.querySelector('meta[name="description"]')?.content||title,
    images,variantImages,variants,specifics,scrapedAt:new Date().toISOString()};
}
chrome.runtime.onMessage.addListener((m,_s,r)=>{if(m?.type==="ALI_SCRAPE"){try{r({ok:true,data:scrape()})}catch(e){r({ok:false,error:String(e)})}}});