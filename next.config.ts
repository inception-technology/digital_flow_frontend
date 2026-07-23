import type { NextConfig } from "next";

// Origine du backend, proxifiée derrière ce même domaine (voir `rewrites`).
// En production, l'URL publique Railway (pas un secret : c'est l'endpoint
// de l'API, déjà visible dans les requêtes réseau) ; en local, le backend
// sur :8000. `BACKEND_ORIGIN` reste une échappatoire (`||` pour ignorer une
// valeur vide).
const BACKEND_ORIGIN =
  process.env.BACKEND_ORIGIN ||
  (process.env.NODE_ENV === "production"
    ? "https://digital-flow-media.up.railway.app"
    : "http://localhost:8000");

const nextConfig: NextConfig = {
  reactCompiler: true,

  // Tout `/api/*` est servi par le backend, mais **via ce domaine** : le
  // navigateur ne voit qu'une seule origine, donc le cookie de session est
  // first-party. Sans ça, front (Vercel) et API (Railway) sont sur deux
  // domaines racines distincts et le cookie tiers est bloqué sur mobile
  // (Safari ITP, Chrome mobile).
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_ORIGIN}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
