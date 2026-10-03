export function mountWorkspace() {
  document.querySelector('nav').insertAdjacentHTML('beforeend','<button class="nav" data-page="settings"><span>⚙</span> Réglages</button><button class="nav" data-page="history"><span>◷</span> Historique</button>');
  document.querySelector('main').insertAdjacentHTML('beforeend',`<section id="settings" class="page" hidden><div class="page-heading"><div class="eyebrow">VOTRE BOUTIQUE, VOS RÉGLAGES</div><h1>Configuration</h1><p>Les clés sont chiffrées sur ce serveur et ne sont jamais réaffichées. Laissez un champ secret vide pour le conserver.</p></div><form id="settingsForm"><div id="settingsFields" class="connection-grid"></div><button class="primary" type="submit">Enregistrer les réglages</button></form><p class="subtext">Le mode Simulation n’envoie aucune annonce. En mode Vente réelle, eBay utilise encore son environnement de test tant que Sandbox vaut true. Changer les identifiants d’une marketplace déconnecte le compte.</p></section><section id="history" class="page" hidden><div class="page-heading"><div class="eyebrow">SUIVI DES ENVOIS</div><h1>Historique</h1><p>Une réponse incertaine bloque les nouveaux envois de la même fiche. Vérifiez alors votre compte vendeur avant toute nouvelle annonce.</p></div><button id="refreshHistory" class="secondary">Actualiser</button><div id="historyList" class="draft-grid"></div></section>`);
  document.querySelector('#editor .button-row').insertAdjacentHTML('beforebegin',`<details class="sale-details" open><summary>Données de vente</summary><div class="field-row"><div class="field"><label for="quantity">Quantité disponible</label><input id="quantity" type="number" min="1" max="999" step="1" placeholder="Stock vérifié"></div><div class="field"><label for="selectedVariant">Variante à vendre</label><select id="selectedVariant"><option value="">Sans variante</option></select></div></div><p class="fine-print">Une variante par annonce dans cette version. Le prix, le stock et les images doivent correspondre à la variante choisie. Produits neufs uniquement.</p><div class="field"><label for="specifics">Caractéristiques eBay <span>Une par ligne : Nom : Valeur</span></label><textarea id="specifics" rows="3" placeholder="Marque : …"></textarea></div><label class="check-row"><input id="verified" type="checkbox">J’ai vérifié les caractéristiques, le stock et les droits sur les images.</label><details><summary>Informations obligatoires pour Etsy</summary><div class="field"><label for="whoMade">Qui a fabriqué le produit ?</label><select id="whoMade"><option value="">Choisir</option><option value="someone_else">Un autre fabricant</option><option value="i_did">Moi-même</option><option value="collective">Un membre de ma boutique</option></select></div><div class="field"><label for="whenMade">Période de fabrication (code Etsy)</label><input id="whenMade" placeholder="Ex. made_to_order si fabriqué sur commande"></div><label class="check-row"><input id="isSupply" type="checkbox">Il s’agit d’une fourniture créative.</label><label class="check-row"><input id="etsyEligible" type="checkbox">Ce produit respecte les critères de vente Etsy. Je ne déclare pas une revente comme une fabrication personnelle.</label></details></details>`);
  document.querySelector('.setup').innerHTML='<h2>Activer votre boutique</h2><ol><li>Configurez OpenAI uniquement dans les variables d’environnement du serveur. Dans Réglages, personnalisez vos prompts image.</li><li>Ajoutez les identifiants et profils de la marketplace, puis connectez le compte.</li><li>Testez eBay en Sandbox. Passez ensuite en Vente réelle et vérifiez l’environnement choisi.</li><li>Complétez la fiche, puis validez le récapitulatif de publication.</li></ol><p>Les connexions sont conservées chiffrées et renouvelées par le serveur. L’éligibilité Etsy, la catégorie, les caractéristiques et les profils vendeur doivent être corrects avant l’envoi.</p>';
  document.body.insertAdjacentHTML('beforeend',`<dialog id="publishDialog"><h2>Confirmer la publication</h2><p id="publishSummary"></p><p id="publishFees"></p><div class="button-row"><button id="cancelPublish" class="secondary">Annuler</button><button id="confirmPublish" class="primary">Publier cette annonce</button></div></dialog>`);
}
export function updateVariantOptions(listing) {
  const select=document.getElementById('selectedVariant');select.replaceChildren();
  const empty=new Option(listing.variants.length?'Choisir une variante':'Sans variante','');select.append(empty);
  for(const v of listing.variants)select.append(new Option(v,v));select.value=listing.selectedVariant || '';
}
export async function loadSettings(api) {
  const {fields}=await api('settings'),root=document.getElementById('settingsFields');root.replaceChildren();const groups={};
  for(const f of fields) {
    if(!groups[f.group]){const panel=document.createElement('section');panel.className='panel';const h=document.createElement('h2');h.textContent=f.group;panel.append(h);groups[f.group]=panel;root.append(panel);}
    const div=document.createElement('div');div.className='field';const label=document.createElement('label');label.htmlFor='setting-'+f.key;label.textContent=f.label;
    const input=document.createElement(f.options?'select':'input');input.id='setting-'+f.key;input.name=f.key;
    if(f.options)for(const value of f.options){const text=f.key==='MARKETPLACE_MODE'?{demo:'Simulation',live:'Vente réelle'}[value]:f.key==='EBAY_SANDBOX'?{true:'Sandbox — compte de test',false:'Production — ventes réelles'}[value]:value;input.append(new Option(text,value));}
    else {input.type=f.secret?'password':'text';input.autocomplete='off';input.placeholder=f.secret && f.configured?'Déjà enregistré — laisser vide pour conserver':'';}
    input.value=f.value;div.append(label,input);groups[f.group].append(div);
  }
}
export async function loadHistory(api) {
  const {publications}=await api('history'),root=document.getElementById('historyList');root.replaceChildren();
  if(!publications.length){const p=document.createElement('p');p.textContent='Aucune publication réelle pour le moment. Les simulations ne sont pas enregistrées ici.';root.append(p);}
  for(const item of publications){
    const card=document.createElement('section');card.className='panel draft-card';const h=document.createElement('h2');h.textContent=item.title;
    const state=document.createElement('p');state.textContent=`${item.market}${item.sandbox?' · Sandbox':''} · ${{published:'Publié',failed:'Échec — corriger avant de reprendre',uncertain:'À vérifier dans votre compte',working:'En cours',pending:'Étape en cours ou réponse incertaine'}[item.status] || item.status}`;
    const note=document.createElement('p');note.textContent=item.error || `${item.variant || 'Sans variante'} · ${new Date(item.createdAt).toLocaleString('fr-FR')}`;
    card.append(h,state,note);
    if(item.result?.url){const a=document.createElement('a');a.href=item.result.url;a.target='_blank';a.rel='noopener noreferrer';a.className='secondary';a.textContent='Voir l’annonce ↗';card.append(a);}root.append(card);
  }
}
export function confirmPublication(data) {
  const d=document.getElementById('publishDialog');const s=data.summary;
  document.getElementById('publishSummary').textContent=`${data.market.toUpperCase()}${data.sandbox?' · ENVIRONNEMENT DE TEST':''}\n${s.title}\n${s.price.toFixed(2)} ${s.currency} · ${s.quantity} disponible(s)\nVariante : ${s.variant} · ${s.images} image(s)`;
  document.getElementById('publishFees').textContent=data.sandbox?'Cette annonce sera créée dans le compte eBay de test.':'Cette action met l’annonce en ligne et peut entraîner les frais de votre marketplace. En confirmant, vous acceptez ces frais selon votre contrat vendeur.';
  d.showModal();return new Promise(resolve=>{
    const finish=value=>{d.close();resolve(value);};
    document.getElementById('confirmPublish').onclick=()=>finish(true);document.getElementById('cancelPublish').onclick=()=>finish(false);d.oncancel=e=>{e.preventDefault();finish(false);};
  });
}
