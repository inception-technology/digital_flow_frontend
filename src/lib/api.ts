/**
 * Client de l'API.
 *
 * L'authentification repose sur un cookie HttpOnly posé par le backend : le
 * front ne détient aucun jeton, d'où le `credentials: "include"` systématique.
 */

// Par défaut, origine relative : le front appelle `/api/...` sur son propre
// domaine, et un rewrite Next (voir next.config.ts) proxifie vers le backend.
// Le cookie de session reste ainsi first-party — condition du login mobile.
// `NEXT_PUBLIC_API_URL` reste une échappatoire (appel direct au backend).
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export type Profile = {
  id: string;
  email: string;
  display_name: string;
  artist_name: string | null;
  avatar_url: string | null;
  connected_platforms: string[];
};

export type AudioUpload = {
  key: string;
  url: string;
  duration_s: number;
  size_bytes: number;
  content_type: string;
};

export type CoverFormat = {
  ratio: string;
  url: string;
  width: number;
  height: number;
};

export type VideoFormat = {
  output_format: string;
  url: string;
};

/** Un jeu de pochettes d'une génération précédente (historique). */
export type CoverSet = {
  id: string;
  created_at: string;
  covers: CoverFormat[];
};

/**
 * Textes rédigés par l'agent Claude, éditables au JALON 3. Champs nuls tant que
 * l'agent n'a pas tourné (les hashtags sont alors des tableaux vides).
 */
export type PublicationMetadata = {
  youtube_title: string | null;
  youtube_description: string | null;
  youtube_tags: string[];
  soundcloud_description: string | null;
  soundcloud_tags: string[];
};

export type Publication = {
  id: string;
  title: string;
  artist_name: string;
  style: string;
  audio_duration_s: number;
  status: string;
  image_generations: number;
  remaining_generations: number;
  covers: CoverFormat[];
  image_prompt: string | null;
  cover_history: CoverSet[];
  videos: VideoFormat[];
  render_error: string | null;
  archived: boolean;
  youtube_url: string | null;
  soundcloud_url: string | null;
  metadata: PublicationMetadata;
};

export type Privacy = "private" | "unlisted" | "public";
/** Visibilité d'un morceau SoundCloud (l'API n'a pas de « non répertorié »). */
export type Sharing = "private" | "public";

/** Ligne de la liste des publications — sans média, donc sans URL signée. */
export type PublicationSummary = {
  id: string;
  title: string;
  status: string;
  created_at: string;
};

export const loginUrl = `${API_URL}/api/auth/google/login`;
/** Lien de liaison du compte SoundCloud (démarre le consentement OAuth). */
export const soundcloudLoginUrl = `${API_URL}/api/auth/soundcloud/login`;

export class ApiError extends Error {}

/** Appel JSON authentifié — remonte le `detail` du backend tel quel. */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: init.body
      ? { "Content-Type": "application/json", ...init.headers }
      : init.headers,
  });

  if (!response.ok) throw new ApiError(await readDetail(response));
  return response.json();
}

async function readDetail(response: Response): Promise<string> {
  if (response.status === 401) {
    return "Votre session a expiré — reconnectez-vous.";
  }
  try {
    const parsed = await response.json();
    if (typeof parsed.detail === "string") return parsed.detail;
  } catch {
    // Réponse non JSON (proxy, page d'erreur) — message générique.
  }
  return "Une erreur est survenue — réessayez.";
}

export function createPublication(draft: {
  title: string;
  artist_name: string;
  style: string;
  audio_key: string;
  audio_duration_s: number;
}): Promise<Publication> {
  return request("/api/publications", {
    method: "POST",
    body: JSON.stringify(draft),
  });
}

export function fetchPublication(id: string): Promise<Publication> {
  return request(`/api/publications/${id}`);
}

export type RenderStatus = {
  status: string;
  videos_done: number;
  videos_total: number;
  render_error: string | null;
};

/**
 * Avancement du rendu — léger (sans URL signée), pour être interrogé en boucle
 * sans faire clignoter les pochettes déjà affichées.
 */
export function fetchRenderStatus(id: string): Promise<RenderStatus> {
  return request(`/api/publications/${id}/render-status`);
}

