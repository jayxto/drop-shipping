# API Drop Studio

JSON, même origine. `GET /api/config` fournit cookie et CSRF. Tous les POST exigent `Origin: <APP_URL>`, `Content-Type: application/json` et `X-CSRF-Token`. L'espace personnel est protégé par `APP_PASSWORD` en déploiement public.

| Route | Entrée | Résultat |
| --- | --- | --- |
| GET /healthz | — | santé, sans données confidentielles |
| GET /api/config | — | CSRF, modes, états de connexion, environnement eBay |
| GET /api/settings | — | champs de configuration ; aucun secret réaffiché |
| POST /api/settings | `{settings:{KEY:"value"}}` | valeurs autorisées enregistrées dans le coffre |
| POST /api/import | `{raw}` | source normalisée |
| POST /api/import-url | `{url}` | source, méthode et avertissements |
| POST /api/generate | `{raw,options:{multiplier,shipping,fees}}` | fiche générée |
| GET /api/drafts | — | brouillons |
| POST /api/drafts | `{listing}` | fiche enregistrée par UUID |
| POST /api/prepare/:market | `{listing}` | validation, résumé et jeton de confirmation valable 5 minutes |
| POST /api/publish/:market | `{listing,confirmation}` | simulation en mode demo ; publication en mode live |
| GET /api/history | — | états des publications sans identifiants API |
| POST /api/oauth/:market/start | `{}` | URL de consentement |
| GET /api/oauth/:market/callback | code + state | échange et stockage chiffré des jetons |
| POST /api/oauth/:market/disconnect | `{}` | suppression des jetons du serveur |

Marchés : `etsy`, `ebay`. Une fiche contient `id`, `title`, `description`, `price`, `currency`, `tags`, `materials`, `variants`, `images`, `category`, `condition`, `specifics`, `source`, `pricing`, `generation`, `updatedAt`.

Champs de vente : `quantity` entier 1–999, `selectedVariant` parmi les variantes s'il y en a, `verified:true`. Etsy exige aussi `etsyEligible:true`, `whoMade`, `whenMade`, `isSupply`. Les faits ne sont jamais inventés pour satisfaire l'API.

Le jeton de confirmation est lié à la session, au marché, à la fiche exacte et aux réglages publics. Usage unique, 5 minutes. Une fiche modifiée doit être préparée de nouveau. `published:true` n'est renvoyé qu'après confirmation de l'API. `sandbox:true` distingue eBay test d'une publication production.

Le journal identifie une annonce par marketplace, compte configuré, UUID de fiche et variante. Il enregistre chaque étape avant l'appel, puis les identifiants retournés. Les doubles clics sont exclus dans le processus ; un résultat déjà publié est réutilisé. Une tentative incertaine reste bloquée jusqu'à vérification manuelle. Le coffre et le journal doivent donc rester sur un disque persistant et une seule instance doit y écrire.

Erreurs : 400 format ; 401 authentification ; 403 origine/CSRF ; 409 connexion/confirmation/reprise ; 413 taille ; 422 données ou refus marketplace ; 429 débit ; 502 amont ; 503 navigateur absent ; 504 délai. Un échec de publication peut avoir créé un brouillon ou une offre inactive : consulter l'historique et la marketplace avant toute nouvelle fiche.


## Workflow extension et images (v1.1)

- POST /api/import-extension : Bearer DROP_STUDIO_IMPORT_TOKEN (>=32 caractères), Idempotency-Key de 16–100 caractères, JSON {product, productPrompt?, options?}. Réponse 202 {id,status,studioUrl}. Aucune authentification Basic/CSRF sur cette seule route ; le Bearer est obligatoire. L’extension appelle depuis son service worker avec permission d’origine, sans CORS de page web.
- GET /api/imports et GET /api/imports/:id : imports, étapes, erreur, galerie et fiche.
- POST /api/imports/:id/retry : {index?, productPrompt?, useCurrentTemplates?}. Sans index : étapes manquantes. index 0–2 : régénérer une seule image.
- POST /api/imports/:id/replace : {index, base64}. PNG/JPEG/WebP <=8 Mo.
- GET/POST /api/image-templates : {templates:{global,types:{packshot,lifestyle,detail}}}.
- POST /api/draft-plan/etsy ou /ebay : {listing}. Préparation et sauvegarde locales, aucune publication distante.
- GET /media/:uuid.png|jpg|webp|svg : fichier public permanent. SVG uniquement pour les illustrations démo générées par le serveur.

Toutes les routes ci-dessus sauf import-extension et lecture media conservent l’authentification du studio et CSRF pour les mutations. Les clés/modèles OPENAI_* ne peuvent plus être modifiés via /api/settings. Voir EXTENSION-WORKFLOW.md pour le contrat, les limites et la persistance.
