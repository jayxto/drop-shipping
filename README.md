# Drop Studio

Atelier vendeur en français : **lien AliExpress → génération → fiche modifiable → publication Etsy/eBay**. Interface sombre, import par navigateur Chromium, démo sans clé, brouillons persistants, export et historique des envois.

## Démarrage

Node.js 22.9+ (24 recommandé) et npm :

```sh
npm install
npx playwright install chromium
npm start
```

Ouvrir **http://localhost:3000**. Sans clé API, le bouton « Essayer un exemple » permet de tester le parcours en démo. Pour Linux : `npx playwright install --with-deps chromium`. Sur Windows, `BROWSER_CHANNEL=msedge` dans `.env` utilise Edge déjà installé. Le serveur charge `.env` avec `npm start`. Sans npm, après installation des dépendances : `node --env-file-if-exists=.env server/index.js`.

## Configuration dans le site

1. **Réglages → IA** : saisir la clé API OpenAI et un modèle compatible Responses/Structured Outputs accessible à votre compte. L'abonnement ChatGPT ne remplace pas cette configuration API. Sans les deux champs, la génération reste une démo déterministe.
2. **Réglages → eBay/Etsy** : identifiants de l'application et profils vendeur.
3. **Connexions** : autoriser le compte vendeur via OAuth.
4. Tester eBay avec **Sandbox = true**. Choisir **Vente réelle** pour activer les appels API ; eBay reste dans Sandbox tant que son réglage vaut true. Etsy n'a pas de mode Sandbox dans l'application.
5. Importer un produit, relire, indiquer le stock réel, la catégorie marketplace, la variante vendue et ses images. Vérifier les caractéristiques obligatoires. Confirmer le récapitulatif avant l'envoi.

Les champs secrets restent vides après sauvegarde ; un champ vide conserve sa valeur. Les réglages sauvegardés priment sur les variables d'environnement. Changer les identifiants/environnement d'une marketplace déconnecte le compte. Déconnecter efface les jetons du serveur mais ne révoque pas l'application dans le compte marketplace.

## Publication implémentée

- **eBay France, produits neufs, EUR** : création/remplacement de l'inventaire, création d'offre avec stock/emplacement/profils vendeur, puis publication. Les caractéristiques de catégorie se modifient dans la fiche. Les images sont transmises sous forme d'URL HTTPS.
- **Etsy, produits physiques éligibles** : création de brouillon avec taxonomie, auteur, période, profil de préparation/livraison/retour ; téléchargement borné des images fournisseur JPEG/PNG ; upload multipart et activation après confirmation. Cette version accepte au plus 10 images provenant de `aliexpress-media.com` ou `alicdn.com`.
- **Une variante choisie par annonce** : titre/description précisent cette variante. Le prix, les images et le stock doivent correspondre à ce choix. Les groupes multivariantes dans une annonce unique ne sont pas implémentés.
- **Prévention des doublons** : journal durable avant/après chaque étape. Une répétition d'un envoi déjà publié retourne son résultat sans publier à nouveau. Un refus explicite permet de reprendre les étapes non terminées si la fiche/configuration est inchangée. Une réponse incertaine ou une interruption bloque l'envoi : vérifier manuellement la marketplace avant toute nouvelle annonce. L'interface Historique affiche l'état.

Une modification de fiche déjà publiée n'est pas synchronisée vers la marketplace. Les commandes, achats fournisseur, suivi livraison et synchronisation des stocks ne sont pas gérés. Une catégorie peut exiger des informations supplémentaires propres au vendeur/produit ; les erreurs de l'API sont présentées avec l'étape et le code HTTP. Un produit revendu ne doit pas être déclaré comme fait main.

**Validation réelle encore nécessaire avec vos comptes** : les adaptateurs ont des tests à transport simulé. Sans identifiants fournis, aucune annonce payante, connexion OAuth réelle ou génération OpenAI réelle n'a été exécutée pendant le développement.

## Import AliExpress

Coller l'URL complète HTTPS `/item/<id>.html`. Le serveur ouvre un contexte Chromium neuf, attend les données JavaScript, lit JSON-LD/Open Graph ou le DOM. Aucun cookie/profil personnel n'est importé. Deux imports simultanés, lancement borné à 15 s puis chargement à 45 s ; navigateur fermé après chaque requête. Les ressources sont limitées aux domaines marketplace/CDN HTTPS. Service workers, WebSockets et téléchargements sont bloqués.

AliExpress peut demander un CAPTCHA/une connexion ou bloquer les serveurs : l'application s'arrête explicitement, sans contournement ni données inventées. Le lien réel fourni n'a pas pu être vérifié dans cette session car l'outil de navigation en bloquait l'accès. Une fixture locale JavaScript a validé le lecteur DOM.

Repli : ouvrir « Import via extension ou fichier », coller le texte entier du bouton **Copier pour ChatGPT** de l'extension `ali-ebay-bridge-v2.1`. Les marqueurs `DONNÉES SCRAPÉES :` et `EBAY_LISTING_JSON_START…END` sont reconnus. L'extension existante n'est pas modifiée/installée automatiquement. L'export JSON inclut `selectedImageUrls` pour sa compatibilité.

`ALIEXPRESS_IMPORT_MODE=metadata` active l'ancien mode HTML statique. `SCRAPER_API_URL` active un extracteur de confiance prioritaire : endpoint HTTPS recevant `POST {"url":"https://…"}`, clé optionnelle `SCRAPER_API_KEY` en Bearer, réponse produit au format bridge directement ou sous `product`. Adapter votre fournisseur à ce contrat ; aucun fournisseur particulier n'est inclus.

