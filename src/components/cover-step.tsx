"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  ApiError,
  archivePublication,
  coverSetDownloadUrl,
  coversDownloadUrl,
  deleteCover,
  deleteCoverSet,
  deletePublication,
  fetchProfile,
  fetchPublication,
  fetchRenderStatus,
  generateCover,
  generateMetadata,
  publishSoundcloud,
  publishYoutube,
  startRender,
  updateMetadata,
  uploadCover,
  type CoverFormat,
  type Privacy,
  type Publication,
  type PublicationMetadata,
  type Sharing,
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

type Busy =
  | null
  | "generation"
  | "upload"
  | "render"
  | "publish"
  | "cover"
  | "metadata-gen"
  | "metadata-save";

// Brouillon éditable des métadonnées : tout en chaînes, les hashtags saisis
// séparés par des virgules (découpés à l'enregistrement).
type MetaDraft = {
  youtube_title: string;
  youtube_description: string;
  youtube_tags: string;
  soundcloud_description: string;
  soundcloud_tags: string;
};

function draftFrom(meta: PublicationMetadata): MetaDraft {
  return {
    youtube_title: meta.youtube_title ?? "",
    youtube_description: meta.youtube_description ?? "",
    youtube_tags: meta.youtube_tags.join(", "),
    soundcloud_description: meta.soundcloud_description ?? "",
    soundcloud_tags: meta.soundcloud_tags.join(", "),
  };
}

function splitTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

// Quel format de pochette alimente quelle vidéo — pour verrouiller la
// suppression d'une pochette déjà utilisée au rendu.
const RATIO_VIDEO: Record<string, string> = {
  "16:9": "landscape",
  "9:16": "vertical",
};

const PRIVACY_LABELS: Record<Privacy, string> = {
  public: "Publique",
  unlisted: "Non répertoriée",
  private: "Privée",
};

