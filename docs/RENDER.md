# Mise en ligne dans votre nouveau compte Render

Le plugin doit être connecté au bon compte avant toute action. Aucun service n'a été créé dans « Jordan's workspace » : cet espace a été exclu par l'utilisateur.

## Paramètres prêts à utiliser

1. Dans le nouveau compte Render : **New → Web Service**, connecter GitHub et choisir `jayxto/drop-shipping`.
2. Branche : `codex/drop-studio` (ou `main` après fusion de la PR). Runtime : **Docker**, Dockerfile à la racine.
3. Choisir une région proche des utilisateurs, une seule instance et une offre compatible avec Chromium et un disque persistant. Vérifier le prix affiché avant de valider. Aucun achat n'est automatisé par ce dépôt.
4. Disque : monter sur `/data`, dimension initiale selon le besoin. Les données sont de petits fichiers JSON ; les images ne sont pas conservées sur disque.
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
8. Dans le site → Réglages : configurer OpenAI et les comptes vendeurs. Ajouter les callbacks HTTPS aux portails développeurs. Tester eBay en Sandbox avant toute vente réelle.

## Contrôles après déploiement

- `/healthz` doit répondre 200, sans exposer de secrets.
- L'exemple doit se générer en démo et un brouillon doit survivre à un redémarrage.
- Le coffre, sa clé et le journal doivent être sous `/data`. Conserver leur sauvegarde ensemble.
- Tester une annonce AliExpress depuis le site. Un CAPTCHA reste un blocage nécessitant le navigateur de l'utilisateur ; aucune garantie d'accès à toutes les annonces.
- La connexion puis le renouvellement OAuth et une publication de test doivent être validés avec vos propres comptes.

Un service Render sans disque persistant perd ses fichiers à chaque redémarrage/redéploiement : il ne convient pas à ce stockage de brouillons, clés et journal de publication. Les disques Render sont réservés aux services payants. Le prix exact doit être vérifié dans le nouveau compte avant création.

Références : [disques persistants Render](https://render.com/docs/disks), [tarifs Render](https://render.com/pricing). Docker n'était pas disponible dans l'environnement de développement local ; le build du conteneur devra être vérifié sur Render.
