# AliExpress → Drop Studio

## Installation et première utilisation

1. Décompressez `ali-ebay-bridge-v3.0-drop-studio.zip`. Dans `chrome://extensions` ou `edge://extensions`, activez le mode développeur et chargez le dossier décompressé. Désactivez l'ancienne extension pour éviter les doublons.
2. Côté serveur, définissez `APP_URL` (origine publique HTTPS), `APP_PASSWORD` et un `DROP_STUDIO_IMPORT_TOKEN` aléatoire d'au moins 32 caractères. Exemple de génération locale : `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`. Ne commitez jamais sa sortie.
3. Dans « Connexion Drop Studio » de l'extension, saisissez l'origine HTTPS et **le jeton d'import**, puis autorisez uniquement cette origine. Ce n'est ni le mot de passe du site ni la clé OpenAI. Le token reste dans le stockage local des contextes de confiance de l'extension, jamais dans un script de page ou dans Chrome Sync. Toute personne ayant accès à ce profil navigateur peut néanmoins accéder à ce stockage : traitez ce jeton comme un secret et changez-le côté serveur pour le révoquer.
4. Ouvrez un produit AliExpress. Vous pouvez scanner, corriger titre/prix et sélectionner les photos. Cliquez sur **Envoyer à Drop Studio**. Le bouton relit toujours la page active et n'utilise les corrections que pour le même produit.
5. Le studio s'ouvre sur l'import accepté. Connectez-vous avec le mot de passe du site. La génération continue même si la fenêtre de l'extension est fermée. Le produit brut, les étapes et les images sont enregistrés.
6. Ouvrez la fiche modifiable, corrigez-la et enregistrez le brouillon. Les boutons « Préparer le brouillon Etsy/eBay » produisent et sauvegardent un plan local exportable, sans connexion vendeur nécessaire et **sans créer ni publier une annonce distante**. Les boutons de publication existants conservent leur confirmation explicite.

## Prompts et génération OpenAI

Dans **Réglages → Votre style d'image**, collez le prompt exact issu de ChatGPT dans le style global. Personnalisez packshot, mise en situation et gros plan. Chaque import prend un instantané de ces textes, sans les reformuler ; les nouvelles valeurs globales ne modifient pas les anciennes fiches. Ajoutez une consigne par produit puis régénérez l'image souhaitée. Cochez « derniers modèles » pour appliquer volontairement un nouveau style à cette génération.

Le prompt final assemble style global + type d'image + consigne produit + contraintes de fidélité + faits du produit. Son texte est visible dans la galerie. Le respect précis du produit doit être vérifié avant publication.

- `OPENAI_API_KEY` : secret **uniquement dans l'environnement serveur**. Les anciennes valeurs éventuellement présentes dans le coffre de réglages ne sont plus utilisées.
- `OPENAI_MODEL` : modèle texte accessible au projet API. Sans ce réglage ou sans clé, la fiche utilise une génération déterministe étiquetée démo.
- `OPENAI_IMAGE_MODEL` : modèle de l'API Images, par défaut `gpt-image-2.5-sunburst`, modifiable dans l'environnement.
- `IMAGE_MODE=demo` : force les images fictives sans appel payant. Sans clé, ce mode est automatique. Aucun appel OpenAI réel n'est exécuté par les tests.

En mode réel, une image produit de référence est obligatoire. Elle doit provenir des CDN `aliexpress-media.com` ou `alicdn.com`, en HTTPS sans identifiants ni port. Les redirections sont refusées, la taille est bornée à 8 Mo et seuls PNG, JPEG et WebP sont acceptés. L'API `/v1/images/edits` reçoit cette image et le prompt. Aucun secret n'est envoyé au CDN. Les réponses base64 deviennent des fichiers locaux permanents, pas des liens OpenAI temporaires.

Documentation officielle utilisée : https://developers.openai.com/api/docs/guides/image-generation

## Reprises, fichiers et sécurité

