"use client";

import { useEffect, useState } from "react";

import {
  ApiError,
  fetchPublication,
  generateCover,
  uploadCover,
  type Publication,
} from "@/lib/api";

const RATIO_LABELS: Record<string, string> = {
  "16:9": "Miniature YouTube",
  "9:16": "Shorts et TikTok",
  "1:1": "Pochette SoundCloud",
};

// L'ordre d'affichage suit l'importance : la miniature YouTube est le visuel
// le plus vu, la pochette carrée le plus durable.
const RATIO_ORDER = ["16:9", "1:1", "9:16"];

const ACTION =
  "rounded-lg border border-current/20 px-4 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40";

export function CoverStep({ publicationId }: { publicationId: string }) {
  const [publication, setPublication] = useState<Publication | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | "generation" | "upload">(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPublication(publicationId)
      .then(setPublication)
      .catch((caught) =>
        setError(
          caught instanceof ApiError
            ? caught.message
            : "Publication introuvable.",
        ),
      )
      .finally(() => setLoading(false));
  }, [publicationId]);

  async function run(
    kind: "generation" | "upload",
    action: () => Promise<Publication>,
  ) {
    setBusy(kind);
    setError(null);
    try {
      setPublication(await action());
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "L’opération a échoué — réessayez.",
      );
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <p className="p-6 text-sm opacity-60">Chargement…</p>;
  }

  if (!publication) {
    return (
      <p role="alert" className="p-6 text-sm font-medium text-red-700 dark:text-red-400">
        {error ?? "Publication introuvable."}
      </p>
    );
  }

  const covers = [...publication.covers].sort(
    (a, b) => RATIO_ORDER.indexOf(a.ratio) - RATIO_ORDER.indexOf(b.ratio),
  );
  const hasCovers = covers.length > 0;
  const noGenerationsLeft = publication.remaining_generations === 0;

  return (
    <main className="mx-auto w-full max-w-md flex-1 p-6">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">{publication.title}</h1>
        <p className="mt-1 text-sm opacity-60">
          Étape 2 sur 3 — les visuels · {publication.artist_name} ·{" "}
          {publication.style}
        </p>
      </header>

      {!hasCovers && (
        <div className="mb-6 flex flex-col gap-3 rounded-lg border border-current/15 p-4">
          <p className="text-sm">
            Une pochette va être créée à partir du titre et du style, puis
            déclinée automatiquement dans les trois formats.
          </p>
          <button
            type="button"
            onClick={() => run("generation", () => generateCover(publication.id))}
            disabled={busy !== null}
            className="rounded-lg bg-foreground px-4 py-3 font-medium text-background disabled:opacity-40"
          >
            {busy === "generation"
              ? "Création en cours…"
              : "Créer la pochette"}
          </button>
          <p className="text-xs opacity-60">
            Cela prend une trentaine de secondes.
          </p>
        </div>
      )}

      {hasCovers && (
        // Défilement horizontal plutôt qu'une grille : sur téléphone, trois
        // aperçus côte à côte seraient illisibles.
        <ul className="-mx-6 mb-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-2">
          {covers.map((cover) => (
            <li
              key={cover.ratio}
              className="flex w-56 shrink-0 snap-center flex-col gap-2"
            >
              <div className="flex items-center justify-center rounded-lg border border-current/15 bg-current/5 p-2">
                {/* Image distante signée et de durée courte : le pipeline
                    d'optimisation de Next n'apporterait rien ici. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cover.url}
                  alt={`Aperçu ${RATIO_LABELS[cover.ratio] ?? cover.ratio}`}
                  className="max-h-56 w-auto rounded"
                />
              </div>
              <div>
                <p className="text-sm font-medium">
                  {RATIO_LABELS[cover.ratio] ?? cover.ratio}
                </p>
                <p className="text-xs tabular-nums opacity-60">
                  {cover.ratio} · {cover.width}×{cover.height}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p
          role="alert"
          className="mb-4 text-sm font-medium text-red-700 dark:text-red-400"
        >
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {hasCovers && (
          <button
            type="button"
            onClick={() => run("generation", () => generateCover(publication.id))}
            disabled={busy !== null || noGenerationsLeft}
            className={ACTION}
          >
            {busy === "generation"
              ? "Création en cours…"
              : noGenerationsLeft
                ? "Plus de regénération disponible"
                : `Regénérer (${publication.remaining_generations} restantes)`}
          </button>
        )}

        <label className={`${ACTION} cursor-pointer text-center`}>
          {busy === "upload" ? "Envoi…" : "Utiliser ma propre image"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            disabled={busy !== null}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) run("upload", () => uploadCover(publication.id, file));
            }}
          />
        </label>

        <button
          type="button"
          disabled={!hasCovers}
          title={
            hasCovers
              ? "L’étape suivante n’est pas encore disponible"
              : undefined
          }
          className="rounded-lg bg-foreground px-4 py-3 font-medium text-background disabled:cursor-not-allowed disabled:opacity-40"
        >
          J’accepte ces visuels →
        </button>

        {hasCovers && (
          <p className="text-xs opacity-60">
            L’étape suivante — rendu vidéo et textes — arrive prochainement.
          </p>
        )}
      </div>
    </main>
  );
}
