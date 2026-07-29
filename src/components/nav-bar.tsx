"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Icône de navigation. Le SVG (servi depuis `public/`) sert de **masque** et la
 * couleur vient du texte courant (`bg-current`) : l'icône suit donc le thème
 * clair/sombre, ce qu'un `<img>` d'un SVG à fill noir ne ferait pas.
 */
function NavIcon({ src }: { src: string }) {
  return (
    <span
      aria-hidden
      className="block h-5 w-5 bg-current"
      style={{
        maskImage: `url(${src})`,
        WebkitMaskImage: `url(${src})`,
        maskSize: "contain",
        WebkitMaskSize: "contain",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
      }}
    />
  );
}

/**
 * Barre de navigation globale (dans le layout racine).
 *
 * La marque ramène toujours à l'accueil ; l'icône « Accueil » n'apparaît que sur
 * les pages internes, pour ne pas doublonner sur l'accueil lui-même.
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
              aria-label="Accueil"
              title="Accueil"
              className="btn btn-secondary btn-icon"
            >
              <NavIcon src="/home.svg" />
            </Link>
          )}
          <Link
            href="/parametres"
            aria-label="Paramètres"
            title="Paramètres"
            className="btn btn-secondary btn-icon"
          >
            <NavIcon src="/param.svg" />
          </Link>
        </div>
      </nav>
    </header>
  );
}
