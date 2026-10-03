const $=id=>document.getElementById(id);
let source=null, listing=null;

document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{
  document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
  b.classList.add("active");
  document.querySelectorAll(".panel").forEach(x=>x.hidden=true);
  $(b.dataset.tab).hidden=false;
});
async function active(){return (await chrome.tabs.query({active:true,currentWindow:true}))[0]}

function renderSource(d){
  source=d; $("aliData").hidden=false;
  $("rawTitle").value=d.sourceTitle||"";
  $("rawPrice").value=(d.prices||[])[0]||"";
  $("shipping").value=(d.shipping||[])[0]||"";
  $("imageCount").textContent=`(${(d.images||[]).length})`;
  $("gallery").innerHTML="";
  (d.images||[]).forEach((im,i)=>{
    let c=document.createElement("div");c.className="card";
    const img=document.createElement('img');try{if(new URL(im.url).protocol==='https:')img.src=im.url;}catch{}
    const check=document.createElement('input');check.className='imgcheck';check.type='checkbox';check.dataset.i=i;check.checked=true;
    const caption=document.createElement('small');caption.textContent='#'+(i+1);c.append(img,check,caption);
    $("gallery").appendChild(c);
  });
  $("rawExtra").textContent=JSON.stringify({
    variants:d.variants,variantImages:d.variantImages,specifics:d.specifics,
    prices:d.prices,shipping:d.shipping
  },null,2);
}
function selectedImages(){
  if(!source)return[];
  return [...document.querySelectorAll(".imgcheck:checked")].map(x=>source.images[+x.dataset.i]);
}
$("scrape").onclick=async()=>{
  let t=await active();
  if(!/aliexpress\./i.test(t?.url||"")) return $("status").textContent="Ouvre d'abord une fiche produit AliExpress.";
  $("status").textContent="Scan de la page…";
  chrome.tabs.sendMessage(t.id,{type:"ALI_SCRAPE"},async r=>{
    if(chrome.runtime.lastError||!r?.ok){$("status").textContent="Le scan a échoué. Recharge la fiche puis réessaie.";return}
    source=r.data; await chrome.storage.local.set({source}); renderSource(source);
    $("status").textContent="Produit scrapé ✓";
  });
};
$("selectAll").onclick=()=>document.querySelectorAll(".imgcheck").forEach(x=>x.checked=true);
$("selectNone").onclick=()=>document.querySelectorAll(".imgcheck").forEach(x=>x.checked=false);
$("downloadSelected").onclick=()=>{
  selectedImages().forEach((im,i)=>chrome.downloads.download({
    url:im.url,filename:`AliExpress_Product/image_${String(i+1).padStart(2,"0")}.jpg`,saveAs:false
  }));
};
$("copyForChatGPT").onclick=async()=>{
  if(!source)return;
  const exportData={...source,sourceTitle:$("rawTitle").value,selectedImages:selectedImages()};
  const prompt=`Je veux transformer ce produit AliExpress en fiche eBay propre. Utilise uniquement les informations produit ci-dessous pour les faits (matériaux, dimensions, variantes, etc.). Optimise le titre et la description sans inventer de caractéristiques. Propose un prix de vente cohérent en tenant compte du coût détecté. Les URL d'images sont fournies pour éviter les screenshots.

IMPORTANT POUR MON EXTENSION :
À la fin de ta réponse, renvoie UN SEUL bloc JSON valide entre les marqueurs EBAY_LISTING_JSON_START et EBAY_LISTING_JSON_END, sans markdown dans le JSON, avec exactement cette structure :
{
 "title":"",
 "price":"",
 "condition":"Neuf",
 "category":"",
 "description":"",
 "specifics":{"clé":"valeur"},
 "variants":[],
 "selectedImageUrls":[]
}

DONNÉES SCRAPÉES :
${JSON.stringify(exportData,null,2)}`;
  await navigator.clipboard.writeText(prompt);
  $("status").textContent="Copié ✓ Colle maintenant dans ChatGPT.";
};
$("importAI").onclick=async()=>{
  const txt=$("aiInput").value;
  let raw=txt;
  const a=txt.indexOf("EBAY_LISTING_JSON_START"), b=txt.indexOf("EBAY_LISTING_JSON_END");
  if(a>=0&&b>a) raw=txt.slice(a+"EBAY_LISTING_JSON_START".length,b).trim();
  raw=raw.replace(/^```(?:json)?/i,"").replace(/```$/,"").trim();
  try{
    listing=JSON.parse(raw);
    await chrome.storage.local.set({listing});
    renderListing(listing);
  }catch(e){alert("Je n'arrive pas à lire la réponse. Vérifie que tu as copié le bloc JSON complet.")}
};
function renderListing(d){
  listing=d;$("aiPreview").hidden=false;
  $("ebayTitle").value=d.title||"";$("ebayPrice").value=d.price||"";
  $("condition").value=d.condition||"Neuf";$("category").value=d.category||"";
  $("ebayDescription").value=d.description||"";
  $("specifics").value=JSON.stringify(d.specifics||{},null,2);
}
function collectListing(){
  let sp={};try{sp=JSON.parse($("specifics").value||"{}")}catch(e){}
  return {...(listing||{}),title:$("ebayTitle").value,price:$("ebayPrice").value,
    condition:$("condition").value,category:$("category").value,
    description:$("ebayDescription").value,specifics:sp};
}
$("saveAI").onclick=async()=>{listing=collectListing();await chrome.storage.local.set({listing});alert("Fiche enregistrée ✓")};
$("openEbay").onclick=()=>chrome.tabs.create({url:"https://www.ebay.fr/sl/sell"});
$("fillEbay").onclick=async()=>{
  listing=collectListing();
  let t=await active();
  if(!/ebay\./i.test(t?.url||""))return $("ebayStatus").textContent="Ouvre d'abord la création d'annonce eBay.";
  chrome.tabs.sendMessage(t.id,{type:"EBAY_FILL",data:listing},r=>{
    if(chrome.runtime.lastError||!r?.ok){$("ebayStatus").textContent="Autofill non reconnu sur cette page. Envoie-moi une capture.";return}
    const ok=r.done?.length?`Rempli : ${r.done.join(", ")}.`:"Aucun champ reconnu.";
    const diag=r.diag?.length?` Diagnostic : ${r.diag.join(" / ")}.`:"";
    $("ebayStatus").textContent=ok+diag+" Vérifie avant publication.";
  });
};
chrome.storage.local.get(["source","listing"]).then(r=>{if(r.source)renderSource(r.source);if(r.listing)renderListing(r.listing)});
