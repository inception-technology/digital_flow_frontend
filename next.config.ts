import type { NextConfig } from "next";

// Origine du backend, proxifiée derrière ce même domaine (voir `rewrites`).
// En local, le backend tourne sur :8000 ; en production, Vercel fournit
// `BACKEND_ORIGIN` (l'URL publique Railway).
const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN ?? "http://localhost:8000";

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
