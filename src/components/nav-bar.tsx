"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Barre de navigation globale (dans le layout racine).
 *
 * La marque ramène toujours à l'accueil ; le bouton « Accueil » explicite
 * n'apparaît que sur les pages internes, pour ne pas doublonner sur l'accueil
 * lui-même.
 */
export function NavBar() {
  const pathname = usePathname();
  const onHome = pathname === "/";

  return (
    <header className="sticky top-0 z-10 border-b border-current/10 bg-background/80 backdrop-blur">
      <nav className="mx-auto flex w-full max-w-md items-center justify-between p-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span aria-hidden>🎵</span> Digital Flow Media
        </Link>
        <div className="flex items-center gap-2">
          {!onHome && (
            <Link
              href="/"
              className="rounded-lg border border-current/20 px-3 py-1.5 text-sm font-medium"
            >
              ← Accueil
            </Link>
          )}
          <Link
            href="/parametres"
            aria-label="Paramètres"
            title="Paramètres"
            className="rounded-lg border border-current/20 px-3 py-1.5 text-sm"
          >
            <span aria-hidden>⚙️</span>
          </Link>
        </div>
      </nav>
    </header>
  );
}
