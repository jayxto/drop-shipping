# Drop Studio

Atelier web sombre en français : **lien AliExpress → génération → fiche modifiable → préparation Etsy/eBay**. Compatible aussi avec le format et le prompt du ZIP `ali-ebay-bridge-v2.1` fourni pour ce projet.

## Démarrer

**Node.js 22.9+**, aucune dépendance à télécharger ni build nécessaire.

```sh
node server/index.js
```

Ouvrir **http://localhost:3000**, puis **Essayer un exemple → Générer ma fiche**. Modifier, enregistrer et simuler un envoi. Sans identifiants, aucune requête IA ou marketplace n'est effectuée. Le vase est une illustration SVG locale explicitement identifiée, pas une photo fournisseur.

Avec npm : `npm start`, `npm run dev`, `npm test`. Sans npm :

```sh
node --watch --env-file-if-exists=.env server/index.js
node --test
node --check public/app.js
```

## Fonctionnalités

- Lien produit AliExpress comme entrée principale : récupération serveur des métadonnées publiques, puis génération en un clic.
- Import JSON collé, fichier `.json`/`.txt`, texte libre et prompt complet du bridge.
- Reconnaissance de `sourceTitle`, `prices`, `specifics`, `variants`, `images: [{url}]`, `selectedImages`, `sourceUrl`, `shipping`. Une sélection d'images vide est respectée.
- Anciens blocs `EBAY_LISTING_JSON_START…END` et blocs Markdown JSON acceptés.
- Génération démo déterministe ou OpenAI réelle selon la configuration.
- Édition du titre, description, prix, devise, catégorie, tags, matériaux, variantes et URL d'images ; aperçu en direct et galerie.
- Calcul de prix configurable, estimation du résultat, brouillons persistants et export JSON compatible avec l'ancien bridge (`selectedImageUrls`).
- Simulation Etsy/eBay, contrôles et téléchargement du plan API.
- OAuth réel : Etsy PKCE S256, eBay authorization code, état aléatoire à usage unique, callback, échange serveur et déconnexion.

## Limites de publication

**Aucune annonce réelle n'est publiée par cette version.** `MARKETPLACE_MODE=connected` retourne volontairement HTTP 501 avec le plan API. Ajouter des clés ne supprime pas cette limite. Les plans sont des squelettes, pas des requêtes complètes directement envoyables.

Pour publier réellement, compléter :

- **Etsy** : boutique, taxonomie, quantité, auteur/date de fabrication, profils de livraison/traitement applicables, upload des images, mapping des variantes et stocks, activation du brouillon.
- **eBay** : emplacement, politiques vendeur, aspects obligatoires par catégorie, stock, images, groupes de variantes, création puis publication de l'offre.
- **Jetons** : coffre chiffré, renouvellement et révocation. Actuellement ils restent en mémoire, expirent, et une reconnexion est nécessaire après expiration/redémarrage.
- **Écritures fiables** : identifiants stables, journal des étapes, déduplication et réconciliation après une réponse incertaine. Ne pas réessayer aveuglément une publication payante.

Cette application est un espace personnel pour un vendeur. Un SaaS demanderait authentification multiclient, isolation des boutiques et brouillons, base de données et quotas globaux.

## Utiliser l'extension existante

Cette entrée est désormais un secours dans le panneau replié « Import via extension ou fichier ». Le parcours principal utilise le lien de l'annonce.

1. Dans l'extension : **Scraper le produit**, sélectionner les images, puis **Copier pour ChatGPT**.
2. Coller tout le texte dans Drop Studio. Inutile de passer par ChatGPT : le parseur extrait le JSON après `DONNÉES SCRAPÉES :`.
3. Vérifier les données, générer, modifier et enregistrer.

Le code du ZIP a été examiné : `aliexpress.js` pour le format source et `popup.js` pour les marqueurs/exports. L'extension n'est ni installée ni modifiée automatiquement. Son scraper reste dépendant du DOM AliExpress.

## Import par lien AliExpress

