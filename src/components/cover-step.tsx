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
  deleteImageSource,
  deletePublication,
  fetchProfile,
  fetchPublication,
  fetchRenderStatus,
  fetchStyles,
  fetchYoutubePlaylists,
  generateCover,
  generateCovers,
  generateMetadata,
  publishSoundcloud,
  publishYoutube,
  startRender,
  updateMetadata,
  updatePublication,
  uploadCover,
  type CoverFormat,
  type Privacy,
  type Publication,
  type PublicationMetadata,
  type Sharing,
  type VideoLanguage,
  type YoutubePlaylist,
} from "@/lib/api";
import { checkCoverDimensions, readImageSize } from "@/lib/image";
import { MUSIC_STYLES } from "@/lib/constants";

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

// Action secondaire pleine largeur (contour neutre). Import et génération
// partagent désormais la même boîte : plus de langage de bouton propre à
// l'import (audit reco #1, #16).
const ACTION = "btn btn-secondary btn-block";

// Lit un fichier en base64 (sans le préfixe `data:...;base64,`), pour l'envoyer
// comme image de référence dans le corps JSON de la génération.
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("lecture impossible"));
    reader.readAsDataURL(file);
  });
}

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

// Jeu d'icônes de l'écran (24×24, trait courant) — posées à côté des libellés
// d'action pour lever l'ambiguïté entre les deux chemins « créer » / « importer »
// et les régénérations (audit reco #1, #3).
type IconProps = { size?: number; className?: string };
const svgBase = (size: number, className?: string) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  className,
});
const IconSparkle = ({ size = 20, className }: IconProps) => (
  <svg {...svgBase(size, className)}>
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
    <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
  </svg>
);
const IconUpload = ({ size = 20, className }: IconProps) => (
  <svg {...svgBase(size, className)}>
    <path d="M12 20V8" />
    <path d="M7 12l5-5 5 5" />
    <path d="M4 4h16" />
  </svg>
);
const IconRefresh = ({ size = 18, className }: IconProps) => (
  <svg {...svgBase(size, className)}>
    <path d="M20 6v5h-5" />
    <path d="M19.4 11a7.5 7.5 0 1 0-2 6.4" />
  </svg>
);
const IconCheck = ({ size = 18, className }: IconProps) => (
  <svg {...svgBase(size, className)} strokeWidth={2.1}>
    <path d="M4 12.5l5.5 5.5L20 6.5" />
  </svg>
);
const IconChevron = ({ size = 18, className }: IconProps) => (
  <svg {...svgBase(size, className)} strokeWidth={1.8}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);
