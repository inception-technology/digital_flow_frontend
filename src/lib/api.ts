/**
 * Client de l'API.
 *
 * L'authentification repose sur un cookie HttpOnly posé par le backend : le
 * front ne détient aucun jeton, d'où le `credentials: "include"` systématique.
 */

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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

export const loginUrl = `${API_URL}/api/auth/google/login`;

export class ApiError extends Error {}

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