## Identifiants et profils à renseigner

### eBay

Créer une application développeur et les clés de l'environnement choisi. Enregistrer une URL de retour `https://votre-site/api/oauth/ebay/callback` dans le portail et renseigner le **RuName** associé (pas l'URL) dans Réglages. Scope : `sell.inventory`.

Le compte doit déjà posséder un emplacement Inventory API actif (`EBAY_LOCATION_KEY`) et les politiques de paiement, retour et livraison applicables à eBay France. Copier leurs IDs dans Réglages. Il ne suffit pas de saisir le nom d'une politique. Le site ne crée pas ces règles commerciales à votre place.

### Etsy

Enregistrer une URL de retour **HTTPS exacte** : `https://votre-site/api/oauth/etsy/callback`. Renseigner keystring, shared secret, ID de boutique, devise réelle de la boutique et IDs des profils de livraison, préparation (`readiness_state_id`) et retour. Scopes : `listings_r listings_w shops_r`. Les appels utilisent `x-api-key: keystring:shared_secret` côté serveur.

La fiche demande `who_made`, `when_made`, `is_supply` et confirmation de l'éligibilité. Exemples de codes de période : `2020_2026`, `2010_2019`, `made_to_order` (uniquement si vraiment fabriqué sur commande). Aucun de ces faits n'est choisi automatiquement.

## Sécurité et persistance

- Espace personnel **un vendeur**, une instance serveur. Brouillons partagés dans cet espace, pas un SaaS multiclient.
- Clés et jetons dans `vault.enc`, chiffrés AES-256-GCM. La clé est `VAULT_KEY` (32 octets base64) ou `vault.key` générée localement. Protéger et sauvegarder les deux ; le chiffrement ne protège pas contre un accès complet au serveur et à sa clé.
- Jetons renouvelés côté serveur ; sessions navigateur temporaires avec cookies HttpOnly/SameSite et Secure sous HTTPS.
- Contrôles Host/Origin/CSRF, CSP, taille des requêtes et débit par session. Pas de secrets dans le code client, journaux de publication ou réponses de configuration.
- Répertoire par défaut `.data`, personnalisable via `DATA_DIR`. Contient brouillons, coffre et historique. Écritures sérialisées et remplacement atomique. Sauvegarder régulièrement ; maximum 200 brouillons conservés, historique conservé sans purge automatique.
- `.env`, `.data`, dépendances et secrets sont ignorés par Git et Docker.
- Exposition publique : `APP_PASSWORD` fort obligatoire, HTTPS, reverse proxy conservant Host exact. Ne pas journaliser les URL complètes des callbacks OAuth. Basic derrière TLS convient à cet espace personnel ; utiliser un VPN/proxy d'authentification pour une protection complémentaire.
- Isoler Chromium dans un conteneur sans accès aux réseaux privés/services internes. Le filtrage des domaines n'est pas un remplacement pour des règles réseau.

## Hébergement et Docker

Le `Dockerfile` installe Chromium et les bibliothèques système. Pour un test Docker local : définir `APP_PASSWORD`, puis `docker compose up --build`. Le volume `studio-data` conserve les données. Docker et le déploiement distant doivent être validés sur l'hôte choisi.

Pour Render : service web Docker depuis la branche du projet, région Europe si disponible, **une instance** et disque persistant monté sur `/data`. Variables : `HOST=0.0.0.0`, `DATA_DIR=/data`, `APP_PASSWORD` secret. `APP_URL` peut être omis : `RENDER_EXTERNAL_URL` fourni par Render est utilisé. Health check : `/healthz`. L'URL publique doit être enregistrée dans les portails OAuth. Un disque persistant exige une offre compatible ; vérifier son coût avant création. Une offre avec stockage éphémère n'est pas adaptée aux identifiants et brouillons durables.

## Prix et génération

`prix = ceil(((coût + livraison) × coefficient / (1 − frais/100)) × 100)/100`.
Le résultat estimé déduit coût, livraison et frais saisis. Les 13 % par défaut sont une hypothèse modifiable, pas un tarif officiel. Fiscalité, retours, publicité, frais fixes et change exclus. Une plage fournisseur utilise le premier prix : vérifier la variante.

OpenAI rédige titre/description/tags via Responses et schéma strict (`store:false`). Images, matériaux et variantes restent issus de la source ; le prix est local. Les données sont traitées comme non fiables ; relire les faits. Une erreur IA n'est pas masquée par la démo.

## Tests et fichiers

```sh
npm test
npm run check
```

Tests : import URL/bridge, navigateur simulé, prix, IA simulée, PKCE et rejeu, renouvellement OAuth, coffre chiffré, validation vendeur, enchaînement eBay/Etsy simulé, upload d'images, doublons et réponses incertaines, confirmation serveur, CSRF, secrets et stockage. Aucun test ne dépense de crédit ni ne publie réellement.

`public/` interface ; `server/aliexpress.js` et `browser-import.js` import ; `listing.js` normalisation ; `generate.js` IA ; `oauth.js` connexion/renouvellement ; `storage.js` coffre/journal ; `settings.js` configuration ; `marketplaces.js` publication ; `index.js` HTTP. Contrat : [docs/API.md](docs/API.md).

Références : [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [OAuth Etsy](https://developers.etsy.com/documentation/essentials/authentication/), [fiches Etsy](https://developers.etsy.com/documentation/tutorials/listings/), [autorisation eBay](https://developer.ebay.com/develop/guides/sell/authorization), [publication eBay](https://developer.ebay.com/api-docs/sell/static/inventory/publishing-offers.html), [installation Chromium](https://playwright.dev/docs/browsers).