Coller un lien complet `https://www.aliexpress.com/item/123456789.html`, puis cliquer sur Générer. Le serveur supprime les paramètres de suivi, limite les domaines et chemins, refuse les redirections externes, récupère la page et lit ses métadonnées Product JSON-LD/Open Graph. Il n'exécute aucun script de la page et ne contourne ni connexion ni CAPTCHA. Les liens raccourcis ne sont pas acceptés : ouvrir le produit et copier son URL complète.

**AliExpress bloque souvent les requêtes serveur ou ne fournit les données qu'après exécution JavaScript. L'import direct n'est donc pas garanti pour toutes les annonces.** Dans ce cas, une erreur explicite est affichée ; aucune fiche n'est inventée. Le repli est l'extension existante ou un service d'extraction configuré par l'exploitant.

Pour une extraction plus complète, renseigner `SCRAPER_API_URL` avec un endpoint HTTPS de confiance et éventuellement `SCRAPER_API_KEY`. Ce connecteur générique attend `POST {"url":"https://…"}` avec `Authorization: Bearer <clé>` et une réponse produit au format du bridge, directement ou sous `{ "product": ... }`. Il faut adapter votre fournisseur à ce contrat ; ce n'est pas une intégration prête à l'emploi pour un fournisseur particulier. L'URL et la clé du service restent dans l'environnement serveur. Le lien est alors transmis à ce service. Aucune clé de scraping n'est requise pour essayer les métadonnées publiques.

Le prix et les variantes peuvent être absents ou incomplets dans les métadonnées publiques. Les vérifier dans la fiche source. Les tests utilisent des pages simulées ; aucun lien produit réel n'a été fourni pour valider l'extraction AliExpress en conditions réelles.

## Configuration

Copier `.env.example` en `.env`, compléter uniquement sur le serveur, puis lancer :

```sh
node --env-file=.env server/index.js
```

| Variable | Usage |
| --- | --- |
| `PORT` / `HOST` | `3000` / `127.0.0.1` par défaut |
| `APP_URL` | Origine exacte du navigateur, sans chemin ; adapter aussi le port |
| `APP_PASSWORD` | Mot de passe personnel ; nom d'utilisateur Basic libre |
| `OPENAI_API_KEY` | Clé serveur uniquement |
| `OPENAI_MODEL` | Modèle de votre compte compatible Responses + Structured Outputs |
| `SCRAPER_API_URL` / `SCRAPER_API_KEY` | Extracteur optionnel conforme au contrat ci-dessus |
| `MARKETPLACE_MODE` | `demo` ou `connected` ; publication réelle bloquée dans les deux cas |
| `ETSY_CLIENT_ID` | Keystring de l'application Etsy |
| `ETSY_SHARED_SECRET` | Prévu pour les futurs appels API Etsy, pas utilisé dans l'échange OAuth actuel |
| `ETSY_REDIRECT_URI` | URL HTTPS enregistrée, finissant par `/api/oauth/etsy/callback` |
| `EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET` | Clés du même environnement eBay |
| `EBAY_REDIRECT_URI` | **RuName** du portail eBay, pas l'URL du callback |
| `EBAY_SANDBOX` | `true` par défaut ; `false` sélectionne les endpoints OAuth production |

### OpenAI

Renseigner **les deux** variables OpenAI. Le serveur transmet les données à Responses avec `store:false` et un schéma JSON strict. Le modèle rédige titre, description et tags. Prix, matériaux, variantes et images restent calculés localement ou issus de la source. Une erreur IA n'est pas silencieusement remplacée par la démo. Les messages amont confidentiels ne sont pas renvoyés au navigateur.

Il s'agit de l'API OpenAI, pas d'une automatisation de chatgpt.com. L'abonnement ChatGPT ne configure pas la clé API du serveur. Tant que la clé et le modèle manquent, l'interface indique « Mode démo » et aucun modèle n'est appelé.

Le prompt traite les imports comme des données non fiables et interdit d'en suivre les instructions. Relire les faits générés. Le navigateur charge les images HTTPS saisies auprès de leurs hébergeurs ; le serveur ne télécharge pas d'URL utilisateur.

### Etsy OAuth

