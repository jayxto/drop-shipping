function visible(e){return !!e && !!(e.offsetWidth||e.offsetHeight||e.getClientRects().length)}
function fields(){return [...document.querySelectorAll('input,textarea,[contenteditable="true"],iframe')].filter(visible)}
function ctx(el){
 let a=[el.getAttribute?.("aria-label"),el.getAttribute?.("placeholder"),el.getAttribute?.("name"),el.id];
 if(el.id){try{a.push(document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.innerText)}catch(e){}}
 a.push(el.closest?.("fieldset")?.innerText,el.parentElement?.innerText);
 return a.filter(Boolean).join(" ").toLowerCase().slice(0,1500);
}
function find(words, tags){
 return fields().find(e=>(!tags||tags.includes(e.tagName))&&words.some(w=>ctx(e).includes(w)));
}
function setInput(el,v){
 if(!el)return false;
 const value=String(v??"");
 el.focus();
 const proto=el.tagName==="TEXTAREA"?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
 const setter=Object.getOwnPropertyDescriptor(proto,"value")?.set;
 setter?setter.call(el,value):(el.value=value);
 el.dispatchEvent(new InputEvent("input",{bubbles:true,inputType:"insertText",data:value}));
 el.dispatchEvent(new Event("change",{bubbles:true}));
 el.dispatchEvent(new Event("blur",{bubbles:true}));
 return true;
}
function setRich(el,v){
 if(!el)return false;
 el.focus(); el.innerHTML="";
 const lines=String(v||"").split("\n");
 lines.forEach((line,i)=>{if(i)el.appendChild(document.createElement("br"));el.appendChild(document.createTextNode(line))});
 el.dispatchEvent(new InputEvent("input",{bubbles:true,inputType:"insertText",data:String(v||"")}));
 el.dispatchEvent(new Event("change",{bubbles:true})); return true;
}
function fillDescription(v){
 let el=find(["description"],["TEXTAREA"]);
 if(el)return setInput(el,v);
 el=find(["description"],["DIV","P"]);
 if(el&&el.getAttribute("contenteditable")==="true")return setRich(el,v);
 // Common rich editor: contenteditable may be nested inside a description container.
 const containers=[...document.querySelectorAll("section,div")].filter(x=>visible(x)&&/description/i.test((x.innerText||"").slice(0,120)));
 for(const c of containers){const ed=c.querySelector('[contenteditable="true"]');if(ed&&visible(ed))return setRich(ed,v)}
 // Same-origin iframe fallback.
 for(const fr of [...document.querySelectorAll("iframe")].filter(visible)){
   try{const body=fr.contentDocument?.body;if(body&&body.isContentEditable){return setRich(body,v)}}catch(e){}
 }
 return false;
}
function normalizePrice(v){
 const n=Number(String(v??"").replace(/\s/g,"").replace(",",".").replace(/[^\d.]/g,""));
 return Number.isFinite(n)?n.toFixed(2):String(v??"");
}
function fill(d){
 const done=[],diag=[];
 const title=find(["titre","title"],["INPUT","TEXTAREA"]);
 if(setInput(title,d.title)){done.push("titre")}else diag.push("titre introuvable");
 const price=find(["prix","price","buy it now","achat immédiat"],["INPUT"]);
 const pv=normalizePrice(d.price);
 if(setInput(price,pv)){done.push("prix "+pv)}else diag.push("prix introuvable");
 if(fillDescription(d.description)){done.push("description")}else diag.push("description introuvable");
 return {done,diag};
}
chrome.runtime.onMessage.addListener((m,_s,r)=>{
 if(m?.type==="EBAY_FILL"){try{r({ok:true,...fill(m.data||{})})}catch(e){r({ok:false,error:String(e)})}}
});