/**
 * Publications du créateur, la plus récente d'abord. Par défaut la liste
 * active ; `archived: true` renvoie les projets archivés.
 */
export function fetchPublications(
  archived = false,
): Promise<PublicationSummary[]> {
  return request(`/api/publications${archived ? "?archived=true" : ""}`);
}

/**
 * Génère une pochette.
 *
 * `prompt` est une direction créative libre : si fournie, elle remplace
 * l'ambiance dérivée du style, en gardant les garde-fous du service (sujet
 * centré, aucun texte). `useTitle` et `useStyle` retirent le titre ou le style
 * du prompt quand ils tirent l'image dans une direction non voulue.
 */
export function generateCover(
  id: string,
  options: { prompt?: string; useTitle?: boolean; useStyle?: boolean } = {},
): Promise<Publication> {
  const trimmed = options.prompt?.trim();
  return request(`/api/publications/${id}/image`, {
    method: "POST",
    body: JSON.stringify({
      prompt: trimmed || null,
      use_title: options.useTitle ?? true,
      use_style: options.useStyle ?? true,
    }),
  });
}

/**
 * Lance le rendu des vidéos (JALON 3). Rend la main aussitôt : la publication
 * passe en `rendering`, puis le front interroge `fetchPublication` jusqu'à
 * `ready` (vidéos disponibles) ou `error` (`render_error` renseigné).
 */
export function startRender(id: string): Promise<Publication> {
  return request(`/api/publications/${id}/video`, { method: "POST" });
}

/**
 * Rédige (ou régénère) les métadonnées via l'agent Claude — titre et
 * description YouTube, description SoundCloud, hashtags par plateforme. Écrase
 * le jeu courant : c'est le bouton « régénérer » du JALON 3.
 */
export function generateMetadata(id: string): Promise<Publication> {
  return request(`/api/publications/${id}/metadata`, { method: "POST" });
}