- Import : `POST /api/import-extension`, JSON direct, `Authorization: Bearer <token>` et `Idempotency-Key` obligatoire. Aucun accès aux comptes vendeurs n'est accordé à ce jeton. L'extension n'a jamais de clé OpenAI.
- La clé d'idempotence est conservée par l'extension pour le dernier produit inchangé. Une nouvelle tentative retrouve le même import et ne relance pas de génération. Une même clé avec un corps différent retourne 409. Les produits modifiés créent un nouvel import.
- Limites : 300 Ko par requête d'import, 200 Ko de données produit normalisables, 10 imports/minute, 20 travaux en attente, 500 imports stockés. Une seule génération s'exécute à la fois par processus.
- États : `queued`, `generating_listing`, `generating_images`, `ready`, `failed`, `interrupted`. Un échec conserve les images réussies. « Reprendre » ne génère que les étapes manquantes. « Régénérer » remplace seulement le visuel choisi ; l'ancien reste visible en cas d'échec.
- Après redémarrage, les travaux interrompus demandent une reprise explicite : un appel OpenAI dont la réponse a été perdue peut déjà avoir été facturé. Aucun retry automatique de ces appels payants.
- Les modifications de fiche déjà enregistrées sont conservées lors des régénérations. Enregistrez avant de relancer ; les changements uniquement présents dans l'éditeur ne sont pas sauvegardés automatiquement.
- Le remplacement utilise un fichier PNG/JPEG/WebP (8 Mo max), jamais du SVG utilisateur. Les médias sont servis sous `/media/<uuid>.<extension>` ; ces URL imprévisibles sont **publiques** afin que les marketplaces puissent les lire. N'y mettez pas de document confidentiel. Etsy exige PNG/JPEG, pas WebP.
- HTTP n'est autorisé que sur `localhost` ou `127.0.0.1` pour le développement. En production, APP_URL doit être l'URL publique HTTPS. Le mot de passe du studio et CSRF continuent de protéger toutes les autres mutations.
- Le scraping serveur est conservé uniquement comme recours manuel sous « extraction serveur en secours » ; un import reçu par l'extension ne lance jamais Chromium côté serveur.

## Persistance et Render

**Un disque persistant est indispensable en production.** Montez-le sur `/data` et définissez `DATA_DIR=/data`. Les fichiers `imports.json`, `drafts.json`, `image-templates.json`, `publications.json`, `vault.enc`, `vault.key` et `media/` doivent survivre ensemble aux redéploiements. Sauvegardez ce répertoire et/ou fournissez `VAULT_KEY` via les variables d'environnement.

Une seule instance/processus peut écrire dans ce répertoire. Pour plusieurs instances, remplacer ces magasins de fichiers et la file par une base et un système de jobs partagé. Les anciens médias restent conservés pour ne pas casser les URLs exportées ; prévoir archivage et surveillance du disque. Les brouillons sont limités aux 200 plus récents ; les imports restent récupérables jusqu'à 500.

L'offre gratuite Render avec disque éphémère **ne garantit pas cette persistance**. Passer sur une offre compatible et attacher un disque se fait dans Render ; le code n'effectue aucun achat ni création de ressource. Vérifiez avant activation réelle que les médias sont encore présents après un redéploiement.

## Validation locale

Node 24 recommandé. `pnpm install --frozen-lockfile` (ou `npm install`), puis `npm test`, `npm run check`, `npm run build`. La construction valide tous les scripts et produit un dossier horodaté dans `dist/`, sans secrets ni données utilisateur. Le serveur n'a pas de bundler frontend.

Les tests couvrent authentification, CSRF existant, import structuré, idempotence, persistance, rendu démo, conservation des prompts, requêtes Images avec référence et clé serveur, refus OpenAI, reprise partielle, redémarrage, remplacement et plans locaux. Un test navigateur manuel reste nécessaire sur une vraie page AliExpress connectée (DOM variable, captcha et accès fournisseur non contournés).
