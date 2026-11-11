# SpotiStats

Tableau de bord local de statistiques Spotify (HTML/CSS/JS, sans framework ni backend).

## Utilisation
1. Sur https://developer.spotify.com/dashboard, créer une appli et y ajouter l'URI de redirection exacte `http://127.0.0.1:8888/callback`.
2. Depuis ce dossier : `python -m http.server 8888 --bind 127.0.0.1`
3. Ouvrir http://127.0.0.1:8888/ , coller le Client ID, se connecter.

Le Client ID et les jetons sont stockés dans le localStorage du navigateur. Aucun secret n'est utilisé (OAuth PKCE).

## Fichiers
- `app.js` : authentification, appels API, affichage
- `stats.js` : agrégations pures (navigateur et node)
- `test_stats.js` : `node test_stats.js`
- `callback/index.html` : renvoie vers `/` en gardant `?code=...`

## Limites
- Bibliothèque plafonnée à 2000 éléments par liste.
- Genres, popularité, abonnés peuvent être vides pour les applis récentes : la stat est alors masquée.
- Les écoutes récentes se limitent aux 50 dernières.