Créer une application dans le portail développeur. Enregistrer une URL **HTTPS** exacte et utiliser la même origine publique pour `APP_URL`. Etsy refuse les redirections HTTP : le mode local HTTP sert à la démo. Utiliser un reverse proxy HTTPS pour OAuth. Scopes : `listings_r listings_w shops_r`.

Ouvrir **Connexions → Connecter Etsy**. Le serveur vérifie `state`, PKCE, durée et usage unique. Pour les futurs appels API, prévoir `Authorization: Bearer …` et `x-api-key: keystring:shared_secret` côté serveur.

### eBay OAuth

Créer les clés Sandbox et un RuName. Enregistrer dans ce RuName l'URL de retour `https://votre-domaine/api/oauth/ebay/callback`. Configurer `EBAY_REDIRECT_URI` avec le **RuName**, puis connecter le compte Sandbox. La portée actuelle est `sell.inventory` ; ajouter `sell.account` et refaire le consentement si la récupération des politiques vendeur est implémentée.

Les échanges OAuth sont testés avec des réponses simulées, pas avec des comptes réels faute d'identifiants. Une connexion n'active aucune annonce.

## Prix

```text
prix = arrondi supérieur au centime de ((coût + livraison) × coefficient / (1 − frais / 100))
résultat = prix × (1 − frais / 100) − coût − livraison
```

8,50 €, coefficient 2,4, livraison 0 €, frais 13 % donnent **23,45 €**, résultat estimé **11,90 €**. Les frais par défaut sont une hypothèse, pas un barème officiel. Fiscalité, retours, publicité, frais fixes et change sont exclus. Sans coût : prix zéro à compléter. Après changement de devise : estimation à recalculer. Une plage de prix fournisseur utilise le premier montant, à vérifier pour chaque variante.

## Sécurité et stockage

- Liste fixe de fichiers publics : aucun accès HTTP à `.env`, `.data` ou au code serveur.
- Secrets serveur ; jetons OAuth en mémoire associés à un cookie aléatoire `HttpOnly`, `SameSite=Lax`, `Secure` sous HTTPS.
- Vérification d'hôte, origine et jeton CSRF ; 30 écritures/minute/session ; taille de requête bornée.
- CSP sans scripts inline ; valeurs rendues via `textContent`, jamais via HTML fournisseur.
- `.data/drafts.json` : écriture sérialisée avec remplacement atomique, 200 derniers brouillons conservés. Sauvegarder ce répertoire. Une seule instance serveur doit y accéder.
- Brouillons communs à l'espace personnel ; connexions propres à la session navigateur. Aucun identifiant API ajouté aux brouillons par l'application.
- `.env` et `.data` sont ignorés par Git. Ne jamais committer de secret.
- Par défaut, garder le serveur local. Pour l'exposer : mot de passe fort, HTTPS, proxy conservant le Host exact et limites de requêtes en frontal. Ne pas journaliser les URL complètes des callbacks OAuth. Basic derrière TLS convient à un atelier personnel, pas à un service multiclient.

## Organisation et tests

`public/` : interface, exemple et illustration. `server/listing.js` : import, validation, prix et plans. `server/generate.js` : démo et IA. `server/oauth.js` : OAuth. `server/index.js` : HTTP, sessions, CSRF et stockage. `test/` : tests sans réseau externe ni clés.

`node --test` couvre les imports du bridge, prix, données invalides, URL dangereuses, contrat IA, refus, PKCE, état OAuth invalide/rejoué, eBay, persistance HTTP, CSRF, fichiers privés et blocage de publication réelle.

## Références

- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Authentification Etsy](https://developers.etsy.com/documentation/essentials/authentication/)
- [Fiches Etsy](https://developers.etsy.com/documentation/tutorials/listings/)
- [Autorisation eBay](https://developer.ebay.com/develop/guides/sell/authorization)
- [Champs de publication eBay](https://developer.ebay.com/api-docs/sell/static/inventory/publishing-offers.html)

Vérifier les critères de chaque marketplace, les caractéristiques du produit et les droits sur les images avant publication. Un produit revendu ne devient pas fait main.
