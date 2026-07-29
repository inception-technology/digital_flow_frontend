"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  ApiError,
  createStyle,
  deleteStyle,
  fetchProfile,
  fetchStyles,
  logout,
  updateArtistName,
  type CustomStyleInfo,
  type Profile,
} from "@/lib/api";
import { PlatformList } from "@/components/platform-list";

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
  // La déconnexion passe par une confirmation : impossible en un seul tap
  // (audit reco #10).
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  // Styles musicaux personnalisés du créateur (en plus des styles intégrés).
  const [styles, setStyles] = useState<CustomStyleInfo[]>([]);
  const [styleName, setStyleName] = useState("");
  const [styleMood, setStyleMood] = useState("");
  const [styleBusy, setStyleBusy] = useState(false);
  const [styleError, setStyleError] = useState<string | null>(null);

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

  useEffect(() => {
    fetchStyles()
      .then((loaded) => setStyles(loaded.custom))
      .catch(() => {});
  }, []);

  // La connexion vit sur l'accueil : un visiteur non connecté y est renvoyé.
  useEffect(() => {
    if (!loading && !profile) router.replace("/");
  }, [loading, profile, router]);

  // Échap ferme la confirmation de déconnexion (sauf pendant l'appel).
  useEffect(() => {
    if (!confirmingLogout) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && busy === null) setConfirmingLogout(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [confirmingLogout, busy]);

  async function handleCreateStyle(event: React.FormEvent) {
    event.preventDefault();
    setStyleError(null);
    setStyleBusy(true);
    try {
      const created = await createStyle(styleName, styleMood);
      setStyles((current) => [created, ...current]);
      setStyleName("");
      setStyleMood("");
    } catch (caught) {
      setStyleError(
        caught instanceof ApiError ? caught.message : "La création du style a échoué — réessayez.",
      );
    } finally {
      setStyleBusy(false);
    }
  }

  async function handleDeleteStyle(name: string) {
    setStyleError(null);
    try {
      await deleteStyle(name);
      setStyles((current) => current.filter((style) => style.name !== name));
    } catch (caught) {
      setStyleError(
        caught instanceof ApiError ? caught.message : "La suppression a échoué — réessayez.",
      );
    }
  }

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
      // Referme la modale pour laisser voir le message d'erreur.
      setConfirmingLogout(false);
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
          disabled={busy !== null || artistName === (profile.artist_name ?? "")}
          className="btn btn-primary mt-2"
        >
          {busy === "save"
            ? "Enregistrement…"
            : artistName === (profile.artist_name ?? "")
              ? "Modifier"
              : "Enregistrer"}
        </button>
      </form>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-medium">Styles musicaux</h2>
        <p className="mb-3 text-xs opacity-60">
          En plus des styles intégrés, créez les vôtres. L’ambiance guide la
          génération d’image ; la vidéo garde un rendu neutre.
        </p>

        {styles.length > 0 && (
          <ul className="mb-3 flex flex-col gap-2">
            {styles.map((style) => (
              <li
                key={style.name}
                className="flex items-start justify-between gap-3 rounded-lg border border-current/15 p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{style.name}</p>
                  <p className="mt-0.5 text-xs opacity-60">{style.mood}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteStyle(style.name)}
                  className="shrink-0 text-xs font-medium text-[color:var(--danger-ink)]"
                >
                  Supprimer
                </button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleCreateStyle} className="flex flex-col gap-2">
          <input
            type="text"
            value={styleName}
            onChange={(event) => setStyleName(event.target.value)}
            maxLength={32}
            placeholder="Nom du style (ex. LO-FI)"
            aria-label="Nom du style"
            className="rounded-lg border border-current/15 bg-transparent p-3 text-base"
          />
          <textarea
            value={styleMood}
            onChange={(event) => setStyleMood(event.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Ambiance (ex. tons pastel, grain doux, mélancolie feutrée)"
            aria-label="Ambiance du style"
            className="rounded-lg border border-current/15 bg-transparent p-3 text-sm"
          />
          {styleError && (
            <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">
              {styleError}
            </p>
          )}
          <button
            type="submit"
            disabled={styleBusy || !styleName.trim() || !styleMood.trim()}
            className="btn btn-secondary"
          >
            {styleBusy ? "Création…" : "Créer le style"}
          </button>
        </form>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-medium">Plateformes connectées</h2>
        {platformNotice && (
          <p role="status" className="mb-2 text-sm font-medium opacity-70">
            {platformNotice}
          </p>
        )}
        {/* Liste partagée avec l'accueil — une seule source (audit reco #8). */}
        <PlatformList connected={profile.connected_platforms} />
      </section>

      <button
        type="button"
        onClick={() => setConfirmingLogout(true)}
        disabled={busy !== null}
        className="btn btn-danger btn-block"
      >
        Se déconnecter
      </button>

      {confirmingLogout && (
        // Confirmation avant déconnexion : une déconnexion accidentelle impose
        // une nouvelle authentification Google (audit reco #10).
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="Confirmer la déconnexion"
          onClick={() => busy === null && setConfirmingLogout(false)}
          className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-4"
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="flex w-full max-w-md flex-col gap-3 rounded-xl border border-current/15 bg-background p-4 shadow-lg"
          >
            <div>
              <p className="text-sm font-medium">Se déconnecter ?</p>
              <p className="mt-1 text-xs opacity-70">
                Vous devrez vous reconnecter avec Google pour revenir. Vos
                publications restent en place.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmingLogout(false)}
                disabled={busy !== null}
                className="btn btn-secondary flex-1"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleLogout}
                disabled={busy !== null}
                className="btn btn-danger flex-1"
              >
                {busy === "logout" ? "Déconnexion…" : "Se déconnecter"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
