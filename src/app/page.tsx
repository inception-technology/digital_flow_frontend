"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  ApiError,
  fetchProfile,
  loginUrl,
  uploadAudio,
  type AudioUpload,
  type Profile,
} from "@/lib/api";
import {
  checkDuration,
  checkFile,
  formatBytes,
  formatDuration,
  readDuration,
} from "@/lib/audio";
import { ACCEPT_ATTRIBUTE, MUSIC_STYLES, type MusicStyle } from "@/lib/constants";

type Selection = {
  file: File;
  objectUrl: string;
  durationSeconds: number;
};

const FIELD =
  "rounded-lg border border-current/15 bg-transparent p-3 text-base";

export default function UploadPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [selection, setSelection] = useState<Selection | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [artistName, setArtistName] = useState("");
  const [style, setStyle] = useState<MusicStyle>("RAP");

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [result, setResult] = useState<AudioUpload | null>(null);

  // Hors du state : ne sert qu'au nettoyage, un re-rendu serait inutile.
  const currentObjectUrl = useRef<string | null>(null);

  useEffect(() => {
    fetchProfile()
      .then((loaded) => {
        setProfile(loaded);
        if (loaded) setArtistName(loaded.artist_name ?? loaded.display_name);
      })
      .catch(() => setProfile(null))
      .finally(() => setLoadingProfile(false));
  }, []);

  // Une object URL n'est jamais libérée automatiquement : sans ça, chaque
  // fichier essayé garderait sa copie en mémoire jusqu'au rechargement.
  useEffect(() => {
    return () => {
      if (currentObjectUrl.current) URL.revokeObjectURL(currentObjectUrl.current);
    };
  }, []);

  const replaceSelection = useCallback((next: Selection | null) => {
    if (currentObjectUrl.current) URL.revokeObjectURL(currentObjectUrl.current);
    currentObjectUrl.current = next?.objectUrl ?? null;
    setSelection(next);
  }, []);

  const rejectFile = useCallback(
    (message: string, objectUrl?: string) => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      replaceSelection(null);
      setFileError(message);
    },
    [replaceSelection],
  );

  async function handleFile(file: File | undefined) {
    setUploadError(null);
    setResult(null);

    if (!file) {
      replaceSelection(null);
      setFileError(null);
      return;
    }

    const fileCheck = checkFile(file);
    if (!fileCheck.ok) {
      rejectFile(fileCheck.message);
      return;
    }

    const objectUrl = URL.createObjectURL(file);

    let durationSeconds: number;
    try {
      durationSeconds = await readDuration(objectUrl);
    } catch {
      rejectFile("Fichier audio illisible ou corrompu.", objectUrl);
      return;
    }

    const durationCheck = checkDuration(durationSeconds);
    if (!durationCheck.ok) {
      rejectFile(durationCheck.message, objectUrl);
      return;
    }

    setFileError(null);
    replaceSelection({ file, objectUrl, durationSeconds });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!selection || !title.trim()) return;

    setUploading(true);
    setUploadError(null);
    setProgress(0);

    try {
      setResult(await uploadAudio(selection.file, setProgress));
    } catch (error) {
      setUploadError(
        error instanceof ApiError
          ? error.message
          : "L’envoi a échoué — réessayez.",
      );
    } finally {
      setUploading(false);
    }
  }

  const canContinue =
    selection !== null && title.trim().length > 0 && !uploading;

  if (loadingProfile) {
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
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Publier un morceau</h1>
        <p className="mt-1 text-sm opacity-60">
          Étape 1 sur 3 — votre fichier audio
        </p>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <fieldset className="flex flex-col gap-2" disabled={uploading}>
          <label htmlFor="audio" className="text-sm font-medium">
            Fichier audio
          </label>
          <input
            id="audio"
            type="file"
            accept={ACCEPT_ATTRIBUTE}
            onChange={(event) => handleFile(event.target.files?.[0])}
            aria-describedby="audio-aide"
            aria-invalid={fileError !== null}
            className="rounded-lg border border-current/15 p-3 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-current/10 file:px-3 file:py-1.5 file:text-sm"
          />
          <p id="audio-aide" className="text-xs opacity-60">
            mp3 ou wav · 50 Mo et 10 minutes maximum
          </p>

          {fileError && (
            <p
              role="alert"
              className="text-sm font-medium text-red-700 dark:text-red-400"
            >
              {fileError}
            </p>
          )}

          {selection && (
            <div className="mt-2 flex flex-col gap-2 rounded-lg border border-current/15 p-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm font-medium">
                  {selection.file.name}
                </span>
                <span className="shrink-0 text-xs tabular-nums opacity-60">
                  {formatDuration(selection.durationSeconds)} ·{" "}
                  {formatBytes(selection.file.size)}
                </span>
              </div>
              <audio controls src={selection.objectUrl} className="w-full" />
            </div>
          )}
        </fieldset>

        <fieldset className="flex flex-col gap-2" disabled={uploading}>
          <label htmlFor="titre" className="text-sm font-medium">
            Titre du morceau
          </label>
          <input
            id="titre"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={120}
            required
            placeholder="Nuit blanche"
            className={FIELD}
          />
        </fieldset>

        <fieldset className="flex flex-col gap-2" disabled={uploading}>
          <label htmlFor="artiste" className="text-sm font-medium">
            Nom d’artiste
          </label>
          <input
            id="artiste"
            type="text"
            value={artistName}
            onChange={(event) => setArtistName(event.target.value)}
            maxLength={120}
            className={FIELD}
          />
        </fieldset>

        <fieldset className="flex flex-col gap-2" disabled={uploading}>
          <label htmlFor="style" className="text-sm font-medium">
            Style musical
          </label>
          <select
            id="style"
            value={style}
            onChange={(event) => setStyle(event.target.value as MusicStyle)}
            className={FIELD}
          >
            {MUSIC_STYLES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <p className="text-xs opacity-60">
            Détermine l’ambiance visuelle de la vidéo — rien à régler ensuite.
          </p>
        </fieldset>

        {uploading && (
          <div className="flex flex-col gap-1">
            <div
              role="progressbar"
              aria-valuenow={Math.round(progress * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Envoi du fichier"
              className="h-2 overflow-hidden rounded-full bg-current/10"
            >
              <div
                className="h-full bg-foreground transition-[width] duration-200"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <p className="text-xs tabular-nums opacity-60">
              Envoi… {Math.round(progress * 100)} %
            </p>
          </div>
        )}

        {uploadError && (
          <p
            role="alert"
            className="text-sm font-medium text-red-700 dark:text-red-400"
          >
            {uploadError}
          </p>
        )}

        {result && (
          <div role="status" className="rounded-lg border border-current/15 p-3 text-sm">
            <p className="font-medium">Fichier envoyé.</p>
            <p className="mt-1 opacity-70">
              {formatDuration(result.duration_s)} ·{" "}
              {formatBytes(result.size_bytes)}. La génération de l’image arrive
              à l’étape suivante.
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={!canContinue}
          className="rounded-lg bg-foreground px-4 py-3 font-medium text-background disabled:cursor-not-allowed disabled:opacity-40"
        >
          {uploading ? "Envoi en cours…" : "Continuer →"}
        </button>
      </form>
    </main>
  );
}
