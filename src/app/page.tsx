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

// Plateformes visées par le produit. La clé est celle renvoyée par le backend
// dans `connected_platforms` ; SoundCloud et TikTok ne sont pas encore
// branchés, ils apparaissent donc simplement comme non connectés.
const PLATFORMS = [
  { key: "youtube", label: "YouTube" },
  { key: "soundcloud", label: "SoundCloud" },
  { key: "tiktok", label: "TikTok" },
];

// Pastille d'état. La publication n'étant pas encore implémentée, seuls
// « en cours » et « annulé » sont atteignables aujourd'hui ; les deux autres
// attendent la publication et la programmation différée.
const STATUS: Record<string, { color: string; label: string }> = {
  draft: { color: "bg-orange-500", label: "En cours" },
  rendering: { color: "bg-orange-500", label: "En cours" },
  ready: { color: "bg-orange-500", label: "En cours" },
  scheduled: { color: "bg-blue-500", label: "Programmé" },
  published: { color: "bg-green-600", label: "Publié" },
  error: { color: "bg-red-600", label: "Annulé" },
  cancelled: { color: "bg-red-600", label: "Annulé" },
};

/** Initiales de repli quand le compte n'a pas d'avatar. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function HomePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [publications, setPublications] = useState<PublicationSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfile()
      .then((loaded) => {
        setProfile(loaded);
        // La liste n'a de sens qu'une fois connecté — et l'appel échouerait.
        if (loaded) {
          return fetchPublications()
            .then(setPublications)
            .catch(() => setPublications([]));
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
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 p-6">
        <div>
          <h1 className="text-2xl font-semibold">Publier un morceau</h1>
          <p className="mt-2 text-sm opacity-70">
            Connectez votre compte Google pour publier sur YouTube. Une seule
            autorisation couvre la connexion et la publication.
          </p>
        </div>
        <a
          href={loginUrl}
          className="rounded-lg bg-foreground px-4 py-3 text-center font-medium text-background"
        >
          Se connecter avec Google
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-md flex-1 p-6">
      <section className="mb-8 flex items-center gap-4 rounded-lg border border-current/15 p-4">
        {profile.avatar_url ? (
          // Avatar Google distant : le pipeline d'optimisation de Next
          // n'apporterait rien pour une vignette déjà dimensionnée.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.avatar_url}
            alt=""
            className="h-14 w-14 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-current/10 text-lg font-semibold">
            {initials(profile.display_name)}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold">
            {profile.artist_name ?? profile.display_name}
          </h1>
          {profile.artist_name && (
            <p className="truncate text-sm opacity-70">{profile.display_name}</p>
          )}
          <p className="truncate text-sm opacity-60">{profile.email}</p>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-medium">Plateformes</h2>
        <ul className="flex flex-col gap-2">
          {PLATFORMS.map(({ key, label }) => {
            const connected = profile.connected_platforms.includes(key);
            return (
              <li
                key={key}
                className="flex items-center justify-between rounded-lg border border-current/15 px-3 py-2"
              >
                <span className="text-sm">{label}</span>
                {connected ? (
                  <span className="flex items-center gap-1 text-sm font-medium text-green-700 dark:text-green-400">
                    <span aria-hidden>✓</span> Connectée
                  </span>
                ) : (
                  <span className="text-sm opacity-50">Non connectée</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <Link
        href="/publications/new"
        className="block rounded-lg bg-foreground px-4 py-3 text-center font-medium text-background"
      >
        Créer une publication
      </Link>

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-medium">Vos publications</h2>
        {publications.length === 0 ? (
          <p className="text-sm opacity-60">Aucune publication pour l’instant.</p>
        ) : (
          <ul className="flex flex-col">
            {publications.map((publication) => {
              const badge = STATUS[publication.status] ?? {
                color: "bg-current/30",
                label: publication.status,
              };
              return (
                <li
                  key={publication.id}
                  className="flex items-center gap-3 border-b border-current/10 py-3"
                >
                  <span
                    aria-hidden
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${badge.color}`}
                  />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/publications/${publication.id}`}
                      className="block truncate font-medium underline-offset-2 hover:underline"
                    >
                      {publication.title}
                    </Link>
                    <p className="text-xs tabular-nums opacity-60">
                      {formatDateTime(publication.created_at)} · {badge.label}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
