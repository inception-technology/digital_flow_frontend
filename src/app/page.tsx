"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  fetchProfile,
  fetchPublications,
  loginUrl,
  type Profile,
  type PublicationSummary,
} from "@/lib/api";
import { PlatformList } from "@/components/platform-list";
import { PLATFORMS } from "@/lib/constants";

// Statut d'une publication : un libellé explicite porte l'information, la
// couleur ne fait que la redoubler (audit reco #7 — plus de statut porté par la
// seule pastille). `tone` ne pilote que la teinte du point, jamais le sens.
const STATUS: Record<string, { tone: "done" | "danger" | "progress"; label: string }> = {
  draft: { tone: "progress", label: "À compléter" },
  rendering: { tone: "progress", label: "Rendu en cours" },
  ready: { tone: "progress", label: "À valider" },
  scheduled: { tone: "progress", label: "Programmé" },
  published: { tone: "done", label: "Publié" },
  error: { tone: "danger", label: "Échec" },
  cancelled: { tone: "danger", label: "Annulé" },
};

function StatusChip({ status }: { status: string }) {
  const badge = STATUS[status] ?? { tone: "progress" as const, label: status };
  const dot =
    badge.tone === "done"
      ? "var(--accent)"
      : badge.tone === "danger"
        ? "var(--danger)"
        : "currentColor";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-current/15 px-2 py-0.5 text-xs font-medium">
      <span
        aria-hidden
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: dot }}
      />
      {badge.label}
    </span>
  );
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

/** Vignette carrée de pochette, ou un repère neutre tant qu'aucune n'existe. */
function Thumbnail({ url }: { url: string | null }) {
  if (url) {
    return (
      // Vignette distante signée (courte durée) : le pipeline d'optimisation de
      // Next n'apporterait rien pour une image déjà dimensionnée.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className="h-12 w-12 shrink-0 rounded object-cover"
      />
    );
  }
  return (
    <div
      aria-hidden
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-current/10 text-current/40"
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
      >
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    </div>
  );
}

/** Une ligne cliquable ≥ 44 px : vignette, titre, statut écrit, date. */
function PublicationRow({ publication }: { publication: PublicationSummary }) {
  return (
    <li className="border-b border-current/10">
      <Link
        href={`/publications/${publication.id}`}
        className="flex min-h-[64px] items-center gap-3 py-2"
      >
        <Thumbnail url={publication.thumbnail_url} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate font-medium">{publication.title}</span>
          <span className="flex items-center gap-2">
            <StatusChip status={publication.status} />
            <span className="text-xs tabular-nums opacity-60">
              {formatDateTime(publication.created_at)}
            </span>
          </span>
        </span>
      </Link>
    </li>
  );
}

// Étape atteinte et intitulé pour une publication non terminée (audit reco #13).
// Le statut suffit à situer l'étape ; la liste des résumés n'a pas le détail.
const RESUME_STEP: Record<string, { step: number; label: string }> = {
  draft: { step: 2, label: "Visuels à finaliser" },
  rendering: { step: 3, label: "Rendu vidéo en cours" },
  ready: { step: 4, label: "Prêt à publier" },
};
const RESUMABLE = new Set(Object.keys(RESUME_STEP));

/** Carte « Reprendre » en tête d'accueil : reprendre une publication en cours
 * en un tap, au bon endroit (audit reco #13 — le correctif n°1 contre l'abandon). */
function ResumeCard({ publication }: { publication: PublicationSummary }) {
  const info = RESUME_STEP[publication.status] ?? { step: 2, label: "En cours" };
  return (
    <div className="rounded-lg border border-[color:var(--accent)]/30 bg-[color:var(--accent-soft)] p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--accent-ink)]">
          À reprendre · étape {info.step} sur 4
        </span>
        <span className="text-xs opacity-60">
          {formatDateTime(publication.created_at)}
        </span>
      </div>
      <p className="mt-1 text-lg font-semibold">{publication.title}</p>
      <p className="text-xs opacity-70">{info.label}</p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-current/10">
        <div
          className="h-full rounded-full bg-[color:var(--accent)]"
          style={{ width: `${(info.step / 4) * 100}%` }}
        />
      </div>
      <Link
        href={`/publications/${publication.id}`}
        className="btn btn-primary btn-block mt-3"
      >
        Reprendre
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    </div>
  );
}