const IconArrow = ({ size = 18, className }: IconProps) => (
  <svg {...svgBase(size, className)} strokeWidth={1.8}>
    <path d="M4 12h15" />
    <path d="M13 6l6 6-6 6" />
  </svg>
);
const IconMore = ({ size = 18, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
    <circle cx="5" cy="12" r="1.7" />
    <circle cx="12" cy="12" r="1.7" />
    <circle cx="19" cy="12" r="1.7" />
  </svg>
);
const IconDownload = ({ size = 18, className }: IconProps) => (
  <svg {...svgBase(size, className)}>
    <path d="M12 3v12" />
    <path d="M7 11l5 5 5-5" />
    <path d="M4 20h16" />
  </svg>
);
const IconClock = ({ size = 18, className }: IconProps) => (
  <svg {...svgBase(size, className)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.5 2" />
  </svg>
);

type Busy =
  | null
  | "generation"
  | "covers"
  | "edit"
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

const LANGUAGE_LABELS: Record<VideoLanguage, string> = {
  fr: "Français",
  en: "English",
};

// Genre SoundCloud par défaut selon le style du morceau (SoundCloud n'a pas de
// liste d'API — champ texte libre, on propose une liste + une valeur de départ).
const STYLE_GENRE: Record<string, string> = {
  RAP: "Hip-hop & Rap",
  RNB: "R&B & Soul",
  DRILL: "Drill",
  AFROTRAP: "Afrobeats",
  BOUNCE: "Dancehall",
  FUNK: "Funk",
};

const SOUNDCLOUD_GENRES = [
  "Hip-hop & Rap",
  "R&B & Soul",
  "Trap",
  "Drill",
  "Afrobeats",
  "Dancehall",
  "Reggaeton",
  "Pop",
  "Electronic",
  "House",
  "Funk",
  "Soul",
  "Jazz & Blues",
  "Reggae",
  "Rock",
  "Latin",
  "World",
];

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
  // Logo « split » incrusté sur les trois pochettes. Coché par défaut ; se
  // bascule sans regénérer l'image (l'habillage ne refacture rien).
  const [addLogo, setAddLogo] = useState(true);
  // Retour visuel bref après avoir copié le prompt de génération.
  const [promptCopied, setPromptCopied] = useState(false);
  // Image de référence optionnelle (image-to-image), gardée en base64 pour la
  // prochaine génération. Persiste tant que le créateur ne la retire pas.
  const [reference, setReference] = useState<{ name: string; b64: string } | null>(null);
  // Correction des infos du morceau (titre / artiste / style) en cas de faute
  // de saisie. `editing` ouvre le formulaire inline ; les brouillons ci-dessous
  // sont initialisés à l'ouverture.
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editArtist, setEditArtist] = useState("");
  const [editStyle, setEditStyle] = useState("");
  // Styles proposés à l'édition : intégrés + personnalisés du créateur.
  const [styleOptions, setStyleOptions] = useState<string[]>([...MUSIC_STYLES]);
  const [privacy, setPrivacy] = useState<Privacy>("private");
  const [sharing, setSharing] = useState<Sharing>("private");
  // Récap de publication (JALON 3) : plateformes reliées au compte, cibles
  // cochées, et confirmation avant d'engager la publication.
  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([]);
  const [targets, setTargets] = useState({ youtube: true, soundcloud: true });
  const [confirmingPublish, setConfirmingPublish] = useState(false);
  // Échec de publication par plateforme (audit reco #15) : un échec YouTube
  // n'efface pas un succès SoundCloud, et chaque plateforme porte son propre
  // « Réessayer ».
  const [publishErrors, setPublishErrors] = useState<{
    youtube?: string;
    soundcloud?: string;
  }>({});
  // Cibles fines : playlist YouTube (chargée à la demande) et genre SoundCloud.
  const [playlists, setPlaylists] = useState<YoutubePlaylist[] | null>(null);
  const [playlistId, setPlaylistId] = useState("");
  const [language, setLanguage] = useState<VideoLanguage>("fr");
  const [genre, setGenre] = useState("");
  const [genreSeeded, setGenreSeeded] = useState(false);
  const [enlarged, setEnlarged] = useState<CoverFormat | null>(null);
  // Panneau « Ajuster la génération » : direction créative, sources et image de
  // référence. Replié par défaut pour ne pas rouvrir le formulaire de génération
  // sous les résultats (audit reco #11).
  const [adjusting, setAdjusting] = useState(false);
  // Chemin choisi à l'étape image (écran vierge) : générer ou importer. Tant
  // qu'aucun n'est choisi, seuls les deux boutons s'affichent ; le clic ne
  // révèle que les contrôles du chemin retenu.
  const [imageMode, setImageMode] = useState<"create" | "import" | null>(null);
  // Bascule de chemin demandée depuis l'écran de validation (après ≥ 1 source) :
  // déclenche la confirmation « tout sera perdu » avant de repartir de zéro.
  const [pendingSwitch, setPendingSwitch] = useState<"create" | "import" | null>(
    null,
  );
  // Format de pochette en attente de confirmation de suppression : la
  // suppression est destructrice et sort de la ligne d'actions (audit reco #4).
  const [pendingCoverDelete, setPendingCoverDelete] = useState<string | null>(
    null,
  );
  // Étape 4 : une fois les vidéos rendues (étape 3), le créateur passe
  // explicitement à la publication via « Continuer vers la publication ». Tant
  // que ce n'est pas fait, on reste sur l'écran « vidéos prêtes » (étape 3).
  const [showPublication, setShowPublication] = useState(false);
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
    fetchStyles()
      .then((styles) => setStyleOptions([...styles.builtin, ...styles.custom.map((s) => s.name)]))
      .catch(() => {});
  }, []);

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

  // Playlists YouTube : chargées une seule fois, quand la publication YouTube est
  // possible (vidéos prêtes, compte relié, pas encore publié). En cas d'échec
  // (scope écriture pas encore accordé, etc.), on tombe sur une liste vide.
  useEffect(() => {
    if (playlists !== null || !publication) return;
    const canPublishYT =
      publication.videos.length > 0 &&
      publication.status !== "rendering" &&
      !publication.youtube_url &&
      connectedPlatforms.includes("youtube");
    if (!canPublishYT) return;
    fetchYoutubePlaylists(publication.id)
      .then(setPlaylists)
      .catch(() => setPlaylists([]));
  }, [publication, connectedPlatforms, playlists]);

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

  // Genre SoundCloud pré-rempli depuis le style, une seule fois (ajustement en
  // rendu, pas d'effet — évite une désync d'hydratation).
  if (publication && !genreSeeded) {
    setGenreSeeded(true);
    setGenre(STYLE_GENRE[publication.style] ?? publication.style);
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

  async function pickReference(file: File) {
    setError(null);
    // Garde-fou de taille : la référence est de toute façon réduite côté serveur.
    if (file.size > 15 * 1024 * 1024) {
      setError("Image de référence trop lourde — 15 Mo maximum.");
      return;
    }
    try {
      setReference({ name: file.name, b64: await fileToBase64(file) });
    } catch {
      setError("Image de référence illisible — utilisez un png, un jpg ou un webp.");
    }
  }

  // Lance (ou relance) la génération de l'image source avec le prompt, les
  // sources et la référence courants. Le seul point qui consomme une génération.
  async function generateImage() {
    if (!publication) return;
    setBusy("generation");
    setError(null);
    try {
      setPublication(
        await generateCover(publication.id, {
          prompt,
          useTitle,
          useStyle,
          referenceB64: reference?.b64,
        }),
      );
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

  // Validation d'un fichier de pochette importé (format + dimension) avant
  // l'envoi : trop petit, il donnerait des variantes floues une fois rogné.
  async function handleCoverFile(file: File | undefined) {
    if (!file || !publication) return;
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
    setBusy("upload");
    try {
      setPublication(await uploadCover(publication.id, file));
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "L’envoi a échoué — réessayez.",
      );
    } finally {
      setBusy(null);
    }
  }

  // Confirme la bascule de chemin (générer ↔ importer) : la source courante est
  // réellement supprimée côté serveur (endpoint DELETE), puis on revient au
  // choix initial dans le mode demandé. La suppression suffit à réafficher le
  // choix (plus de `image_source` → showChoiceStep).
  async function confirmSwitch() {
    if (!pendingSwitch || !publication) return;
    const target = pendingSwitch;
    setPendingSwitch(null);
    setBusy("cover");
    setError(null);
    try {
      setPublication(await deleteImageSource(publication.id));
      setImageMode(target);
      setAdjusting(false);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "La suppression a échoué — réessayez.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function copyPrompt() {
    if (!publication?.image_prompt) return;
    try {
      await navigator.clipboard.writeText(publication.image_prompt);
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 1500);
    } catch {
      setError("Copie impossible — copiez le texte à la main.");
    }
  }

  function openEdit() {
    if (!publication) return;
    setEditTitle(publication.title);
    setEditArtist(publication.artist_name);
    setEditStyle(publication.style);
    setError(null);
    setEditing(true);
  }

  async function saveEdit() {
    if (!publication) return;
    const title = editTitle.trim();
    const artist = editArtist.trim();
    if (!title || !artist) {
      setError("Le titre et le nom d’artiste ne peuvent pas être vides.");
      return;
    }
    const patch: { title?: string; artist_name?: string; style?: string } = {};
    if (title !== publication.title) patch.title = title;
    if (artist !== publication.artist_name) patch.artist_name = artist;
    if (editStyle !== publication.style) patch.style = editStyle;
    // Rien n'a changé : on ferme sans appeler le serveur.
    if (Object.keys(patch).length === 0) {
      setEditing(false);
      return;
    }
    setBusy("edit");
    setError(null);
    try {
      setPublication(await updatePublication(publication.id, patch));
      setEditing(false);
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
  // Image source paysage générée, en attente d'habillage. Présente dès la
  // génération ; c'est l'étape où le créateur valide avant « Générer pochettes ».
  const hasSource = !!publication.image_source;
  // La source vient d'une génération (prompt présent) ou d'un import (prompt nul).
  const sourceFromGeneration = hasSource && !!publication.image_prompt;
  // Écran de validation de la source vs choix initial Créer/Importer. Une source
  // « écartée » (bascule de chemin confirmée) renvoie au choix initial.
  const showSourceStep = !hasCovers && hasSource;
  const showChoiceStep = !hasCovers && !hasSource;
  // Le titre et l'artiste sont incrustés dans les pochettes : on ne les édite
  // que tant que ces pochettes restent régénérables. Une vidéo rendue (ou en
  // cours), ou un projet publié, les fige — le titre n'est alors plus modifiable.
  const coversFrozen =
    publication.status === "published" ||
    publication.status === "rendering" ||
    publication.videos.length > 0;

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

  // Étape 4 (Post) : atteinte quand les vidéos sont prêtes ET que le créateur a
  // choisi de passer à la publication (ou qu'une plateforme est déjà publiée).
  // Sinon, vidéos prêtes = fin de l'étape 3 (Vidéo).
  const atPublication =
    hasVideos && !isRendering && (showPublication || anyPublished);
  // Étape courante du parcours réel à quatre attentes (audit reco #6) : la même
  // barre nommée, ici pilotée par l'état de la publication.
  const currentStep = atPublication ? 4 : isRendering || hasVideos ? 3 : 2;
  const STEPS = ["Audio", "Image", "Vidéo", "Post"];

  // La galerie de pochettes « à vérifier » n'appartient qu'à l'étape 2 (Image).
  // Dès le rendu (étape 3) et la publication (étape 4), on ne réaffiche plus les
  // pochettes : la vidéo puis les textes prennent le relais.
  const showCoversGallery = hasCovers && !isRendering && !hasVideos;

  async function handlePublish() {
    if (!publication) return;
    setBusy("publish");
    setError(null);
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
      // l'autre, et l'échec s'affiche sur la ligne concernée (pas en message
      // global), avec son propre « Réessayer » (audit reco #15).
      if (willPublishYT) await publishTo("youtube");
      if (willPublishSC) await publishTo("soundcloud");
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

  // Publie sur une seule plateforme et note son résultat. Réutilisé par l'envoi
  // groupé et par le « Réessayer » d'une plateforme en échec (audit reco #15).
  async function publishTo(which: "youtube" | "soundcloud") {
    if (!publication) return;
    try {
      if (which === "youtube") {
        setPublication(
          await publishYoutube(publication.id, privacy, playlistId, language),
        );
      } else {
        setPublication(await publishSoundcloud(publication.id, sharing, genre));
      }
      setPublishErrors((current) => ({ ...current, [which]: undefined }));
    } catch (caught) {
      setPublishErrors((current) => ({
        ...current,
        [which]: caught instanceof ApiError ? caught.message : "échec",
      }));
    }
  }

  // « Réessayer » d'une plateforme : gère seul l'état occupé (hors envoi groupé).
  async function retryPublish(which: "youtube" | "soundcloud") {
    setBusy("publish");
    setError(null);
    try {
      await publishTo(which);
    } finally {
      setBusy(null);
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

  // Image de référence (image-to-image) : guide la génération sans apparaître
  // telle quelle. Réutilisée aux différents points de génération.
  const referenceField = (
    <div className="flex flex-col gap-1 text-sm">
      <span className="font-medium">Image de référence (optionnel)</span>
      {reference ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-current/20 px-3 py-2">
          <span className="min-w-0 truncate text-xs opacity-70">{reference.name}</span>
          <button
            type="button"
            onClick={() => setReference(null)}
            disabled={busy !== null}
            className="shrink-0 text-xs font-medium text-[color:var(--danger-ink)] disabled:opacity-40"
          >
            Retirer
          </button>
        </div>
      ) : (
        <label
          aria-disabled={busy !== null}
          className={`${ACTION} ${
            busy !== null ? "cursor-not-allowed opacity-40" : "cursor-pointer"
          }`}
        >
          Choisir une image de référence
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            disabled={busy !== null}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) pickReference(file);
            }}
          />
        </label>
      )}
      <span className="text-xs opacity-60">
        Guide la génération (composition, palette). L’image n’apparaît pas telle
        quelle.
      </span>
    </div>
  );

  // Case du logo, réutilisée à la validation et lors d'un ré-habillage : cocher
  // ou décocher n'appelle que l'habillage (Pillow), jamais le modèle.
  const logoToggle = (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={addLogo}
        onChange={(event) => setAddLogo(event.target.checked)}
        disabled={busy !== null}
        className="h-4 w-4"
      />
      Incruster le logo sur les pochettes
    </label>
  );

  // La contrainte de fichier reste affichée en permanence, attachée au bouton
  // d'import dans tous les états — plus rien ne la fait disparaître (audit #2).
  const coverConstraint = (
    <p className="text-xs leading-snug opacity-60">
      png, jpg ou webp · au moins 1080×1080 px pour les trois formats.
    </p>
  );

  // Bouton d'import présentationnel : import et génération partagent la même
  // boîte (parité stricte, audit #1). La validation format/dimension est
  // déléguée à `handleCoverFile`.
  const importButton = (label: string, extra = "") => (
    <label className={`btn btn-secondary cursor-pointer ${extra}`}>
      {busy === "upload" ? (
        "Envoi…"
      ) : (
        <>
          <IconUpload size={20} className="text-[color:var(--accent-ink)]" />
          {label}
        </>
      )}
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        disabled={busy !== null}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          handleCoverFile(file);
        }}
      />
    </label>
  );

  // Prompt ayant produit l'image, replié dans « Ajuster » (audit — le prompt
  // n'est plus le contenu principal). Nul si l'image vient d'un import.
  const promptBox = publication.image_prompt ? (
    <div className="rounded-lg border border-current/15 bg-current/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium opacity-60">Prompt de génération</p>
        <button
          type="button"
          onClick={copyPrompt}
          aria-label="Copier le prompt de génération"
          className="flex shrink-0 items-center gap-1 text-xs font-medium opacity-70 hover:opacity-100"
        >
          {promptCopied ? (
            "Copié ✓"
          ) : (
            <>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copier
            </>
          )}
        </button>
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm">{publication.image_prompt}</p>
    </div>
  ) : null;

  // Panneau « Ajuster la génération » — direction créative, sources prises en
  // compte et image de référence. Replié par défaut : après une génération, la
  // décision courante passe avant le formulaire (audit reco #11, #17). La
  // référence est remontée en tête, c'est le levier le plus efficace.
  const adjustPanel = (
    <div className="border-y border-current/10">
      <button
        type="button"
        onClick={() => setAdjusting((open) => !open)}
        aria-expanded={adjusting}
        disabled={busy !== null}
        className="flex w-full items-center gap-2 py-3 text-left disabled:opacity-40"
      >
        <IconChevron
          size={18}
          className={`text-[color:var(--accent-ink)] transition-transform ${
            adjusting ? "rotate-180" : ""
          }`}
        />
        <span className="flex-1">
          <span className="text-sm font-medium">Ajuster la génération</span>
          <span className="block text-xs opacity-60">
            Direction créative · image de référence · ce qui est pris en compte
          </span>
        </span>
      </button>
      {adjusting && (
        <div className="flex flex-col gap-4 pb-4">
          {referenceField}
          {promptField}
          {promptSources}
          {promptBox}
        </div>
      )}
    </div>
  );

  return (
    <main className="mx-auto w-full max-w-md flex-1 p-6">
      <header className="mb-8">
        {editing ? (
          <div className="flex flex-col gap-3 rounded-lg border border-current/15 p-4">
            <p className="text-sm font-medium">Corriger les infos du morceau</p>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Titre</span>
              <input
                value={editTitle}
                onChange={(event) => setEditTitle(event.target.value)}
                maxLength={120}
                disabled={busy !== null}
                className="rounded-lg border border-current/20 bg-transparent px-3 py-2 disabled:opacity-40"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Nom d’artiste</span>
              <input
                value={editArtist}
                onChange={(event) => setEditArtist(event.target.value)}
                maxLength={120}
                disabled={busy !== null}
                className="rounded-lg border border-current/20 bg-transparent px-3 py-2 disabled:opacity-40"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Style</span>
              <select
                value={editStyle}
                onChange={(event) => setEditStyle(event.target.value)}
                disabled={busy !== null}
                className="rounded-lg border border-current/20 bg-transparent px-3 py-2 disabled:opacity-40"
              >
                {(styleOptions.includes(editStyle)
                  ? styleOptions
                  : [editStyle, ...styleOptions]
                ).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            {hasCovers && (
              <p className="text-xs opacity-60">
                Après un changement de titre ou de style, régénérez les pochettes
                et les textes pour qu’ils suivent.
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={saveEdit}
                disabled={busy !== null}
                className="btn btn-primary"
              >
                {busy === "edit" ? "Enregistrement…" : "Enregistrer"}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={busy !== null}
                className="btn btn-secondary"
              >
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Barre à 4 étapes nommées, la même partout (audit reco #6). */}
            <ol className="flex gap-1.5" aria-label={`Étape ${currentStep} sur 4`}>
              {STEPS.map((name, index) => {
                const step = index + 1;
                const state =
                  step < currentStep
                    ? "done"
                    : step === currentStep
                      ? "current"
                      : "todo";
                return (
                  <li key={name} className="flex-1">
                    <div
                      className={`h-1 rounded-full ${
                        state === "current"
                          ? "bg-[color:var(--accent)]"
                          : state === "done"
                            ? "bg-[color:var(--accent)]/40"
                            : "bg-current/15"
                      }`}
                    />
                    <span
                      className={`mt-1.5 block text-[10px] font-medium uppercase tracking-wide ${
                        state === "current"
                          ? "text-[color:var(--accent-ink)]"
                          : "opacity-50"
                      }`}
                      aria-current={state === "current" ? "step" : undefined}
                    >
                      {step} {name}
                    </span>
                  </li>
                );
              })}
            </ol>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold">{publication.title}</h1>
                <p className="mt-1 text-sm opacity-60">
                  {publication.artist_name} · {publication.style}
                </p>
              </div>
              {!coversFrozen && (
                <button
                  type="button"
                  onClick={openEdit}
                  className="btn btn-ghost shrink-0 text-sm"
                >
                  Modifier
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {showChoiceStep && (
        <div className="mb-6 flex flex-col gap-5">
          <p className="text-sm leading-relaxed opacity-80">
            Deux façons de faire. Dans les deux cas, vous validez l’image avant
            qu’elle ne soit déclinée et habillée dans les trois formats.
          </p>

          {/* Deux chemins à parité qui basculent le contenu : seuls les
              contrôles du chemin choisi restent affichés (audit #1). */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setImageMode("create")}
                aria-pressed={imageMode === "create"}
                className={`btn min-h-[80px] flex-col ${
                  imageMode === "create" ? "btn-primary" : "btn-secondary"
                }`}
              >
                <IconSparkle
                  size={22}
                  className={
                    imageMode === "create"
                      ? undefined
                      : "text-[color:var(--accent-ink)]"
                  }
                />
                Créer l’image
              </button>
              <p className="text-xs leading-snug opacity-60">
                L’IA compose d’après votre titre et votre style. Environ 30 s.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setImageMode("import")}
                aria-pressed={imageMode === "import"}
                className={`btn min-h-[80px] flex-col ${
                  imageMode === "import" ? "btn-primary" : "btn-secondary"
                }`}
              >
                <IconUpload
                  size={22}
                  className={
                    imageMode === "import"
                      ? undefined
                      : "text-[color:var(--accent-ink)]"
                  }
                />
                Importer mon image
              </button>
              <p className="text-xs leading-snug opacity-60">
                png, jpg ou webp · au moins 1080×1080 px.
              </p>
            </div>
          </div>

          {/* Chemin « générer » : uniquement les réglages de génération. */}
          {imageMode === "create" && (
            <div className="flex flex-col gap-4 border-t border-current/10 pt-4">
              {referenceField}
              {promptField}
              {promptSources}
              <button
                type="button"
                onClick={generateImage}
                disabled={busy !== null}
                className="btn btn-primary btn-block"
              >
                <IconSparkle size={18} />
                {busy === "generation" ? "Création…" : "Lancer la génération"}
              </button>
            </div>
          )}

          {/* Chemin « importer » : uniquement le choix de fichier. */}
          {imageMode === "import" && (
            <div className="flex flex-col gap-3 border-t border-current/10 pt-4">
              {coverConstraint}
              {importButton("Choisir un fichier", "btn-block min-h-[52px]")}
            </div>
          )}
        </div>
      )}

      {showSourceStep && (
        // Un seul état à l'écran : la source à valider, puis les décisions.
        // La disposition change selon l'origine de la source (générée / importée).
        <div className="mb-6 flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold">
              {sourceFromGeneration
                ? "Image prête — à vérifier"
                : "Image importée — à vérifier"}
            </h2>
            {sourceFromGeneration && (
              <span className="shrink-0 text-xs tabular-nums opacity-60">
                Essai n° {publication.image_generations}
              </span>
            )}
          </div>

          {/* Aperçu de la source — image distante signée, courte durée. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={publication.image_source!}
            alt="Image à valider, avant habillage"
            className="w-full rounded-lg border border-current/10"
          />

          {/* Télécharger cette image (icône, juste sous l'aperçu). */}
          <a
            href={publication.image_source!}
            download
            aria-label="Télécharger cette image"
            title="Télécharger cette image"
            className="btn btn-secondary btn-icon self-start"
          >
            <IconDownload size={18} />
          </a>

          {sourceFromGeneration ? (
            // Chemin génération : Ajuster · Nouvel essai · logo · Valider · Importer.
            <>
              {adjustPanel}
              <button
                type="button"
                onClick={generateImage}
                disabled={busy !== null}
                className="btn btn-secondary btn-block"
              >
                <IconRefresh
                  size={17}
                  className="text-[color:var(--accent-ink)]"
                />
                {busy === "generation" ? "Essai…" : "Nouvel essai"}
              </button>
              {logoToggle}
              <button
                type="button"
                onClick={() =>
                  run("covers", () =>
                    generateCovers(publication.id, { addLogo }),
                  )
                }
                disabled={busy !== null}
                className="btn btn-primary btn-block"
              >
                <IconCheck size={18} />
                {busy === "covers"
                  ? "Habillage…"
                  : "Valider et habiller les 3 formats"}
              </button>
              {/* Basculer vers l'import : confirmation « tout sera perdu ». */}
              <button
                type="button"
                onClick={() => setPendingSwitch("import")}
                disabled={busy !== null}
                className="btn btn-secondary btn-block"
              >
                <IconUpload
                  size={17}
                  className="text-[color:var(--accent-ink)]"
                />
                Importer une image
              </button>
            </>
          ) : (
            // Chemin import : contrôles de génération masqués, sauf « Créer ».
            <>
              <p className="-mt-1 text-xs opacity-60">
                Elle sera rognée dans les trois formats, avec le titre, le nom
                d’artiste et (au choix) le logo incrustés.
              </p>
              {logoToggle}
              <button
                type="button"
                onClick={() =>
                  run("covers", () =>
                    generateCovers(publication.id, { addLogo }),
                  )
                }
                disabled={busy !== null}
                className="btn btn-primary btn-block"
              >
                <IconCheck size={18} />
                {busy === "covers"
                  ? "Habillage…"
                  : "Valider et habiller les 3 formats"}
              </button>
              {/* Basculer vers la génération : confirmation « image supprimée ». */}
              <button
                type="button"
                onClick={() => setPendingSwitch("create")}
                disabled={busy !== null}
                className="btn btn-secondary btn-block"
              >
                <IconSparkle
                  size={17}
                  className="text-[color:var(--accent-ink)]"
                />
                Créer une image
              </button>
            </>
          )}
        </div>
      )}

      {/* Confirmation de bascule de chemin (générer ↔ importer) : la source
          courante est écartée et on repart du choix initial. */}
      {pendingSwitch && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="Confirmer le changement de méthode"
          onClick={() => busy === null && setPendingSwitch(null)}
          className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-4"
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="flex w-full max-w-md flex-col gap-3 rounded-xl border border-current/15 bg-background p-4 shadow-lg"
          >
            <p className="text-sm font-medium">
              {pendingSwitch === "import"
                ? "Importer une image ?"
                : "Créer une image ?"}
            </p>
            <p className="text-xs opacity-70">
              {pendingSwitch === "import"
                ? "L’image générée et vos réglages seront perdus."
                : "L’image importée sera supprimée."}{" "}
              Vous repartirez du choix de départ.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPendingSwitch(null)}
                disabled={busy !== null}
                className="btn btn-secondary flex-1"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmSwitch}
                disabled={busy !== null}
                className="btn btn-danger flex-1"
              >
                Continuer
              </button>
            </div>
          </div>
        </div>
      )}

      {showCoversGallery && (
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">Vos pochettes — à vérifier</h2>
          <span className="shrink-0 text-xs tabular-nums opacity-60">
            Essai n° {publication.image_generations}
          </span>
        </div>
      )}

      {showCoversGallery && (
        // Empilement vertical : sur téléphone, un défilement horizontal
        // cachait les visuels suivants. L'agrandissement se fait par l'icône
        // sur l'aperçu — plus de ligne « appuyez pour agrandir » répétée.
        <ul className="mb-6 flex flex-col gap-4">
          {covers.map((cover) => (
            <li key={cover.ratio} className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setEnlarged(cover)}
                aria-label={`Agrandir ${RATIO_LABELS[cover.ratio] ?? cover.ratio}`}
                className="relative flex items-center justify-center rounded-lg border border-current/15 bg-current/5 p-2"
              >
                {/* Image distante signée et de durée courte : le pipeline
                    d'optimisation de Next n'apporterait rien ici. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cover.url}
                  alt={`Aperçu ${RATIO_LABELS[cover.ratio] ?? cover.ratio}`}
                  className="max-h-80 w-auto rounded"
                />
                <span
                  aria-hidden
                  className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-md bg-black/55 text-white backdrop-blur"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 3h6v6" />
                    <path d="M9 21H3v-6" />
                    <path d="M21 3l-7 7" />
                    <path d="M3 21l7-7" />
                  </svg>
                </span>
              </button>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {RATIO_LABELS[cover.ratio] ?? cover.ratio}
                  </p>
                  <p className="text-xs tabular-nums opacity-60">
                    {cover.ratio} · {cover.width}×{cover.height}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <a
                    href={cover.url}
                    download
                    aria-label={`Télécharger ${RATIO_LABELS[cover.ratio] ?? cover.ratio}`}
                    className="btn btn-secondary btn-icon"
                  >
                    <IconDownload size={17} />
                  </a>
                  {isCoverLocked(cover.ratio) ? (
                    <span
                      className="px-2 text-xs opacity-50"
                      title="Cette pochette a servi au rendu de la vidéo"
                    >
                      Utilisée
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPendingCoverDelete(cover.ratio)}
                      disabled={busy !== null}
                      aria-label={`Autres actions — ${RATIO_LABELS[cover.ratio] ?? cover.ratio}`}
                      className="btn btn-ghost btn-icon text-[color:var(--foreground)]"
                    >
                      <IconMore size={18} />
                    </button>
                  )}
                </div>
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

      {/* Confirmation de suppression d'un format (audit reco #4) : action
          destructrice sortie de la ligne d'actions et toujours confirmée. */}
      {pendingCoverDelete && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="Confirmer la suppression du format"
          onClick={() => setPendingCoverDelete(null)}
          className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-4"
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="flex w-full max-w-md flex-col gap-3 rounded-xl border border-current/15 bg-background p-4 shadow-lg"
          >
            <p className="text-sm font-medium">
              Supprimer «{" "}
              {RATIO_LABELS[pendingCoverDelete] ?? pendingCoverDelete} » ?
            </p>
            <p className="text-xs opacity-70">
              Ce format sera exclu de la diffusion. Vous pourrez le régénérer
              tant que la vidéo n’est pas rendue.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPendingCoverDelete(null)}
                disabled={busy !== null}
                className="btn btn-secondary flex-1"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => {
                  const ratio = pendingCoverDelete;
                  setPendingCoverDelete(null);
                  run("cover", () => deleteCover(publication.id, ratio));
                }}
                disabled={busy !== null}
                className="btn btn-danger flex-1"
              >
                Supprimer
              </button>
            </div>
          </div>
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
        atPublication ? (
        // ── ÉTAPE 4 (Post) : uniquement les textes de publication. Les vidéos
        //    ne sont plus affichées ici ; on y arrive par « Continuer vers la
        //    publication » depuis l'étape 3, et on peut y revenir.
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold">
                {allPublished ? "Morceau en ligne" : "Publier votre morceau"}
              </h2>
              {anyPublished && (
                <span className="badge-success shrink-0">
                  <IconCheck size={13} />
                  {allPublished ? "Publié" : "En ligne"}
                </span>
              )}
            </div>
            <p className="text-sm opacity-60">
              {anyPublished
                ? "Retrouvez les liens de diffusion dans « Publier »."
                : "Vérifiez les textes, choisissez les plateformes, puis publiez."}
            </p>
            {!anyPublished && (
              <button
                type="button"
                onClick={() => setShowPublication(false)}
                className="btn btn-ghost self-start text-sm"
              >
                ← Revenir aux vidéos
              </button>
            )}
          </div>

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
                  className="btn btn-ghost shrink-0 text-xs"
                >
                  <IconSparkle size={14} />
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
                      <IconCheck
                        size={16}
                        className="text-[color:var(--success-ink)]"
                      />
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
                      className="text-sm font-medium text-[color:var(--success-ink)] underline underline-offset-2"
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
                {!ytPublished && publishErrors.youtube && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-[color:var(--danger-ink)]">
                      Échec : {publishErrors.youtube}
                    </span>
                    <button
                      type="button"
                      onClick={() => retryPublish("youtube")}
                      disabled={busy !== null}
                      className="btn btn-ghost text-xs"
                    >
                      Réessayer
                    </button>
                  </div>
                )}
                {!ytPublished && (
                  <label className="flex items-center justify-between gap-3 text-sm">
                    <span>Langue</span>
                    <select
                      value={language}
                      onChange={(event) =>
                        setLanguage(event.target.value as VideoLanguage)
                      }
                      disabled={busy !== null || !targets.youtube}
                      className="rounded-lg border border-current/20 bg-transparent px-3 py-2 text-sm disabled:opacity-40"
                    >
                      {(["fr", "en"] as VideoLanguage[]).map((value) => (
                        <option key={value} value={value}>
                          {LANGUAGE_LABELS[value]}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {!ytPublished && playlists && playlists.length > 0 && (
                  <label className="flex items-center justify-between gap-3 text-sm">
                    <span>Playlist</span>
                    <select
                      value={playlistId}
                      onChange={(event) => setPlaylistId(event.target.value)}
                      disabled={busy !== null || !targets.youtube}
                      className="max-w-[60%] rounded-lg border border-current/20 bg-transparent px-3 py-2 text-sm disabled:opacity-40"
                    >
                      <option value="">Aucune</option>
                      {playlists.map((list) => (
                        <option key={list.id} value={list.id}>
                          {list.title}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
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
                      <IconCheck
                        size={16}
                        className="text-[color:var(--success-ink)]"
                      />
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
                      className="text-sm font-medium text-[color:var(--success-ink)] underline underline-offset-2"
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
                {!scPublished && publishErrors.soundcloud && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-[color:var(--danger-ink)]">
                      Échec : {publishErrors.soundcloud}
                    </span>
                    <button
                      type="button"
                      onClick={() => retryPublish("soundcloud")}
                      disabled={busy !== null || !scConnected}
                      className="btn btn-ghost text-xs"
                    >
                      Réessayer
                    </button>
                  </div>
                )}
                {!scPublished && scConnected && (
                  <label className="flex items-center justify-between gap-3 text-sm">
                    <span>Genre</span>
                    <input
                      list="sc-genres"
                      value={genre}
                      onChange={(event) => setGenre(event.target.value)}
                      disabled={busy !== null || !targets.soundcloud}
                      className="max-w-[60%] rounded-lg border border-current/20 bg-transparent px-3 py-2 text-sm disabled:opacity-40"
                    />
                    <datalist id="sc-genres">
                      {SOUNDCLOUD_GENRES.map((value) => (
                        <option key={value} value={value} />
                      ))}
                    </datalist>
                  </label>
                )}
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
                  className="btn btn-primary btn-block"
                >
                  {busy === "publish" ? "Publication en cours…" : "Publier →"}
                </button>
                {/* Programmation différée (roadmap V1.1) : bouton présent mais
                    inactif, pour annoncer la fonction sans la promettre. */}
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  title="Programmation différée — bientôt disponible"
                  className="btn btn-secondary btn-block"
                >
                  <IconClock size={17} />
                  Programmer
                  <span className="rounded-full bg-current/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                    Bientôt
                  </span>
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
        // ── ÉTAPE 3 (Vidéo) : les vidéos rendues, sans les pochettes. On passe
        //    ensuite explicitement à la publication (étape 4).
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">Vos vidéos sont prêtes</h2>
            <p className="text-sm opacity-60">
              Regardez chaque format, téléchargez-le si besoin, puis passez à la
              publication.
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
              <a href={video.url} download className={ACTION}>
                <IconDownload size={17} />
                Télécharger cette vidéo
              </a>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setShowPublication(true)}
            className="btn btn-primary btn-block"
          >
            Continuer vers la publication
            <IconArrow size={18} />
          </button>
          <p className="text-center text-xs opacity-60">
            Rien n’est publié à cette étape.
          </p>
        </section>
        )
      ) : isRendering ? (
        <div className="flex flex-col gap-3 rounded-lg border border-current/15 p-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium">
              Rendu des vidéos… format {Math.min(renderDone + 1, renderTotal)} sur{" "}
              {renderTotal}
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
              className="h-full bg-[color:var(--accent)] transition-[width] duration-500"
              style={{ width: `${(renderDone / renderTotal) * 100}%` }}
            />
          </div>
          <p className="text-xs opacity-60">
            Chaque format prend une à deux minutes. Vous pouvez fermer cette
            page : vous retrouverez la publication sur l’accueil, à « À
            reprendre ».
          </p>
        </div>
      ) : hasCovers ? (
        // Après habillage : quatre décisions, pas onze contrôles (audit #11).
        // La génération est repliée dans « Ajuster ».
        <div className="flex flex-col gap-3">
          {/* Décision primaire — une seule, en tête. */}
          <button
            type="button"
            onClick={() => run("render", () => startRender(publication.id))}
            disabled={busy !== null}
            className="btn btn-primary btn-block"
          >
            {busy === "render" ? "Lancement…" : "Continuer vers la vidéo"}
            <IconArrow size={18} />
          </button>
          <p className="text-center text-xs opacity-60">
            Lance les 2 vidéos. Rien n’est publié à cette étape.
          </p>

          {publication.cover_history.length > 0 && (
            <section className="mt-1">
              <h2 className="mb-2 text-sm font-medium opacity-70">
                Essais précédents — accessibles à tout moment
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
                          className="font-medium text-[color:var(--danger-ink)] disabled:opacity-40"
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

          {/* Deux replis à parité : nouvel essai (consomme) / importer. */}
          <div className="mt-1 grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={generateImage}
                disabled={busy !== null}
                className="btn btn-secondary btn-block"
              >
                <IconRefresh size={17} className="text-[color:var(--accent-ink)]" />
                {busy === "generation" ? "Essai…" : "Nouvel essai"}
              </button>
              <p className="text-xs leading-snug opacity-60">
                Consomme une génération.
              </p>
            </div>
            <div className="flex flex-col gap-1">
              {importButton("Importer", "btn-block")}
              {coverConstraint}
            </div>
          </div>

          {/* Actions gratuites / tertiaires. */}
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            {hasSource && (
              <button
                type="button"
                onClick={() =>
                  run("covers", () => generateCovers(publication.id, { addLogo }))
                }
                disabled={busy !== null}
                className="btn btn-ghost text-sm"
              >
                <IconRefresh size={16} />
                {busy === "covers"
                  ? "Habillage…"
                  : "Refaire l’habillage — gratuit"}
              </button>
            )}
            <a
              href={coversDownloadUrl(publication.id)}
              className="btn btn-ghost text-sm"
            >
              <IconDownload size={16} />
              {hasSource
                ? "Tout télécharger (source + 3, .zip)"
                : "Tout télécharger (.zip)"}
            </a>
          </div>
          {hasSource && <div className="text-sm">{logoToggle}</div>}

          {adjustPanel}
        </div>
      ) : null}

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
            className="text-sm font-medium text-[color:var(--danger-ink)] disabled:opacity-40"
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
                className="btn btn-secondary flex-1"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handlePublish}
                disabled={busy !== null}
                className="btn btn-primary flex-1"
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
                className="btn btn-secondary flex-1"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={working}
                className={
                  pendingAction === "delete"
                    ? "btn btn-danger flex-1"
                    : "btn btn-primary flex-1"
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
