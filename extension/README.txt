ALIEXPRESS → DROP STUDIO → ETSY / EBAY — V3 (manifest 0.3.0)

NOUVEAU PARCOURS RECOMMANDÉ
1. Décompresse le ZIP et charge ce dossier dans chrome://extensions ou edge://extensions (mode développeur).
2. Dans Connexion Drop Studio, entre l'adresse HTTPS du site et son jeton d'import, puis enregistre et autorise cette adresse.
3. Le serveur doit avoir DROP_STUDIO_IMPORT_TOKEN configuré (32 caractères minimum). Ne mets jamais une clé OpenAI dans l'extension.
4. Ouvre la fiche AliExpress. Tu peux scanner, corriger le prix/titre et choisir les images.
5. Clique Envoyer à Drop Studio. Le site s'ouvre et prépare la fiche et ses images. Le même produit inchangé ne crée pas de doublon lors d'une nouvelle tentative.
6. Dans le site, personnalise les prompts dans Réglages, régénère/remplace les images, ouvre et corrige la fiche, puis prépare les brouillons Etsy/eBay.
7. Les brouillons sont préparés localement ; aucune annonce n'est publiée automatiquement. Sans clé OpenAI serveur, le site utilise des illustrations démo, à remplacer avant une vente.

Le jeton est stocké localement dans le profil de l'extension, pas dans Chrome Sync ni les pages visitées. Change sa valeur côté serveur pour le révoquer. Le site doit disposer d'un disque persistant pour conserver les fiches et images après redéploiement.

ANCIEN PARCOURS MANUEL CONSERVÉ

INSTALLATION SUR MAC / CHROME
1. Double-clique le ZIP pour le décompresser.
2. Chrome : ouvre chrome://extensions
3. Active « Mode développeur ».
4. Clique « Charger l'extension non empaquetée ».
5. Sélectionne le dossier ali-ebay-bridge-v2.

WORKFLOW
A. ALIEXPRESS
1. Ouvre une fiche produit.
2. Extension > « Scraper le produit ».
3. Vérifie les infos et les miniatures.
4. Tu peux télécharger toutes les images sélectionnées directement, sans screenshots.
5. « Copier pour ChatGPT ».

B. CHATGPT
1. Colle le texte copié dans ChatGPT.
2. ChatGPT prépare la fiche et termine par le bloc JSON attendu.
3. Copie toute sa réponse.
4. Extension > onglet ChatGPT > colle > « Importer la fiche ChatGPT ».
5. Vérifie / modifie puis enregistre.

C. EBAY
1. Ouvre « Créer une annonce » sur eBay.
2. Extension > eBay > « Remplir la fiche eBay ».
3. L'extension tente de remplir titre, prix, description et état.
4. Vérifie TOUJOURS l'annonce avant de publier.

LIMITES V2
- AliExpress et eBay modifient leur HTML régulièrement. Un premier test réel est nécessaire pour adapter les sélecteurs à ce que ton compte affiche.
- Les variantes complexes et caractéristiques eBay ne sont pas encore injectées automatiquement.
- Les images sont récupérées/téléchargeables depuis AliExpress mais ne sont pas encore uploadées automatiquement dans eBay.
- Aucune publication automatique : la validation finale reste manuelle.
- N'utilise que des images et contenus que tu as le droit de réutiliser.


V2.1
- Filtre beaucoup plus strict des images AliExpress (suppression des petites icônes/UI/tracking).
- Prix eBay normalisé en décimal avant injection (ex. 12.90 reste 12.90).
- Détection renforcée de l'éditeur de description eBay, y compris contenteditable / éditeurs riches.
- Diagnostic visible si titre, prix ou description n'est pas trouvé.
