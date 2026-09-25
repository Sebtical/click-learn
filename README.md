# Click&Learn

Appli web de révision pour collégien(ne) (6ème → 3ème) : quiz Maths/Français générés localement, et quiz personnalisés à partir d'une photo de cours ou d'exercice via l'API Anthropic (Claude).

## Fonctionnement

- **Un seul Cloudflare Worker** : `worker.js` sert les fichiers statiques (`public/`) et fait aussi office de proxy vers l'API Anthropic pour la route `/api/claude` — le navigateur n'a jamais la vraie clé API.
- **Code d'accès** : demandé à la configuration initiale, stocké dans `localStorage` (`state.accessCode`), envoyé à chaque appel IA dans le header `x-access-code`. Le Worker le compare au secret `ACCESS_CODE` (défini côté Cloudflare) avant de relayer quoi que ce soit vers Anthropic — ça protège l'API elle-même, pas juste l'écran de connexion.
- **Stockage** : tout le reste de l'état (profil, quiz, historique de réponses, code parent) est gardé dans le `localStorage` du navigateur, rien n'est envoyé ailleurs sauf vers `/api/claude`.
- **Deux usages du proxy IA** :
  - générer un quiz à partir d'une photo de cours prise en note (« 📷 Ajouter un cours »)
  - corriger une photo d'exercice fait par l'enfant (« 📸 Corriger un exercice »)
- **Quiz Maths/Français** : générés entièrement en local (`public/js/generators-maths.js`, `public/js/generators-francais.js`, `public/js/figures-maths.js`), sans appel API.
- **Espace parent** : protégé par un code à 4 chiffres (`public/js/parent.js`), pour consulter la progression par matière/chapitre — distinct du code d'accès à l'app.

## Lancer le projet en local

Les fonctionnalités IA passent par le Worker et ont besoin de `wrangler` (CLI Cloudflare) pour tourner en local :

1. Créer un fichier `.dev.vars` à la racine (gitignored, ne jamais le commiter) :
   ```
   ANTHROPIC_API_KEY=sk-ant-votre-vraie-cle
   ACCESS_CODE=le-code-que-tu-veux-tester
   ```
2. Lancer :
   ```
   npx wrangler dev
   ```
3. Ouvrir l'URL affichée (en général `http://localhost:8787`).

Pour juste regarder l'UI sans les fonctionnalités IA : ouvrir `public/index.html` directement dans un navigateur.

## Déploiement (Cloudflare Workers)

L'app est prévue pour être hébergée gratuitement sur Cloudflare, avec le repo GitHub connecté pour un déploiement automatique à chaque push sur `main`. L'interface Cloudflare a été unifiée (Pages et Workers ne font plus qu'un) — le flux ci-dessous correspond à cette version actuelle du dashboard, mais les intitulés peuvent encore bouger.

1. **Créer un compte Cloudflare** (gratuit) sur [dash.cloudflare.com](https://dash.cloudflare.com) si ce n'est pas déjà fait.
2. Dans le tableau de bord Cloudflare : **Create an app** (ou équivalent) → connecter le repo GitHub `Sebtical/click-learn`.
3. Sur l'écran de configuration du déploiement :
   - **Build command** : laisser vide (pas de build)
   - **Deploy command** : `npx wrangler deploy` (normalement pré-rempli, c'est le bon)
   - **Path** : `/` (racine du repo)
4. Avant le premier déploiement (ou juste après, dans **Settings → Variables and Secrets** du Worker créé), ajouter deux **secrets** (pas des variables en clair) :
   - `ANTHROPIC_API_KEY` : la vraie clé API Anthropic
   - `ACCESS_CODE` : le code d'accès que ta fille utilisera pour se connecter à l'app
5. Déclencher le déploiement (ou le laisser se faire automatiquement). Cloudflare donne une URL du type `click-learn.<compte>.workers.dev`.
6. **Recommandé** : dans la [console Anthropic](https://console.anthropic.com), fixer un plafond de dépense mensuel sur la clé API utilisée, en filet de sécurité supplémentaire au-delà du code d'accès.
7. Sur l'iPhone/iPad, ouvrir l'URL dans Safari, faire "Partager" → "Sur l'écran d'accueil" pour un accès en un tap (les meta tags `apple-mobile-web-app-*` sont déjà en place dans `public/index.html`).

Pour changer le code d'accès ou la clé plus tard : le Worker → **Settings → Variables and Secrets**, modifier les secrets, puis redéployer (ou attendre le prochain push).

## Structure

```
wrangler.toml            config Cloudflare : point d'entrée du Worker + dossier des fichiers statiques
worker.js                 Worker : sert public/ et proxy vers l'API Anthropic sur /api/claude
public/
  index.html              point d'entrée de l'app, charge les scripts dans l'ordre
  css/style.css            tous les styles
  js/
    storage.js             lecture/écriture de l'état dans localStorage
    api.js                  appel au proxy /api/claude (texte + image), redimensionnement des photos
    prompts.js              prompts envoyés à Claude (génération de quiz, correction d'exercice)
    quizkit.js / quiz.js    moteur de quiz générique (affichage, scoring)
    localquiz.js             orchestration des quiz générés localement
    generators-maths.js / generators-francais.js / figures-maths.js
                             génération procédurale des questions Maths/Français
    mascot.js                mascotte SVG affichée dans l'UI
    parent.js                espace parent (code PIN + suivi de progression)
    app.js                    état global, routing des écrans, écran d'accueil
```

## Statut

Première version fonctionnelle (commit `d61eca7`), hébergée sur Cloudflare Workers derrière un proxy protégé par code d'accès. Pas encore de tests automatisés ni de pipeline CI.
