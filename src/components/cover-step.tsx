"use client";

import { useEffect, useState } from "react";

import {
  ApiError,
  fetchPublication,
  generateCover,
  startRender,
  uploadCover,
  type CoverFormat,
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

const VIDEO_LABELS: Record<string, string> = {
  landscape: "Format paysage — YouTube",
  vertical: "Format vertical — Shorts et TikTok",
};

const VIDEO_ORDER = ["landscape", "vertical"];

const ACTION =
  "rounded-lg border border-current/20 px-4 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40";

type Busy = null | "generation" | "upload" | "render";

export function CoverStep({ publicationId }: { publicationId: string }) {
  const [publication, setPublication] = useState<Publication | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [enlarged, setEnlarged] = useState<CoverFormat | null>(null);

  // Échap ferme l'aperçu agrandi — au clavier comme au clic sur le fond.
  useEffect(() => {
    if (!enlarged) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setEnlarged(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [enlarged]);

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

  // Le rendu vidéo dure plusieurs minutes côté serveur : tant que la
  // publication est en « rendering », on interroge l'état régulièrement
  // jusqu'à « ready » (vidéos prêtes) ou « error ».
  const status = publication?.status;
  useEffect(() => {
    if (status !== "rendering") return;
    const timer = setInterval(() => {
      fetchPublication(publicationId).then(setPublication).catch(() => {});
    }, 4000);
    return () => clearInterval(timer);
  }, [status, publicationId]);

  async function run(kind: Busy, action: () => Promise<Publication>) {
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

  const videos = [...publication.videos].sort(
    (a, b) =>
      VIDEO_ORDER.indexOf(a.output_format) -
      VIDEO_ORDER.indexOf(b.output_format),
  );
  const hasVideos = videos.length > 0;
  const isRendering = publication.status === "rendering";

  // Un seul champ, réutilisé selon qu'on part de zéro ou qu'on regénère : les
  // deux emplacements sont mutuellement exclusifs (pochette absente / présente).
  const promptField = (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">Direction créative (optionnel)</span>
      <textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        disabled={busy !== null}
        rows={2}
        maxLength={1000}
        placeholder="Ex. un loup solitaire sous une lune rouge, brume légère"
        className="rounded-lg border border-current/20 bg-transparent px-3 py-2 disabled:opacity-40"
      />
      <span className="text-xs opacity-60">
        Remplace l’ambiance déduite du style. Le sujet reste centré, sans texte.
      </span>
    </label>
  );

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
          {promptField}
          <button
            type="button"
            onClick={() =>
              run("generation", () => generateCover(publication.id, prompt))
            }
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
        // Empilement vertical : sur téléphone, un défilement horizontal
        // cachait les visuels suivants. Chaque aperçu s'agrandit au clic.
        <ul className="mb-6 flex flex-col gap-4">
          {covers.map((cover) => (
            <li key={cover.ratio} className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setEnlarged(cover)}
                aria-label={`Agrandir ${RATIO_LABELS[cover.ratio] ?? cover.ratio}`}
                className="flex items-center justify-center rounded-lg border border-current/15 bg-current/5 p-2"
              >
                {/* Image distante signée et de durée courte : le pipeline
                    d'optimisation de Next n'apporterait rien ici. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cover.url}
                  alt={`Aperçu ${RATIO_LABELS[cover.ratio] ?? cover.ratio}`}
                  className="max-h-80 w-auto rounded"
                />
              </button>
              <div>
                <p className="text-sm font-medium">
                  {RATIO_LABELS[cover.ratio] ?? cover.ratio}
                </p>
                <p className="text-xs tabular-nums opacity-60">
                  {cover.ratio} · {cover.width}×{cover.height} · appuyez pour
                  agrandir
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {enlarged && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Aperçu agrandi — ${RATIO_LABELS[enlarged.ratio] ?? enlarged.ratio}`}
          onClick={() => setEnlarged(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={enlarged.url}
            alt={`Aperçu ${RATIO_LABELS[enlarged.ratio] ?? enlarged.ratio}`}
            className="max-h-full max-w-full rounded object-contain"
          />
          <button
            type="button"
            onClick={() => setEnlarged(null)}
            className="absolute right-4 top-4 rounded-lg bg-white/15 px-3 py-2 text-sm font-medium text-white backdrop-blur"
          >
            Fermer
          </button>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mb-4 text-sm font-medium text-red-700 dark:text-red-400"
        >
          {error}
        </p>
      )}

      {!hasVideos && publication.render_error && (
        <p
          role="alert"
          className="mb-4 text-sm font-medium text-red-700 dark:text-red-400"
        >
          Le rendu a échoué : {publication.render_error} — relancez-le.
        </p>
      )}

      {hasVideos ? (
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-semibold">Vos vidéos sont prêtes</h2>
            <p className="mt-1 text-sm opacity-60">
              Téléchargez chaque format et publiez-le sur la plateforme
              correspondante.
            </p>
          </div>
          {videos.map((video) => (
            <div key={video.output_format} className="flex flex-col gap-2">
              <p className="text-sm font-medium">
                {VIDEO_LABELS[video.output_format] ?? video.output_format}
              </p>
              <video
                src={video.url}
                controls
                className="w-full rounded-lg border border-current/15 bg-black"
              />
              <a
                href={video.url}
                download
                className={`${ACTION} text-center`}
              >
                Télécharger cette vidéo
              </a>
            </div>
          ))}
        </section>
      ) : (
        <div className="flex flex-col gap-3">
          {hasCovers && !isRendering && (
            <>
              {!noGenerationsLeft && promptField}
              <button
                type="button"
                onClick={() =>
                  run("generation", () => generateCover(publication.id, prompt))
                }
                disabled={busy !== null || noGenerationsLeft}
                className={ACTION}
              >
                {busy === "generation"
                  ? "Création en cours…"
                  : noGenerationsLeft
                    ? "Plus de regénération disponible"
                    : `Regénérer (${publication.remaining_generations} restantes)`}
              </button>

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
                    if (file)
                      run("upload", () => uploadCover(publication.id, file));
                  }}
                />
              </label>
            </>
          )}

          {isRendering ? (
            <div className="rounded-lg border border-current/15 p-4">
              <p className="text-sm font-medium">Rendu des vidéos en cours…</p>
              <p className="mt-1 text-xs opacity-60">
                Le montage des deux formats prend quelques minutes. Vous pouvez
                laisser cette page ouverte — elle se met à jour toute seule.
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => run("render", () => startRender(publication.id))}
              disabled={!hasCovers || busy !== null}
              className="rounded-lg bg-foreground px-4 py-3 font-medium text-background disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy === "render"
                ? "Lancement du rendu…"
                : "J’accepte ces visuels — lancer les vidéos →"}
            </button>
          )}
        </div>
      )}
    </main>
  );
}
