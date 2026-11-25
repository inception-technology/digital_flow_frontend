# Image du front Next.js pour un hébergement Docker (serveur auto-hébergé).
#
# BACKEND_ORIGIN est l'origine vers laquelle `next.config.ts` relaie `/api/*`
# (voir `rewrites`). Il doit être connu au build ET au démarrage : sans lui,
# un build de production vise l'API publique historique.
#
#   docker build --build-arg BACKEND_ORIGIN=http://api:8000 -t digital-flow-web .

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ARG BACKEND_ORIGIN
RUN test -n "$BACKEND_ORIGIN" || (echo "BACKEND_ORIGIN requis (--build-arg)" >&2; exit 1)
ENV BACKEND_ORIGIN=$BACKEND_ORIGIN
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

# node_modules complet : `next start` recharge next.config.ts, qui a besoin
# de la chaîne TypeScript.
COPY --from=build /app ./
ARG BACKEND_ORIGIN
ENV BACKEND_ORIGIN=$BACKEND_ORIGIN

USER node
EXPOSE 3000
CMD ["npx", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
