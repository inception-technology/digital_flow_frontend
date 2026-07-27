"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  ApiError,
  archivePublication,
  deletePublication,
  fetchPublication,
  fetchRenderStatus,
  generateCover,
  publishYoutube,
  startRender,
  uploadCover,
  type CoverFormat,
  type Privacy,
  type Publication,
} from "@/lib/api";
import { checkCoverDimensions, readImageSize } from "@/lib/image";

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

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

type Busy = null | "generation" | "upload" | "render" | "publish";

const PRIVACY_LABELS: Record<Privacy, string> = {
  public: "Publique",
  unlisted: "Non répertoriée",
  private: "Privée",
};

export function CoverStep({ publicationId }: { publicationId: string }) {
  const router = useRouter();
  const [publication, setPublication] = useState<Publication | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  // Suppression / archivage : gérés à part du reste (`busy`), avec confirmation.
  // Un projet publié s'archive (le morceau vit sur les plateformes) ; les
  // autres se suppriment.
  const [pendingAction, setPendingAction] = useState<null | "delete" | "archive">(
    null,
  );
  const [working, setWorking] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [useTitle, setUseTitle] = useState(true);
  const [useStyle, setUseStyle] = useState(true);
  const [privacy, setPrivacy] = useState<Privacy>("private");
  const [enlarged, setEnlarged] = useState<CoverFormat | null>(null);
  // Avancement du rendu : nombre de formats prêts + temps écoulé, pour un
  // indicateur vivant pendant les quelques minutes que dure le rendu.
  const [renderDone, setRenderDone] = useState(0);
  const [renderTotal, setRenderTotal] = useState(2);
  const [elapsed, setElapsed] = useState(0);

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

    const startedAt = Date.now();
    // Le chrono avance chaque seconde : même à 0/2, l'utilisateur voit que ça
    // travaille. Il repart de ~0 dès le premier tick (calcul depuis startedAt).
    const tick = setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAt) / 1000)),
      1000,
    );
    // On interroge l'endpoint léger (sans URL signée) : il donne l'avancement
    // par format sans faire clignoter les pochettes. Une fois terminé, on
    // recharge la publication complète (avec les vidéos et leurs URLs).
    const poll = setInterval(() => {
      fetchRenderStatus(publicationId)
        .then((render) => {
          setRenderDone(render.videos_done);
          setRenderTotal(render.videos_total);
          if (render.status !== "rendering") {
            fetchPublication(publicationId).then(setPublication).catch(() => {});
          }
        })
        .catch(() => {});
    }, 3000);

    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
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

  async function handleConfirm() {
    if (!pendingAction) return;
    setWorking(true);
    setError(null);
    try {
      if (pendingAction === "delete") await deletePublication(publicationId);
      else await archivePublication(publicationId);
      // Retour à l'accueil : la publication a quitté la liste active, rester ici
      // afficherait un projet supprimé ou archivé.
      router.replace("/");
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "L’opération a échoué — réessayez.",
      );
      setWorking(false);
      setPendingAction(null);
    }
    // Pas de `finally` : en cas de succès la navigation est en cours.
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
  // Un projet publié s'archive ; les autres se suppriment.
  const isPublished = publication.status === "published";

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

  // Décocher retire l'élément du prompt : un titre très évocateur ou un style
  // au parti pris fort tirent l'image dans une direction non voulue.
  const promptSources = (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">
        À prendre en compte pour l’image
      </legend>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={useTitle}
          onChange={(event) => setUseTitle(event.target.checked)}
          disabled={busy !== null}
          className="h-4 w-4"
        />
        Le titre — « {publication.title} »
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={useStyle}
          onChange={(event) => setUseStyle(event.target.checked)}
          disabled={busy !== null || prompt.trim().length > 0}
          className="h-4 w-4"
        />
        Le style — {publication.style}
      </label>
      {prompt.trim().length > 0 && (
        <span className="text-xs opacity-60">
          Votre direction créative remplace déjà le style.
        </span>
      )}
    </fieldset>
  );

  // Un bouton d'import réutilisé sur l'écran initial et parmi les actions. La
  // dimension est vérifiée avant l'envoi : trop petite, l'image donnerait des
  // variantes floues une fois rognée dans les trois formats.
  const coverUpload = (label: string) => (
    <label className={`${ACTION} cursor-pointer text-center`}>
      {busy === "upload" ? "Envoi…" : label}
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        disabled={busy !== null}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          setError(null);
          let size: { width: number; height: number };
          try {
            size = await readImageSize(file);
          } catch {
            setError("Image illisible — utilisez un png, un jpg ou un webp.");
            return;
          }
          const check = checkCoverDimensions(size.width, size.height);
          if (!check.ok) {
            setError(check.message);
            return;
          }
          run("upload", () => uploadCover(publication.id, file));
        }}
      />
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
          {promptSources}
          <button
            type="button"
            onClick={() =>
              run("generation", () =>
                generateCover(publication.id, { prompt, useTitle, useStyle }),
              )
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

          <div className="flex items-center gap-3 text-xs opacity-50">
            <span className="h-px flex-1 bg-current/20" />
            ou
            <span className="h-px flex-1 bg-current/20" />
          </div>
          {coverUpload("Importer ma propre image")}
          <p className="text-xs opacity-60">
            png, jpg ou webp · au moins 1080×1080 px pour les trois formats.
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

      {!isRendering && publication.render_error && (
        <p
          role="alert"
          className="mb-4 text-sm font-medium text-red-700 dark:text-red-400"
        >
          Le rendu a échoué : {publication.render_error} — relancez-le.
        </p>
      )}

      {hasVideos && !isRendering ? (
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

          <div className="mt-2 flex flex-col gap-3 border-t border-current/10 pt-4">
            <h3 className="text-sm font-medium">Publier sur YouTube</h3>
            {publication.youtube_url ? (
              <a
                href={publication.youtube_url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 text-sm font-medium text-green-700 underline underline-offset-2 dark:text-green-400"
              >
                <span aria-hidden>✓</span> Publié — voir sur YouTube
              </a>
            ) : (
              <>
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>Visibilité</span>
                  <select
                    value={privacy}
                    onChange={(event) =>
                      setPrivacy(event.target.value as Privacy)
                    }
                    disabled={busy !== null}
                    className="rounded-lg border border-current/20 bg-transparent px-3 py-2 text-sm"
                  >
                    {(["private", "unlisted", "public"] as Privacy[]).map(
                      (value) => (
                        <option key={value} value={value}>
                          {PRIVACY_LABELS[value]}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() =>
                    run("publish", () =>
                      publishYoutube(publication.id, privacy),
                    )
                  }
                  disabled={busy !== null}
                  className="rounded-lg bg-foreground px-4 py-3 font-medium text-background disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy === "publish"
                    ? "Publication en cours…"
                    : "Publier sur YouTube →"}
                </button>
                <p className="text-xs opacity-60">
                  La vidéo paysage part sur votre chaîne YouTube, avec la
                  miniature 16:9.
                </p>
              </>
            )}
          </div>
        </section>
      ) : (
        <div className="flex flex-col gap-3">
          {hasCovers && !isRendering && (
            <>
              {!noGenerationsLeft && promptField}
              {!noGenerationsLeft && promptSources}
              <button
                type="button"
                onClick={() =>
                  run("generation", () =>
                generateCover(publication.id, { prompt, useTitle, useStyle }),
              )
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

              {coverUpload("Utiliser ma propre image")}
            </>
          )}

          {isRendering ? (
            <div className="flex flex-col gap-3 rounded-lg border border-current/15 p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-medium">
                  Rendu des vidéos… format {Math.min(renderDone + 1, renderTotal)}{" "}
                  sur {renderTotal}
                </p>
                <p className="shrink-0 text-xs tabular-nums opacity-60">
                  {formatElapsed(elapsed)}
                </p>
              </div>
              <div
                role="progressbar"
                aria-valuenow={renderDone}
                aria-valuemin={0}
                aria-valuemax={renderTotal}
                aria-label="Avancement du rendu"
                className="h-2 overflow-hidden rounded-full bg-current/10"
              >
                <div
                  className="h-full bg-foreground transition-[width] duration-500"
                  style={{ width: `${(renderDone / renderTotal) * 100}%` }}
                />
              </div>
              <p className="text-xs opacity-60">
                Chaque format prend une à deux minutes. Vous pouvez laisser cette
                page ouverte — elle se met à jour toute seule.
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

      <footer className="mt-12 border-t border-current/10 pt-4">
        {isPublished ? (
          <button
            type="button"
            onClick={() => setPendingAction("archive")}
            disabled={busy !== null || working}
            className="text-sm font-medium opacity-70 hover:opacity-100 disabled:opacity-40"
          >
            Archiver ce projet
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setPendingAction("delete")}
            disabled={busy !== null || working}
            className="text-sm font-medium text-red-700 disabled:opacity-40 dark:text-red-400"
          >
            Supprimer ce projet
          </button>
        )}
      </footer>

      {pendingAction && (
        // Toast de confirmation : on n'exécute l'action qu'après un second geste
        // explicite (une suppression est irréversible, un archivage retire de la
        // liste active).
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label={
            pendingAction === "delete"
              ? "Confirmer la suppression"
              : "Confirmer l’archivage"
          }
          className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-4"
        >
          <div className="flex w-full max-w-md flex-col gap-3 rounded-xl border border-current/15 bg-background p-4 shadow-lg">
            <div>
              <p className="text-sm font-medium">
                {pendingAction === "delete"
                  ? "Supprimer ce projet ?"
                  : "Archiver ce projet ?"}
              </p>
              <p className="mt-1 text-xs opacity-60">
                {pendingAction === "delete" ? (
                  <>
                    « {publication.title} » et ses visuels et vidéos seront
                    définitivement supprimés. Cette action est irréversible.
                  </>
                ) : (
                  <>
                    « {publication.title} » quittera la liste de vos projets. Le
                    morceau reste en ligne sur les plateformes.
                  </>
                )}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPendingAction(null)}
                disabled={working}
                className="flex-1 rounded-lg border border-current/20 px-4 py-2.5 text-sm font-medium disabled:opacity-40"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={working}
                className={
                  pendingAction === "delete"
                    ? "flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
                    : "flex-1 rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background disabled:opacity-60"
                }
              >
                {working
                  ? pendingAction === "delete"
                    ? "Suppression…"
                    : "Archivage…"
                  : pendingAction === "delete"
                    ? "Supprimer"
                    : "Archiver"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
