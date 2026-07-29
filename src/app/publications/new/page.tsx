"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  ApiError,
  createPublication,
  fetchProfile,
  fetchStyles,
  uploadAudio,
  type Profile,
} from "@/lib/api";
import {
  checkDuration,
  checkFile,
  formatBytes,
  formatDuration,
} from "@/lib/audio";
import { ACCEPT_ATTRIBUTE, MUSIC_STYLES } from "@/lib/constants";

type Selection = {
  file: File;
  objectUrl: string;
  // `null` tant que le lecteur n'a pas lu les métadonnées.
  durationSeconds: number | null;
};

const FIELD =
  "min-h-12 w-full rounded-lg border border-current/15 bg-transparent px-3 py-2.5 text-base";

const STEPS = ["Audio", "Image", "Vidéo", "Post"];

export default function NewPublicationPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [selection, setSelection] = useState<Selection | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const [title, setTitle] = useState("");
  const [artistName, setArtistName] = useState("");
  const [style, setStyle] = useState<string>("RAP");
  // Styles proposés : intégrés + personnalisés du créateur. Repli sur les
  // intégrés le temps du chargement (ou si l'appel échoue).
  const [styleOptions, setStyleOptions] = useState<string[]>([...MUSIC_STYLES]);

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // « Continuer » ne se désactive jamais sans motif (audit #5) : le motif
  // n'apparaît qu'après une tentative, puis disparaît dès que tout est prêt.
  const [showMissing, setShowMissing] = useState(false);

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

  useEffect(() => {
    fetchStyles()
      .then((styles) => setStyleOptions([...styles.builtin, ...styles.custom.map((s) => s.name)]))
      .catch(() => {});
  }, []);

  // La connexion vit sur l'accueil : un visiteur non connecté qui arrive
  // directement sur cette route y est renvoyé.
  useEffect(() => {
    if (!loadingProfile && !profile) router.replace("/");
  }, [loadingProfile, profile, router]);

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

  function handleFile(file: File | undefined) {
    setUploadError(null);
    setShowMissing(false);

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

    // Titre par défaut : le nom du fichier sans extension, tant que le créateur
    // n'a pas déjà saisi un titre (on ne l'écrase jamais).
    setTitle((current) =>
      current.trim() ? current : file.name.replace(/\.[^./\\]+$/, ""),
    );

    // La durée est lue par le lecteur `<audio>` affiché ci-dessous, via son
    // événement `loadedmetadata` — pas par une sonde séparée. Une sonde
    // chargerait le même blob une seconde fois pour rien.
    setFileError(null);
    replaceSelection({
      file,
      objectUrl: URL.createObjectURL(file),
      durationSeconds: null,
    });
  }

  // Appelé quand le lecteur a lu les métadonnées : on valide la durée ici,
  // maintenant qu'on la connaît sans avoir chargé le fichier deux fois. Le
  // fichier a pu être remplacé entre-temps (événement tardif) — on ignore alors.
  function acceptDuration(objectUrl: string, durationSeconds: number) {
    if (currentObjectUrl.current !== objectUrl) return;
    const durationCheck = checkDuration(durationSeconds);
    if (!durationCheck.ok) {
      rejectFile(durationCheck.message);
      return;
    }
    setSelection((current) =>
      current && current.objectUrl === objectUrl
        ? { ...current, durationSeconds }
        : current,
    );
  }

  // Ce qui manque pour continuer — le bouton reste actif, le motif s'affiche.
  const missing: string[] = [];
  if (!selection) missing.push("le fichier audio");
  else if (selection.durationSeconds === null)
    missing.push("la vérification du fichier (patientez une seconde)");
  if (!title.trim()) missing.push("le titre du morceau");
  const ready = missing.length === 0;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (uploading) return;
    if (!ready || !selection) {
      // Révèle le motif au tap plutôt que d'opposer un bouton mort (audit #5).
      setShowMissing(true);
      return;
    }

    setUploading(true);
    setUploadError(null);
    setProgress(0);

    try {
      const upload = await uploadAudio(selection.file, setProgress);
      const publication = await createPublication({
        title: title.trim(),
        artist_name: artistName.trim() || profile!.display_name,
        style,
        audio_key: upload.key,
        // La durée retenue est celle mesurée par le backend, pas celle lue
        // par le navigateur : c'est elle qui fera foi pour le rendu vidéo.
        audio_duration_s: upload.duration_s,
      });
      router.push(`/publications/${publication.id}`);
    } catch (error) {
      setUploadError(
        error instanceof ApiError
          ? error.message
          : "L’envoi a échoué — réessayez.",
      );
      setUploading(false);
    }
    // Pas de `finally` : en cas de succès la navigation est en cours, réactiver
    // le formulaire ferait clignoter le bouton avant que la page ne change.
  }

  if (loadingProfile || !profile) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 items-center justify-center p-6">
        <p className="text-sm opacity-60">Chargement…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-md flex-1 p-6">
      {/* Barre à 4 étapes nommées, la même que sur l'écran image (audit #6). */}
      <ol className="mb-6 flex gap-1.5" aria-label="Étape 1 sur 4">
        {STEPS.map((name, index) => {
          const step = index + 1;
          const current = step === 1;
          return (
            <li key={name} className="flex-1">
              <div
                className={`h-1 rounded-full ${current ? "bg-[color:var(--accent)]" : "bg-current/15"}`}
              />
              <span
                className={`mt-1.5 block text-[10px] font-medium uppercase tracking-wide ${
                  current ? "text-[color:var(--accent-ink)]" : "opacity-50"
                }`}
                aria-current={current ? "step" : undefined}
              >
                {step} {name}
              </span>
            </li>
          );
        })}
      </ol>

      <header className="mb-5">
        <h1 className="text-2xl font-semibold">Votre fichier audio</h1>
        {/* Contraintes affichées AVANT le choix du fichier (audit #14). */}
        <p className="mt-1 text-sm opacity-70">mp3 ou wav · 50 Mo · 10 min maximum</p>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <fieldset className="flex flex-col gap-2" disabled={uploading}>
          <span className="text-sm font-medium">Fichier audio</span>

          {selection ? (
            // Fiche fichier : nom, durée, poids, lecture (audit #14).
            <div className="flex flex-col gap-3 rounded-lg border border-current/15 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{selection.file.name}</p>
                  <p className="mt-0.5 text-xs tabular-nums opacity-60">
                    {selection.durationSeconds !== null
                      ? formatDuration(selection.durationSeconds)
                      : "durée…"}{" "}
                    · {formatBytes(selection.file.size)}
                  </p>
                </div>
                <label className="btn btn-ghost shrink-0 cursor-pointer text-sm">
                  Changer
                  <input
                    type="file"
                    accept={ACCEPT_ATTRIBUTE}
                    onChange={(event) => handleFile(event.target.files?.[0])}
                    className="hidden"
                  />
                </label>
              </div>
              <audio
                controls
                // `metadata` : on ne veut que la durée, pas décoder tout le
                // fichier — et ce lecteur est la seule source de la durée.
                preload="metadata"
                src={selection.objectUrl}
                onLoadedMetadata={(event) =>
                  acceptDuration(selection.objectUrl, event.currentTarget.duration)
                }
                onError={() => {
                  // Ignorer une erreur tardive : elle peut venir de la
                  // révocation de l'objectUrl d'un fichier déjà remplacé.
                  if (currentObjectUrl.current === selection.objectUrl) {
                    rejectFile("Fichier audio illisible ou corrompu.");
                  }
                }}
                className="w-full"
              />
            </div>
          ) : (
            // Zone de dépôt conçue : glisser-déposer ou choisir (audit #14).
            <label
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                handleFile(event.dataTransfer.files?.[0]);
              }}
              className={`flex min-h-[132px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
                dragging
                  ? "border-[color:var(--accent)] bg-[color:var(--accent-soft)]"
                  : fileError
                    ? "border-[color:var(--danger)]/50"
                    : "border-current/25"
              }`}
            >
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                className="text-[color:var(--accent-ink)]"
              >
                <path d="M12 20V8" />
                <path d="M7 12l5-5 5 5" />
                <path d="M4 4h16" />
              </svg>
              <span className="text-sm font-medium">
                Déposez votre fichier ici, ou choisissez-le
              </span>
              <span className="text-xs opacity-60">mp3 ou wav · 50 Mo · 10 min</span>
              <input
                type="file"
                accept={ACCEPT_ATTRIBUTE}
                onChange={(event) => handleFile(event.target.files?.[0])}
                aria-invalid={fileError !== null}
                className="hidden"
              />
            </label>
          )}

          {fileError && (
            <p role="alert" className="text-sm font-medium text-[color:var(--danger-ink)]">
              {fileError}
            </p>
          )}
        </fieldset>

        <fieldset className="flex flex-col gap-2" disabled={uploading}>
          <label htmlFor="titre" className="text-sm font-medium">
            Titre du morceau — tel qu’il apparaîtra sur YouTube
          </label>
          <input
            id="titre"
            type="text"
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              setShowMissing(false);
            }}
            maxLength={120}
            required
            placeholder="Ex. Nuit blanche"
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
            Style musical — donne l’ambiance de la vidéo
          </label>
          <select
            id="style"
            value={style}
            onChange={(event) => setStyle(event.target.value)}
            className={FIELD}
          >
            {styleOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <p className="text-xs opacity-60">
            Un autre style ? Créez-le dans les Paramètres — il apparaîtra ensuite
            dans cette liste.
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
                className="h-full bg-[color:var(--accent)] transition-[width] duration-200"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <p className="text-xs tabular-nums opacity-60">
              Envoi… {Math.round(progress * 100)} % · vous pouvez déjà remplir le
              titre
            </p>
          </div>
        )}

        {uploadError && (
          <p role="alert" className="text-sm font-medium text-[color:var(--danger-ink)]">
            {uploadError}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <button type="submit" disabled={uploading} className="btn btn-primary btn-block min-h-[52px] text-base">
            {uploading ? (
              "Envoi en cours…"
            ) : (
              <>
                Continuer vers l’image
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
              </>
            )}
          </button>
          {showMissing && !ready ? (
            <p role="alert" className="text-center text-sm font-medium text-[color:var(--danger-ink)]">
              Il manque : {missing.join(" et ")}.
            </p>
          ) : (
            <p className="text-center text-xs opacity-60">
              Rien n’est publié avant l’étape 4.
            </p>
          )}
        </div>
      </form>
    </main>
  );
}