/** Logo Google officiel (4 couleurs), pour un bouton Sign-In conforme. */
function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export default function HomePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [publications, setPublications] = useState<PublicationSummary[]>([]);
  const [archived, setArchived] = useState<PublicationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    fetchProfile()
      .then((loaded) => {
        setProfile(loaded);
        // Les listes n'ont de sens qu'une fois connecté — et l'appel échouerait.
        if (loaded) {
          return Promise.all([
            fetchPublications().then(setPublications),
            fetchPublications(true).then(setArchived),
          ]).catch(() => {
            setPublications([]);
            setArchived([]);
          });
        }
      })
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 items-center justify-center p-6">
        <p className="text-sm opacity-60">Chargement…</p>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 p-6 pb-24">
        <div>
          <h1 className="text-3xl font-semibold">Publiez votre musique</h1>
          <p className="mt-3 text-base leading-relaxed opacity-70">
            Envoyez un morceau : l’image, les vidéos et les textes sont préparés
            pour vous, puis publiés sur YouTube et SoundCloud (TikTok bientôt).
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {/* Bouton Google Sign-In conforme (logo + libellé), avec état de
              chargement au tap (audit reco #9). */}
          <a
            href={loginUrl}
            onClick={() => setSigningIn(true)}
            aria-busy={signingIn}
            className="flex min-h-12 w-full items-center justify-center gap-3 rounded-lg border border-[#747775] bg-white px-4 py-3 font-medium text-[#1f1f1f] transition-colors hover:bg-[#f7f8f8]"
          >
            {signingIn ? (
              <>
                <span
                  aria-hidden
                  className="h-4 w-4 animate-spin rounded-full border-2 border-[#747775] border-t-transparent"
                />
                Ouverture de Google…
              </>
            ) : (
              <>
                <GoogleLogo />
                Se connecter avec Google
              </>
            )}
          </a>
          <p className="text-center text-sm opacity-70">
            Rien n’est publié sans votre validation.
          </p>
        </div>

        <p className="text-xs leading-relaxed opacity-55">
          Une seule autorisation couvre la connexion et la publication. En
          continuant, vous acceptez les conditions d’utilisation et la politique
          de confidentialité.
        </p>
      </main>
    );
  }

  // Publications en cours (reprenables) vs terminées (audit reco #13).
  const resumable = publications.filter((p) => RESUMABLE.has(p.status));
  const done = publications.filter((p) => !RESUMABLE.has(p.status));

  // Vue d'ensemble : compteurs par état, sur l'ensemble (actifs + archivés).
  const all = [...publications, ...archived];
  const overview = [
    { n: all.filter((p) => RESUMABLE.has(p.status)).length, label: "En cours" },
    { n: all.filter((p) => p.status === "published").length, label: "Publiées" },
    { n: all.filter((p) => p.status === "scheduled").length, label: "Programmées" },
    {
      n: all.filter((p) => p.status === "cancelled" || p.status === "error").length,
      label: "Annulées",
    },
  ];

  // Sous-titre : nom d'artiste + résumé des plateformes. Le profil descend en
  // sous-titre ; l'action et la liste prennent le haut de l'écran (R1).
  const platformSummary = PLATFORMS.filter((p) => !p.comingSoon)
    .map((p) =>
      profile.connected_platforms.includes(p.key)
        ? `${p.label} connecté`
        : `${p.label} à connecter`,
    )
    .join(" · ");

  return (
    <main className="mx-auto w-full max-w-md flex-1 p-6">
      <header className="mb-5">
        <h1 className="text-3xl font-semibold">Vos publications</h1>
        <p className="mt-1 text-sm opacity-70">
          {(profile.artist_name ?? profile.display_name) + " · " + platformSummary}
        </p>
      </header>

      {/* Vue d'ensemble : compteurs par état. */}
      <div className="mb-6 grid grid-cols-4 gap-2">
        {overview.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-current/10 px-1 py-2 text-center"
          >
            <div className="text-xl font-semibold tabular-nums">{stat.n}</div>
            <div className="mt-0.5 text-[10px] uppercase leading-tight tracking-wide opacity-60">
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Action principale en tête (R1). */}
      <Link
        href="/publications/new"
        className="btn btn-primary btn-block min-h-[52px] text-base"
      >
        Nouvelle publication
        <svg
          width="18"
          height="18"
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
      </Link>

      {resumable.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-medium">À reprendre</h2>
          <div className="flex flex-col gap-3">
            {resumable.map((publication) => (
              <ResumeCard key={publication.id} publication={publication} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-medium">
          {resumable.length > 0 ? "Terminées" : "Vos publications"}
        </h2>
        {publications.length === 0 ? (
          <p className="text-sm opacity-60">
            Aucune publication pour l’instant. Envoyez un morceau : l’image, les
            vidéos et les textes sont préparés pour vous.
          </p>
        ) : done.length === 0 ? (
          <p className="text-sm opacity-60">
            Rien de terminé pour l’instant — vos publications en cours sont
            au-dessus.
          </p>
        ) : (
          <ul className="flex flex-col border-t border-current/10">
            {done.map((publication) => (
              <PublicationRow key={publication.id} publication={publication} />
            ))}
          </ul>
        )}
      </section>

      {archived.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-medium opacity-70">Archivés</h2>
          <ul className="flex flex-col border-t border-current/10 opacity-70">
            {archived.map((publication) => (
              <PublicationRow key={publication.id} publication={publication} />
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-medium">Plateformes</h2>
        <PlatformList connected={profile.connected_platforms} />
      </section>
    </main>
  );
}
