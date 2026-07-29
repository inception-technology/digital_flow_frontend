import { soundcloudLoginUrl } from "@/lib/api";
import { PLATFORMS } from "@/lib/constants";

/**
 * Liste des plateformes, partagée entre l'accueil et les Paramètres (audit
 * reco #8). Chaque ligne est un bouton pleine largeur d'au moins 48 px, libellé
 * à gauche et action à droite — plus de faux champ de formulaire, plus de cible
 * de 20 px. TikTok porte « Bientôt » et n'est pas tapable.
 */
export function PlatformList({ connected }: { connected: string[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {PLATFORMS.map((platform) => {
        const isConnected = connected.includes(platform.key);

        if (isConnected) {
          return (
            <li
              key={platform.key}
              className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-current/15 px-4 py-2"
            >
              <span className="font-medium">{platform.label}</span>
              <span className="flex items-center gap-1.5 text-sm font-medium text-[color:var(--accent-ink)]">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M4 12.5l5.5 5.5L20 6.5" />
                </svg>
                Connecté
              </span>
            </li>
          );
        }

        if (platform.comingSoon) {
          return (
            <li
              key={platform.key}
              className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-current/10 px-4 py-2 opacity-55"
            >
              <span className="font-medium">{platform.label}</span>
              <span className="rounded-full border border-current/25 px-2 py-0.5 text-xs font-medium uppercase tracking-wide">
                Bientôt
              </span>
            </li>
          );
        }

        // Connectable (SoundCloud) : bouton pleine largeur qui démarre l'OAuth.
        return (
          <li key={platform.key}>
            <a
              href={platform.key === "soundcloud" ? soundcloudLoginUrl : "#"}
              className="btn btn-secondary btn-block justify-between"
            >
              <span className="font-medium">{platform.label}</span>
              <span className="flex items-center gap-1 text-sm text-[color:var(--accent-ink)]">
                Connecter
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M4 12h15" />
                  <path d="M13 6l6 6-6 6" />
                </svg>
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
