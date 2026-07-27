"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  ApiError,
  fetchProfile,
  logout,
  soundcloudLoginUrl,
  updateArtistName,
  type Profile,
} from "@/lib/api";

const SOUNDCLOUD_FEEDBACK: Record<string, string> = {
  connecte: "SoundCloud est maintenant connecté.",
  refus: "Connexion SoundCloud annulée.",
};

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const [artistName, setArtistName] = useState("");
  const [busy, setBusy] = useState<null | "save" | "logout">(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [platformNotice, setPlatformNotice] = useState<string | null>(null);

  // Retour du flow OAuth SoundCloud (?soundcloud=connecte|refus). Lu depuis
  // l'URL sans `useSearchParams` (qui imposerait un Suspense au build), puis
  // nettoyé pour ne pas rester après un rafraîchissement.
  useEffect(() => {
    const outcome = new URLSearchParams(window.location.search).get("soundcloud");
    if (outcome && outcome in SOUNDCLOUD_FEEDBACK) {
      // Après montage volontairement : lire l'URL au rendu (initialiseur) ou en
      // SSR divergerait du HTML serveur (mismatch d'hydratation).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPlatformNotice(SOUNDCLOUD_FEEDBACK[outcome]);
      window.history.replaceState(null, "", "/parametres");
    }
  }, []);

  useEffect(() => {
    fetchProfile()
      .then((loaded) => {
        setProfile(loaded);
        if (loaded) setArtistName(loaded.artist_name ?? "");
      })
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, []);

  // La connexion vit sur l'accueil : un visiteur non connecté y est renvoyé.
  useEffect(() => {
    if (!loading && !profile) router.replace("/");
  }, [loading, profile, router]);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setBusy("save");
    setError(null);
    setSaved(false);
    try {
      const updated = await updateArtistName(artistName);
      setProfile(updated);
      setArtistName(updated.artist_name ?? "");
      setSaved(true);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "L’enregistrement a échoué — réessayez.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleLogout() {
    setBusy("logout");
    setError(null);
    try {
      await logout();
      router.replace("/");
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "La déconnexion a échoué — réessayez.",
      );
      setBusy(null);
    }
    // Pas de `finally` : en cas de succès la navigation est en cours.
  }

  if (loading || !profile) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 items-center justify-center p-6">
        <p className="text-sm opacity-60">Chargement…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-md flex-1 p-6">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Paramètres</h1>
        <p className="mt-1 truncate text-sm opacity-60">{profile.email}</p>
      </header>

      <form onSubmit={handleSave} className="mb-8 flex flex-col gap-2">
        <label htmlFor="artiste" className="text-sm font-medium">
          Nom d’artiste
        </label>
        <input
          id="artiste"
          type="text"
          value={artistName}
          onChange={(event) => {
            setArtistName(event.target.value);
            setSaved(false);
          }}
          maxLength={120}
          placeholder={profile.display_name}
          aria-describedby="artiste-aide"
          className="rounded-lg border border-current/15 bg-transparent p-3 text-base"
        />
        <p id="artiste-aide" className="text-xs opacity-60">
          Proposé par défaut à chaque publication. Laissez vide pour utiliser{" "}
          « {profile.display_name} ».
        </p>

        {error && (
          <p
            role="alert"
            className="text-sm font-medium text-red-700 dark:text-red-400"
          >
            {error}
          </p>
        )}
        {saved && !error && (
          <p role="status" className="text-sm font-medium opacity-70">
            Enregistré.
          </p>
        )}

        <button
          type="submit"
          disabled={busy !== null}
          className="mt-2 rounded-lg bg-foreground px-4 py-3 font-medium text-background disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy === "save" ? "Enregistrement…" : "Enregistrer"}
        </button>
      </form>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-medium">Plateformes connectées</h2>
        {platformNotice && (
          <p role="status" className="mb-2 text-sm font-medium opacity-70">
            {platformNotice}
          </p>
        )}
        <ul className="flex flex-col gap-2">
          <li className="flex items-center justify-between rounded-lg border border-current/15 p-3 text-sm">
            <span>YouTube</span>
            {profile.connected_platforms.includes("youtube") ? (
              <span className="font-medium text-green-700 dark:text-green-400">
                ✓ Connecté
              </span>
            ) : (
              <span className="opacity-60">Non connecté</span>
            )}
          </li>
          <li className="flex items-center justify-between rounded-lg border border-current/15 p-3 text-sm">
            <span>SoundCloud</span>
            {profile.connected_platforms.includes("soundcloud") ? (
              <span className="font-medium text-green-700 dark:text-green-400">
                ✓ Connecté
              </span>
            ) : (
              <a
                href={soundcloudLoginUrl}
                className="font-medium underline underline-offset-2"
              >
                Connecter
              </a>
            )}
          </li>
        </ul>
      </section>

      <button
        type="button"
        onClick={handleLogout}
        disabled={busy !== null}
        className="w-full rounded-lg border border-current/20 px-4 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy === "logout" ? "Déconnexion…" : "Se déconnecter"}
      </button>
    </main>
  );
}