/** Enregistre les éditions manuelles des métadonnées (champs fournis seulement). */
export function updateMetadata(
  id: string,
  patch: {
    youtube_title?: string;
    youtube_description?: string;
    youtube_tags?: string[];
    soundcloud_description?: string;
    soundcloud_tags?: string[];
  },
): Promise<Publication> {
  return request(`/api/publications/${id}/metadata`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

/**
 * Publie la vidéo paysage sur la chaîne YouTube du créateur. `privacy` par
 * défaut « private » côté serveur — on l'explicite ici.
 */
/** Langue de la vidéo YouTube (métadonnées + audio). */
export type VideoLanguage = "fr" | "en";

export function publishYoutube(
  id: string,
  privacy: Privacy,
  playlistId?: string | null,
  language: VideoLanguage = "fr",
): Promise<Publication> {
  return request(`/api/publications/${id}/publish/youtube`, {
    method: "POST",
    body: JSON.stringify({ privacy, playlist_id: playlistId || null, language }),
  });
}

/** Une playlist YouTube du créateur (pour en choisir une avant publication). */
export type YoutubePlaylist = { id: string; title: string };

/** Playlists du compte YouTube — pour le menu déroulant du JALON 3. */
export function fetchYoutubePlaylists(id: string): Promise<YoutubePlaylist[]> {
  return request(`/api/publications/${id}/youtube/playlists`);
}

/**
 * Publie le morceau (audio d'origine + artwork 1:1) sur le compte SoundCloud du
 * créateur. `sharing` par défaut « private » côté serveur — on l'explicite ici.
 * `genre` est un texte libre (SoundCloud n'a pas de liste canonique).
 */
export function publishSoundcloud(
  id: string,
  sharing: Sharing,
  genre?: string | null,
): Promise<Publication> {
  return request(`/api/publications/${id}/publish/soundcloud`, {
    method: "POST",
    body: JSON.stringify({ sharing, genre: genre?.trim() || null }),
  });
}

/**
 * Supprime une pochette d'un format donné (« 16:9 », « 9:16 », « 1:1 »).
 * Refusé si elle a servi au rendu d'une vidéo.
 */
export function deleteCover(id: string, ratio: string): Promise<Publication> {
  return request(
    `/api/publications/${id}/cover?ratio=${encodeURIComponent(ratio)}`,
    { method: "DELETE" },
  );
}

/** Lien de téléchargement zip des 3 pochettes actuelles (le backend force le zip). */
export function coversDownloadUrl(id: string): string {
  return `${API_URL}/api/publications/${id}/covers/download`;
}

/** Lien de téléchargement zip d'une génération archivée. */
export function coverSetDownloadUrl(id: string, setId: string): string {
  return `${API_URL}/api/publications/${id}/cover-sets/${setId}/download`;
}

/** Supprime une génération de pochettes archivée et ses images. */
export function deleteCoverSet(id: string, setId: string): Promise<Publication> {
  return request(`/api/publications/${id}/cover-sets/${setId}`, {
    method: "DELETE",
  });
}

/** Supprime la publication et ses médias. Irréversible. Refusé si publié. */
export async function deletePublication(id: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/publications/${id}`, {
    method: "DELETE",
    credentials: "include",
  });

  if (!response.ok) throw new ApiError(await readDetail(response));
}

/**
 * Archive la publication : elle quitte la liste active sans être supprimée.
 * C'est le pendant de la suppression pour un projet publié.
 */
export function archivePublication(id: string): Promise<Publication> {
  return request(`/api/publications/${id}/archive`, { method: "POST" });
}

export async function uploadCover(id: string, file: File): Promise<Publication> {
  const body = new FormData();
  body.append("file", file);

  const response = await fetch(`${API_URL}/api/publications/${id}/cover`, {
    method: "POST",
    credentials: "include",
    body,
  });

  if (!response.ok) throw new ApiError(await readDetail(response));
  return response.json();
}

/**
 * Met à jour le nom d'artiste. Une chaîne vide l'efface — le nom du compte
 * Google reprend alors la main.
 */
export function updateArtistName(artistName: string): Promise<Profile> {
  return request("/api/auth/me", {
    method: "PATCH",
    body: JSON.stringify({ artist_name: artistName }),
  });
}

/** Ferme la session : le backend efface le cookie. */
export async function logout(): Promise<void> {
  const response = await fetch(`${API_URL}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) throw new ApiError(await readDetail(response));
}

/** Profil courant, ou `null` si la session est absente ou expirée. */
export async function fetchProfile(): Promise<Profile | null> {
  const response = await fetch(`${API_URL}/api/auth/me`, {
    credentials: "include",
  });

  if (response.status === 401) return null;
  if (!response.ok) {
    throw new ApiError("Impossible de récupérer votre profil.");
  }
  return response.json();
}

/**
 * Envoie le fichier audio en signalant la progression.
 *
 * `XMLHttpRequest` plutôt que `fetch` : c'est la seule API navigateur qui
 * expose la progression de l'envoi, indispensable pour 50 Mo sur mobile.
 */
export function uploadAudio(
  file: File,
  onProgress: (ratio: number) => void,
): Promise<AudioUpload> {
  return new Promise((resolve, reject) => {
    const body = new FormData();
    body.append("file", file);

    const request = new XMLHttpRequest();
    request.open("POST", `${API_URL}/api/upload/audio`);
    request.withCredentials = true;

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };

    request.onload = () => {
      if (request.status === 201) {
        resolve(JSON.parse(request.responseText));
        return;
      }
      if (request.status === 401) {
        reject(new ApiError("Votre session a expiré — reconnectez-vous."));
        return;
      }
      reject(new ApiError(readErrorDetail(request.responseText)));
    };

    request.onerror = () =>
      reject(new ApiError("Connexion interrompue — réessayez."));

    request.send(body);
  });
}

/** Le backend renvoie ses refus dans `detail`, rédigés pour l'utilisateur. */
function readErrorDetail(responseText: string): string {
  try {
    const parsed = JSON.parse(responseText);
    if (typeof parsed.detail === "string") return parsed.detail;
  } catch {
    // Réponse non JSON (proxy, page d'erreur) — on garde le message générique.
  }
  return "L'envoi a échoué — réessayez.";
}
