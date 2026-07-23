"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { fetchProfile, loginUrl, type Profile } from "@/lib/api";

/** Initiales de repli quand le compte n'a pas d'avatar. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default function HomePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfile()
      .then(setProfile)
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
        <h2 className="mb-2 text-sm font-medium">Plateformes connectées</h2>
        {profile.connected_platforms.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {profile.connected_platforms.map((platform) => (
              <li
                key={platform}
                className="rounded-full border border-current/20 px-3 py-1 text-sm capitalize"
              >
                {platform}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm opacity-60">
            Aucune plateforme connectée pour l’instant.
          </p>
        )}
      </section>

      <Link
        href="/publications/new"
        className="block rounded-lg bg-foreground px-4 py-3 text-center font-medium text-background"
      >
        Créer une publication
      </Link>
    </main>
  );
}
