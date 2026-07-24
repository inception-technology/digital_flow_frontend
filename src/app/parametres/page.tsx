"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  ApiError,
  fetchProfile,
  logout,
  updateArtistName,
  type Profile,
} from "@/lib/api";

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const [artistName, setArtistName] = useState("");
  const [busy, setBusy] = useState<null | "save" | "logout">(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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
