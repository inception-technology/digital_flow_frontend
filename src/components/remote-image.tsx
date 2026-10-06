import { useState, type CSSProperties, type ReactNode } from "react";

/**
 * Image distante signée (R2) avec repli : l'URL est signée par le backend sans
 * vérifier que l'objet existe encore, donc une image purgée échoue au
 * chargement. On affiche alors un cadre neutre plutôt qu'une image cassée.
 *
 * `fallbackClassName` / `fallbackStyle` donnent au cadre une taille quand
 * l'image n'en impose pas (ex. `w-auto` qui se dimensionne sur l'image).
 * `fallback` remplace entièrement le cadre par défaut.
 */
export function RemoteImage({
  src,
  alt,
  className,
  fallbackClassName,
  fallbackStyle,
  showLabel = false,
  fallback,
}: {
  src: string;
  alt: string;
  className?: string;
  fallbackClassName?: string;
  fallbackStyle?: CSSProperties;
  /** Ajoute « Image indisponible » sous l'icône (cadres assez grands). */
  showLabel?: boolean;
  fallback?: ReactNode;
}) {
  // Mémorise l'URL en échec plutôt qu'un booléen : une nouvelle URL retente
  // l'affichage sans effet de réinitialisation.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (src !== failedSrc) {
    return (
      // Image distante signée et de durée courte : le pipeline d'optimisation
      // de Next n'apporterait rien ici.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        onError={() => setFailedSrc(src)}
        // Une image rendue côté serveur peut échouer avant l'hydratation :
        // `onError` n'est alors jamais appelé. On rattrape ce cas au montage.
        ref={(img) => {
          if (img?.complete && img.naturalWidth === 0) setFailedSrc(src);
        }}
        className={className}
      />
    );
  }

  if (fallback !== undefined) return fallback;

  return (
    <div
      role="img"
      aria-label={alt ? `${alt} — image indisponible` : "Image indisponible"}
      style={fallbackStyle}
      className={`flex flex-col items-center justify-center gap-1 bg-current/10 text-current/40 ${
        fallbackClassName ?? className ?? ""
      }`}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="M21 15l-5-5L5 21" />
      </svg>
      {showLabel && <span className="text-xs font-medium">Image indisponible</span>}
    </div>
  );
}
