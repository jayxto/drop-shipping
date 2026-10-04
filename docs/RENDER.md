# Mise en ligne dans votre nouveau compte Render

Le service existant `drop-shipping` de « My Workspace » suit `codex/drop-studio` et active l’auto-déploiement sur commit. Vérifiez les paramètres réels du compte avant tout changement d’offre.

## Paramètres prêts à utiliser

1. Dans le nouveau compte Render : **New → Web Service**, connecter GitHub et choisir `jayxto/drop-shipping`.
2. Branche : `codex/drop-studio` (ou `main` après fusion de la PR). Runtime : **Docker**, Dockerfile à la racine.
3. Choisir une région proche des utilisateurs, une seule instance et une offre compatible avec Chromium et un disque persistant. Vérifier le prix affiché avant de valider. Aucun achat n'est automatisé par ce dépôt.
4. Disque : monter sur `/data`, dimension initiale selon le besoin. Les données comprennent les fichiers JSON et les images générées/importées ; dimensionnez et sauvegardez le disque en conséquence.
5. Variables d'environnement :

| Clé | Valeur |
| --- | --- |
| `HOST` | `0.0.0.0` |
| `DATA_DIR` | `/data` |
| `APP_PASSWORD` | Mot de passe fort choisi dans Render, jamais dans Git |
| `BROWSER_CHANNEL` | `chromium` |
| `MARKETPLACE_MODE` | `demo` pour le premier démarrage |

6. Health check : `/healthz`. L'application utilise automatiquement `RENDER_EXTERNAL_URL` comme origine si `APP_URL` est absent. Ne pas recopier le `.env` local, qui utilise Edge/localhost.
7. Déployer. Ouvrir l'URL HTTPS `onrender.com`, entrer un nom d'utilisateur libre et le mot de passe `APP_PASSWORD`.
8. Configurez OPENAI_API_KEY, OPENAI_MODEL, OPENAI_IMAGE_MODEL et DROP_STUDIO_IMPORT_TOKEN dans les variables Render. Dans le site → Réglages : configurer les prompts et les comptes vendeurs. Ajouter les callbacks HTTPS aux portails développeurs. Tester eBay en Sandbox avant toute vente réelle.

## Contrôles après déploiement

- `/healthz` doit répondre 200, sans exposer de secrets.
- L'exemple doit se générer en démo et un brouillon doit survivre à un redémarrage.
- Le coffre, sa clé et le journal doivent être sous `/data`. Conserver leur sauvegarde ensemble.
- Tester l’envoi direct depuis l’extension AliExpress, puis la galerie et l’éditeur. L’extraction par URL dans le site est un recours manuel. Un CAPTCHA reste un blocage nécessitant le navigateur de l'utilisateur ; aucune garantie d'accès à toutes les annonces.
- La connexion puis le renouvellement OAuth et une publication de test doivent être validés avec vos propres comptes.

Un service Render sans disque persistant perd ses fichiers à chaque redémarrage/redéploiement : il ne convient pas à ce stockage de brouillons, clés et journal de publication. Les disques Render sont réservés aux services payants. Le prix exact doit être vérifié dans le nouveau compte avant création.

Références : [disques persistants Render](https://render.com/docs/disks), [tarifs Render](https://render.com/pricing). Docker n'était pas disponible dans l'environnement de développement local ; le build du conteneur devra être vérifié sur Render.
