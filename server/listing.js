import { randomUUID } from 'node:crypto';

export class InputError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
const str = (v, n = 10000) => typeof v === 'string' ? v.trim().slice(0, n) : '';
const list = v => Array.isArray(v) ? v : [];
export function safeUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : ''; } catch { return ''; }
}
export function parsePrice(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  const match = String(value ?? '').replace(/\s/g, '').match(/\d[\d.,]*/);
  if (!match) return null;
  let s = match[0].replace(/[.,]$/, '');
  if (s.includes(',') && s.includes('.')) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else s = s.replace(',', '.');
  const n = Number(s); return Number.isFinite(n) && n >= 0 ? n : null;
}
export function parseImport(raw) {
  if (typeof raw !== 'string' || !raw.trim()) throw new InputError('Collez les données du produit.');
  if (raw.length > 200000) throw new InputError('Import trop volumineux (200 Ko maximum).');
  let text = raw.trim();
  const marker = text.lastIndexOf('DONNÉES SCRAPÉES :');
  if (marker >= 0) text = text.slice(marker + 'DONNÉES SCRAPÉES :'.length).trim();
  const wrapped = text.match(/EBAY_LISTING_JSON_START\s*([\s\S]*?)\s*EBAY_LISTING_JSON_END/);
  if (wrapped) text = wrapped[1];
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let d;
  try { d = JSON.parse(text); } catch {
    if (/^[{[]/.test(text)) throw new InputError('JSON invalide. Vérifiez les accolades et les virgules.');
    d = { sourceTitle: text.split('\n')[0], description: text };
  }
  if (!d || Array.isArray(d) || typeof d !== 'object') throw new InputError('Un objet produit JSON est attendu.');
  const title = str(d.sourceTitle || d.title, 300);
  if (!title) throw new InputError('Le produit doit avoir un titre (sourceTitle ou title).');
  const specifics = Object.fromEntries(Object.entries(d.specifics || {}).filter(([k,v]) => k.length < 70 && typeof v === 'string').slice(0,50).map(([k,v]) => [k,str(v,300)]));
  const currencyText = String(d.prices?.[0] ?? d.price ?? '');
  const currency = str(d.currency || d.price?.currency,3).toUpperCase() || (/\$/.test(currencyText) ? 'USD' : /£/.test(currencyText) ? 'GBP' : 'EUR');
  if (!['EUR','USD','GBP'].includes(currency)) throw new InputError('Devise acceptée : EUR, USD ou GBP.');
  return { title, description: str(d.description), cost: parsePrice(d.cost ?? d.price?.min ?? d.price ?? d.prices?.[0]), currency,
    sourceUrl: safeUrl(d.sourceUrl), specifics,
    images: [...new Set(list(d.selectedImages ?? d.selectedImageUrls ?? d.sourceImages ?? d.images).map(x => safeUrl(typeof x === 'string' ? x : x?.url)).filter(Boolean))].slice(0,20),
    materials: list(d.materials).map(x=>str(x,80)).filter(Boolean).slice(0,20),
    variants: list(d.variants).slice(0,80).map(x => typeof x === 'string' ? x : JSON.stringify(x)).map(x=>str(x,500)),
    shipping: list(d.shipping).map(x=>str(x,300)), importedAt: new Date().toISOString() };
}
export function pricing(cost, options = {}) {
  const multiplier = Number(options.multiplier ?? 2.4), shipping = Number(options.shipping ?? 0), fees = Number(options.fees ?? 13);
  if (!Number.isFinite(multiplier) || multiplier < 1 || multiplier > 20 || !Number.isFinite(shipping) || shipping < 0 || shipping > 10000 || !Number.isFinite(fees) || fees < 0 || fees >= 80) throw new InputError('Réglages de prix invalides.');
  if (cost === null) return { price: 0, estimatedProfit: 0, multiplier, shipping, fees };
  const price = Math.ceil(((cost + shipping) * multiplier / (1 - fees / 100)) * 100) / 100;
  return { price, estimatedProfit: Math.round((price * (1 - fees / 100) - cost - shipping) * 100) / 100, multiplier, shipping, fees };
}
export function demoListing(source, options) {
  const p = pricing(source.cost, options);
  const materials = source.materials.length ? source.materials : Object.entries(source.specifics).filter(([k])=>/mat[eé]ria|mati[eè]re|material/i.test(k)).map(([,v])=>v).slice(0,20).map(v=>v.slice(0,80));
  return { id: randomUUID(), title: source.title.slice(0,140), description: [source.description || source.title, ...Object.entries(source.specifics).map(([k,v])=>`${k} : ${v}`)].join('\n\n').slice(0,10000),
    price: p.price, currency: source.currency, tags: [...new Set(source.title.toLowerCase().match(/[\p{L}\p{N}]{4,20}/gu) || [])].slice(0,13), materials,
    variants: source.variants, images: source.images, specifics: source.specifics, category: '', condition: 'Neuf',
    source, pricing: p, generation: 'demo', updatedAt: new Date().toISOString() };
}
export function validateListing(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new InputError('Fiche invalide.');
  if (!str(d.title,141) || d.title.length > 140) throw new InputError('Le titre doit contenir 1 à 140 caractères.');
  if (!str(d.description) || d.description.length > 10000) throw new InputError('La description doit contenir 1 à 10 000 caractères.');
  if (typeof d.price !== 'number' || !Number.isFinite(d.price) || d.price < 0 || d.price > 1000000) throw new InputError('Prix invalide.');
  if (!['EUR','USD','GBP'].includes(d.currency)) throw new InputError('Devise invalide.');
  for (const [key,max,len] of [['tags',13,20],['materials',20,80],['variants',80,500],['images',20,2048]]) {
    if (!Array.isArray(d[key]) || d[key].length > max || d[key].some(v=>typeof v !== 'string' || v.length > len)) throw new InputError(`Champ ${key} invalide (maximum ${max} éléments, ${len} caractères chacun).`);
  }
  if (d.images.some(u=>!safeUrl(u) && !/^\/media\/[a-f0-9-]{36}\.(png|jpg|webp|svg)$/.test(u))) throw new InputError('Les images doivent utiliser des URL HTTPS ou les fichiers générés du studio.');
  return { ...d, title: d.title.trim(), description: d.description.trim() };
}
export function marketplacePlan(market, listing) {
  const l = validateListing(listing);
  const warnings = [];
  if (!l.price) warnings.push('Renseigner un prix de vente supérieur à zéro.');
  if (!l.images.length) warnings.push('Ajouter au moins une image autorisée.');
  if (!l.category) warnings.push('Choisir un identifiant de catégorie marketplace.');
  if (l.variants.length) warnings.push('Mapper les variantes vers les propriétés et stocks de la marketplace.');
  if (market === 'ebay') {
    if (l.title.length > 80) warnings.push('Raccourcir le titre eBay à 80 caractères.');
    warnings.push('Configurer emplacement, stock et politiques de paiement, livraison et retour.');
    return { market, warnings, steps: ['PUT inventory_item/{sku}', 'POST offer', 'POST offer/{offerId}/publish'], payload: {
      inventoryItem: { product: { title: l.title, description: l.description, imageUrls: l.images }, condition: 'NEW' },
      offer: { marketplaceId: 'EBAY_FR', format: 'FIXED_PRICE', categoryId: l.category, pricingSummary: { price: { value: l.price.toFixed(2), currency: l.currency } } }
    } };
  }
  if (market !== 'etsy') throw new InputError('Marketplace inconnue.');
  warnings.push('Vérifier l’éligibilité Etsy ; un produit revendu ne devient pas fait main.', 'Configurer shop_id, taxonomy_id, who_made, when_made, profil de livraison et images.');
  return { market, warnings, steps: ['POST shops/{shop_id}/listings (draft)', 'Upload images / inventory', 'PATCH listing state=active'], payload: { title: l.title, description: l.description, price: l.price, tags: l.tags, materials: l.materials, taxonomy_id: l.category, state: 'draft' } };
}
