# Digital Flow — Frontend

Interface mobile-first du workflow de publication musicale. Next.js 16
(App Router), React 19, Tailwind v4.

## Les trois dépôts

| Dépôt | Rôle |
|---|---|
| **digital_flow_frontend** (ici) | Interface — upload, visuels, validation |
| [digital_flow_backend](https://github.com/inception-technology/digital_flow_backend) | API, OAuth, stockage, orchestration |
| [music_visualizer](https://github.com/inception-technology/music_visualizer) | Moteur de rendu vidéo (FFmpeg) |

## Démarrage local

```bash
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
```

```bash
npm install && npm run dev
```

Le backend doit tourner en parallèle — voir son README.

## Tests

```bash
npm test
```

Ils couvrent la validation audio côté navigateur (format, taille, durée), qui
évite d'envoyer 50 Mo sur un réseau mobile pour recevoir un refus. Le backend
reste l'autorité.

## Structure

```
src/app/            Pages — upload (JALON 1), publications/[id] (JALON 2)
src/components/     Composants clients
src/lib/            Client API, validation audio, constantes du domaine
```

## Authentification

Le front ne détient **aucun** jeton. Le backend pilote le flow OAuth Google et
dépose un cookie HttpOnly ; toutes les requêtes partent avec
`credentials: "include"`.

Conséquence en production : front et API étant sur des domaines distincts, le
backend doit tourner avec `SESSION_COOKIE_SAMESITE=none` et
`SESSION_COOKIE_SECURE=true`, sinon la connexion échoue silencieusement.

## Variables d'environnement

| Variable | Rôle |
|---|---|
| `NEXT_PUBLIC_API_URL` | Adresse du backend. **Lue au build** — la modifier impose un redéploiement. |
