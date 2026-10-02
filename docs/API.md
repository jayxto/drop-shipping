# API et adaptateurs

API JSON même origine. `GET /api/config` fournit le cookie de session et le jeton CSRF. Les POST exigent `Content-Type: application/json`, `Origin: <APP_URL>` et `X-CSRF-Token`.

| Route | Entrée | Résultat |
| --- | --- | --- |
| `GET /api/config` | — | `csrf`, `generation`, `marketplaceMode`, états de connexion |
| `POST /api/import` | `{raw: string}` | `{source}` |
| `POST /api/import-url` | `{url: string}` | `{source, method, warnings}` |
| `POST /api/generate` | `{raw, options: {multiplier, shipping, fees}}` | `{listing}` |
| `GET /api/drafts` | — | `{drafts}` |
| `POST /api/drafts` | `{listing}` | fiche validée/enregistrée par UUID |
| `POST /api/publish/:market` | `{listing}` | simulation ou 501 avec plan |
| `POST /api/oauth/:market/start` | `{}` | `{url}` de consentement |
| `GET /api/oauth/:market/callback` | `code`, `state` | échange serveur, redirection |
| `POST /api/oauth/:market/disconnect` | `{}` | suppression des jetons de session |

`:market` accepte `etsy` ou `ebay`. Une fiche comprend `id`, `title`, `description`, `price`, `currency`, `tags`, `materials`, `variants`, `images`, `category`, `condition`, `specifics`, `source`, `pricing`, `generation`, `updatedAt`. Les variantes sont conservées en libellés (objets importés sérialisés en JSON), pas encore mappées vers un inventaire vendeur.

Erreurs : 400 validation ; 401 authentification ; 403 hôte/origine/CSRF/state ; 409 OAuth non configuré ; 413 taille ; 429 débit ; 501 publication réelle non implémentée ; 502 amont indisponible. Les réponses contiennent `error`, sans détail secret amont.

## Compléter la publication

Le point d'extension est `/api/publish/:market` dans `server/index.js`, avec les transformateurs de `server/listing.js`.

1. Valider les données et profils vendeur côté serveur. Vérifier expiration/scopes et renouveler les jetons.
2. Construire un inventaire par variante : SKU, options, quantité, prix, images. Ne pas inventer stocks, délais ou auteur.
3. Créer une fiche brouillon/offre inactive. Ne pas tronquer silencieusement un titre eBay trop long.
4. Envoyer les images via l'API adaptée. Un tableau d'URL Etsy ne téléverse rien. Si des téléchargements serveur sont ajoutés, protéger contre SSRF : DNS/IP privées, redirections, taille, type et délai.
5. Enregistrer durablement les identifiants marketplace et étapes avant activation. Réconcilier les réponses ambiguës et empêcher les doublons lors des retries.
6. Afficher les frais éventuels et prévoir la validation finale dans le produit avant activation.
7. Tester chaque catégorie/variante prise en charge avec un compte de test. Renvoyer `published:true` seulement après confirmation positive de la marketplace.

`simulated:true` est réservé à la démo. Aucun chemin caché n'active une publication réelle.