const SHARING_LABELS: Record<Sharing, string> = {
  public: "Public",
  private: "Privé",
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
  const [sharing, setSharing] = useState<Sharing>("private");
  // Récap de publication (JALON 3) : plateformes reliées au compte, cibles
  // cochées, et confirmation avant d'engager la publication.
  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([]);
  const [targets, setTargets] = useState({ youtube: true, soundcloud: true });
  const [confirmingPublish, setConfirmingPublish] = useState(false);
  const [enlarged, setEnlarged] = useState<CoverFormat | null>(null);
  // Avancement du rendu : nombre de formats prêts + temps écoulé, pour un
  // indicateur vivant pendant les quelques minutes que dure le rendu.
  const [renderDone, setRenderDone] = useState(0);
  const [renderTotal, setRenderTotal] = useState(2);
  const [elapsed, setElapsed] = useState(0);
  // Brouillon éditable des textes de publication (JALON 3). Réensemencé depuis
  // le serveur à chaque changement de la publication (régénération, sauvegarde),
  // pas pendant la frappe — la publication n'est rechargée que sur action.
  const [meta, setMeta] = useState<MetaDraft | null>(null);
  // Référence des métadonnées à partir desquelles le brouillon a été ensemencé,
  // pour ne réensemencer que lorsqu'elles changent réellement (cf. plus bas).
  const [metaSource, setMetaSource] = useState<PublicationMetadata | null>(null);

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

  // Plateformes reliées au compte : sert à activer/désactiver SoundCloud dans le
  // récap (YouTube vient du login Google, toujours relié).
  useEffect(() => {
    fetchProfile()
      .then((profile) => {
        if (profile) setConnectedPlatforms(profile.connected_platforms);
      })
      .catch(() => {});
  }, []);

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

  // Réensemence le brouillon des textes quand les métadonnées changent (motif
  // React d'ajustement d'état pendant le rendu, sans effet). La comparaison de
  // référence suffit : le serveur renvoie un nouvel objet à chaque action, et la
  // frappe ne touche pas `publication` — les éditions ne sont donc pas écrasées.
  if (publication && publication.metadata !== metaSource) {
    setMetaSource(publication.metadata);
    setMeta(draftFrom(publication.metadata));
  }

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
  const renderedFormats = new Set(videos.map((video) => video.output_format));
  // Une pochette est verrouillée si elle a servi au rendu d'une vidéo.
  const isCoverLocked = (ratio: string) =>
    ratio in RATIO_VIDEO && renderedFormats.has(RATIO_VIDEO[ratio]);
  const isRendering = publication.status === "rendering";
  // Un projet publié s'archive ; les autres se suppriment.
  const isPublished = publication.status === "published";

  // Récap de publication (JALON 3). Une plateforme déjà publiée s'affiche comme
  // faite ; SoundCloud n'est sélectionnable que si le compte est relié.
  const ytPublished = Boolean(publication.youtube_url);
  const scPublished = Boolean(publication.soundcloud_url);
  const scConnected = connectedPlatforms.includes("soundcloud");
  const willPublishYT = targets.youtube && !ytPublished;
  const willPublishSC = targets.soundcloud && !scPublished && scConnected;
  const anyTargetSelected = willPublishYT || willPublishSC;
  const allPublished = ytPublished && scPublished;
  const anyPublished = ytPublished || scPublished;

  async function handlePublish() {
    if (!publication) return;
    setBusy("publish");
    setError(null);
    const failures: string[] = [];
    try {
      // On enregistre d'abord les textes à l'écran : le backend publie les
      // textes stockés, pas ceux du brouillon. Un échec ici stoppe tout — on ne
      // publie pas sur des métadonnées incertaines.
      if (meta) {
        setPublication(
          await updateMetadata(publication.id, {
            youtube_title: meta.youtube_title,
            youtube_description: meta.youtube_description,
            youtube_tags: splitTags(meta.youtube_tags),
            soundcloud_description: meta.soundcloud_description,
            soundcloud_tags: splitTags(meta.soundcloud_tags),
          }),
        );
      }
      // Chaque plateforme est indépendante : un échec sur l'une n'empêche pas
      // l'autre. La réponse de chaque appel porte l'état à jour cumulé.
      if (willPublishYT) {
        try {
          setPublication(await publishYoutube(publication.id, privacy));
        } catch (caught) {
          failures.push(`YouTube : ${caught instanceof ApiError ? caught.message : "échec"}`);
        }
      }
      if (willPublishSC) {
        try {
          setPublication(await publishSoundcloud(publication.id, sharing));
        } catch (caught) {
          failures.push(`SoundCloud : ${caught instanceof ApiError ? caught.message : "échec"}`);
        }
      }
      if (failures.length) setError(failures.join(" · "));
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "L’enregistrement des textes a échoué — réessayez.",
      );
    } finally {
      setBusy(null);
      setConfirmingPublish(false);
    }
  }

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
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {RATIO_LABELS[cover.ratio] ?? cover.ratio}
                  </p>
                  <p className="text-xs tabular-nums opacity-60">
                    {cover.ratio} · {cover.width}×{cover.height} · appuyez pour
                    agrandir
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs">
                  <a
                    href={cover.url}
                    download
                    className="font-medium underline underline-offset-2"
                  >
                    Télécharger
                  </a>
                  {isCoverLocked(cover.ratio) ? (
                    <span
                      className="opacity-50"
                      title="Cette pochette a servi au rendu de la vidéo"
                    >
                      Utilisée
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        run("cover", () =>
                          deleteCover(publication.id, cover.ratio),
                        )
                      }
                      disabled={busy !== null}
                      className="font-medium text-red-700 disabled:opacity-40 dark:text-red-400"
                    >
                      Supprimer
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {hasCovers && (
        <a
          href={coversDownloadUrl(publication.id)}
          className={`${ACTION} mb-6 block text-center`}
        >
          Télécharger les 3 pochettes (zip)
        </a>
      )}

      {publication.cover_history.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-medium opacity-70">
            Générations précédentes
          </h2>
          <ul className="flex flex-col gap-3">
            {publication.cover_history.map((set) => (
              <li
                key={set.id}
                className="flex items-center gap-3 rounded-lg border border-current/15 p-3"
              >
                <div className="flex gap-1">
                  {[...set.covers]
                    .sort(
                      (a, b) =>
                        RATIO_ORDER.indexOf(a.ratio) -
                        RATIO_ORDER.indexOf(b.ratio),
                    )
                    .map((cover) => (
                      <button
                        key={cover.ratio}
                        type="button"
                        onClick={() => setEnlarged(cover)}
                        aria-label={`Agrandir ${RATIO_LABELS[cover.ratio] ?? cover.ratio}`}
                        className="shrink-0"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={cover.url}
                          alt={RATIO_LABELS[cover.ratio] ?? cover.ratio}
                          className="h-12 w-12 rounded object-cover"
                        />
                      </button>
                    ))}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs opacity-60">
                    {new Date(set.created_at).toLocaleString("fr-FR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </p>
                  <div className="mt-1 flex gap-3 text-xs">
                    <a
                      href={coverSetDownloadUrl(publication.id, set.id)}
                      className="font-medium underline underline-offset-2"
                    >
                      Télécharger les 3
                    </a>
                    <button
                      type="button"
                      onClick={() =>
                        run("cover", () =>
                          deleteCoverSet(publication.id, set.id),
                        )
                      }
                      disabled={busy !== null}
                      className="font-medium text-red-700 disabled:opacity-40 dark:text-red-400"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
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

          {meta && !anyPublished && (
            <section className="mt-2 flex flex-col gap-3 border-t border-current/10 pt-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-medium">Textes de publication</h3>
                <button
                  type="button"
                  onClick={() =>
                    run("metadata-gen", () =>
                      generateMetadata(publication.id),
                    )
                  }
                  disabled={busy !== null}
                  className="shrink-0 text-xs font-medium underline underline-offset-2 disabled:opacity-40"
                >
                  {busy === "metadata-gen"
                    ? "Rédaction…"
                    : publication.metadata.youtube_title
                      ? "Régénérer avec l’IA"
                      : "Rédiger avec l’IA"}
                </button>
              </div>

              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Titre YouTube</span>
                <input
                  value={meta.youtube_title}
                  onChange={(event) =>
                    setMeta({ ...meta, youtube_title: event.target.value })
                  }
                  disabled={busy !== null}
                  maxLength={200}
                  className="rounded-lg border border-current/20 bg-transparent px-3 py-2 disabled:opacity-40"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Description YouTube</span>
                <textarea
                  value={meta.youtube_description}
                  onChange={(event) =>
                    setMeta({
                      ...meta,
                      youtube_description: event.target.value,
                    })
                  }
                  disabled={busy !== null}
                  rows={5}
                  maxLength={5000}
                  className="rounded-lg border border-current/20 bg-transparent px-3 py-2 disabled:opacity-40"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Hashtags YouTube</span>
                <input
                  value={meta.youtube_tags}
                  onChange={(event) =>
                    setMeta({ ...meta, youtube_tags: event.target.value })
                  }
                  disabled={busy !== null}
                  placeholder="drill, rap français, freestyle"
                  className="rounded-lg border border-current/20 bg-transparent px-3 py-2 disabled:opacity-40"
                />
                <span className="text-xs opacity-60">
                  Séparés par des virgules, sans le caractère #.
                </span>
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Description SoundCloud</span>
                <textarea
                  value={meta.soundcloud_description}
                  onChange={(event) =>
                    setMeta({
                      ...meta,
                      soundcloud_description: event.target.value,
                    })
                  }
                  disabled={busy !== null}
                  rows={3}
                  maxLength={5000}
                  className="rounded-lg border border-current/20 bg-transparent px-3 py-2 disabled:opacity-40"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Hashtags SoundCloud</span>
                <input
                  value={meta.soundcloud_tags}
                  onChange={(event) =>
                    setMeta({ ...meta, soundcloud_tags: event.target.value })
                  }
                  disabled={busy !== null}
                  placeholder="drill, rap"
                  className="rounded-lg border border-current/20 bg-transparent px-3 py-2 disabled:opacity-40"
                />
              </label>

              <button
                type="button"
                onClick={() =>
                  run("metadata-save", () =>
                    updateMetadata(publication.id, {
                      youtube_title: meta.youtube_title,
                      youtube_description: meta.youtube_description,
                      youtube_tags: splitTags(meta.youtube_tags),
                      soundcloud_description: meta.soundcloud_description,
                      soundcloud_tags: splitTags(meta.soundcloud_tags),
                    }),
                  )
                }
                disabled={busy !== null}
                className={ACTION}
              >
                {busy === "metadata-save"
                  ? "Enregistrement…"
                  : "Enregistrer les textes"}
              </button>
              <p className="text-xs opacity-60">
                Le titre et la description YouTube servent à la publication.
              </p>
            </section>
          )}

          {anyPublished && (
            // Récap en lecture seule de ce qui a réellement été publié, par
            // plateforme effectivement mise en ligne.
            <section className="mt-2 flex flex-col gap-4 border-t border-current/10 pt-4">
              <h3 className="text-sm font-medium">Textes publiés</h3>

              {ytPublished && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-medium opacity-70">YouTube</p>
                  <div>
                    <p className="text-xs opacity-60">Titre</p>
                    <p className="mt-0.5 text-sm">
                      {publication.metadata.youtube_title || publication.title}
                    </p>
                  </div>
                  {publication.metadata.youtube_description && (
                    <div>
                      <p className="text-xs opacity-60">Description</p>
                      <p className="mt-0.5 whitespace-pre-wrap text-sm">
                        {publication.metadata.youtube_description}
                      </p>
                    </div>
                  )}
                  {publication.metadata.youtube_tags.length > 0 && (
                    <div>
                      <p className="text-xs opacity-60">Hashtags</p>
                      <p className="mt-0.5 text-sm">
                        {publication.metadata.youtube_tags
                          .map((tag) => `#${tag}`)
                          .join(" ")}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {scPublished && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-medium opacity-70">SoundCloud</p>
                  {publication.metadata.soundcloud_description && (
                    <div>
                      <p className="text-xs opacity-60">Description</p>
                      <p className="mt-0.5 whitespace-pre-wrap text-sm">
                        {publication.metadata.soundcloud_description}
                      </p>
                    </div>
                  )}
                  {publication.metadata.soundcloud_tags.length > 0 && (
                    <div>
                      <p className="text-xs opacity-60">Hashtags</p>
                      <p className="mt-0.5 text-sm">
                        {publication.metadata.soundcloud_tags
                          .map((tag) => `#${tag}`)
                          .join(" ")}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          <div className="mt-2 flex flex-col gap-4 border-t border-current/10 pt-4">
            <h3 className="text-sm font-medium">
              {allPublished ? "Publié" : "Publier"}
            </h3>

            <ul className="flex flex-col gap-3">
              {/* YouTube — toujours relié (login Google). */}
              <li className="flex flex-col gap-1.5 rounded-lg border border-current/15 p-3">
                <div className="flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    {ytPublished ? (
                      <span
                        aria-hidden
                        className="text-green-700 dark:text-green-400"
                      >
                        ✓
                      </span>
                    ) : (
                      <input
                        type="checkbox"
                        checked={targets.youtube}
                        onChange={(event) =>
                          setTargets((t) => ({
                            ...t,
                            youtube: event.target.checked,
                          }))
                        }
                        disabled={busy !== null}
                        className="h-4 w-4"
                      />
                    )}
                    YouTube
                  </label>
                  {ytPublished ? (
                    <a
                      href={publication.youtube_url ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium text-green-700 underline underline-offset-2 dark:text-green-400"
                    >
                      Voir
                    </a>
                  ) : (
                    <select
                      value={privacy}
                      onChange={(event) =>
                        setPrivacy(event.target.value as Privacy)
                      }
                      disabled={busy !== null || !targets.youtube}
                      className="rounded-lg border border-current/20 bg-transparent px-3 py-2 text-sm disabled:opacity-40"
                    >
                      {(["private", "unlisted", "public"] as Privacy[]).map(
                        (value) => (
                          <option key={value} value={value}>
                            {PRIVACY_LABELS[value]}
                          </option>
                        ),
                      )}
                    </select>
                  )}
                </div>
                {!ytPublished && (
                  <p className="text-xs opacity-60">
                    Vidéo paysage + miniature 16:9.
                  </p>
                )}
              </li>

              {/* SoundCloud — sélectionnable seulement si le compte est relié. */}
              <li className="flex flex-col gap-1.5 rounded-lg border border-current/15 p-3">
                <div className="flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    {scPublished ? (
                      <span
                        aria-hidden
                        className="text-green-700 dark:text-green-400"
                      >
                        ✓
                      </span>
                    ) : (
                      <input
                        type="checkbox"
                        checked={targets.soundcloud && scConnected}
                        onChange={(event) =>
                          setTargets((t) => ({
                            ...t,
                            soundcloud: event.target.checked,
                          }))
                        }
                        disabled={busy !== null || !scConnected}
                        className="h-4 w-4"
                      />
                    )}
                    SoundCloud
                  </label>
                  {scPublished ? (
                    <a
                      href={publication.soundcloud_url ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium text-green-700 underline underline-offset-2 dark:text-green-400"
                    >
                      Écouter
                    </a>
                  ) : scConnected ? (
                    <select
                      value={sharing}
                      onChange={(event) =>
                        setSharing(event.target.value as Sharing)
                      }
                      disabled={busy !== null || !targets.soundcloud}
                      className="rounded-lg border border-current/20 bg-transparent px-3 py-2 text-sm disabled:opacity-40"
                    >
                      {(["private", "public"] as Sharing[]).map((value) => (
                        <option key={value} value={value}>
                          {SHARING_LABELS[value]}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
                {!scPublished &&
                  (scConnected ? (
                    <p className="text-xs opacity-60">
                      Audio + artwork carré + tags.
                    </p>
                  ) : (
                    <p className="text-xs opacity-60">
                      Reliez SoundCloud dans les{" "}
                      <a href="/parametres" className="underline">
                        paramètres
                      </a>{" "}
                      pour l’activer.
                    </p>
                  ))}
              </li>
            </ul>

            {!allPublished && (
              <>
                <button
                  type="button"
                  onClick={() => setConfirmingPublish(true)}
                  disabled={busy !== null || !anyTargetSelected}
                  className="rounded-lg bg-foreground px-4 py-3 font-medium text-background disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy === "publish" ? "Publication en cours…" : "Publier →"}
                </button>
                <p className="text-xs opacity-60">
                  Les textes ci-dessus sont enregistrés puis utilisés à la
                  publication.
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

      {confirmingPublish && (
        // Récap avant d'engager la publication : la mise en ligne sur un compte
        // public n'est jamais un effet de bord d'un simple clic.
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="Confirmer la publication"
          className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-4"
        >
          <div className="flex w-full max-w-md flex-col gap-3 rounded-xl border border-current/15 bg-background p-4 shadow-lg">
            <div>
              <p className="text-sm font-medium">
                Publier «{" "}
                {meta?.youtube_title?.trim() || publication.title} » ?
              </p>
              <ul className="mt-2 flex flex-col gap-1 text-xs opacity-70">
                {willPublishYT && <li>YouTube — {PRIVACY_LABELS[privacy]}</li>}
                {willPublishSC && (
                  <li>SoundCloud — {SHARING_LABELS[sharing]}</li>
                )}
              </ul>
              <p className="mt-2 text-xs opacity-60">
                Les textes ci-dessus seront enregistrés puis utilisés.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmingPublish(false)}
                disabled={busy !== null}
                className="flex-1 rounded-lg border border-current/20 px-4 py-2.5 text-sm font-medium disabled:opacity-40"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handlePublish}
                disabled={busy !== null}
                className="flex-1 rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background disabled:opacity-60"
              >
                {busy === "publish" ? "Publication…" : "Publier"}
              </button>
            </div>
          </div>
        </div>
      )}

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
