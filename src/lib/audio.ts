import {
  ACCEPTED_EXTENSIONS,
  MAX_AUDIO_BYTES,
  MAX_AUDIO_SECONDS,
} from "./constants";

/**
 * Validation côté navigateur, avant envoi.
 *
 * Le backend revalide tout — mais refuser localement évite de faire monter
 * 50 Mo sur un réseau mobile pour recevoir un 422. Les messages sont rédigés
 * pour être affichés tels quels.
 */

export type AudioCheck =
  | { ok: true }
  | { ok: false; message: string };

export function formatBytes(bytes: number): string {
  const mo = bytes / (1024 * 1024);
  if (mo < 1) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  return mo >= 10 ? `${Math.round(mo)} Mo` : `${mo.toFixed(1)} Mo`;
}

export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

export function checkFile(file: File): AudioCheck {
  const name = file.name.toLowerCase();
  const hasAcceptedExtension = ACCEPTED_EXTENSIONS.some((extension) =>
    name.endsWith(extension),
  );

  if (!hasAcceptedExtension) {
    return {
      ok: false,
      message: "Format non supporté — utilisez un fichier .mp3 ou .wav.",
    };
  }

  if (file.size === 0) {
    return { ok: false, message: "Ce fichier est vide." };
  }

  if (file.size > MAX_AUDIO_BYTES) {
    return {
      ok: false,
      message: `Fichier trop volumineux (${formatBytes(file.size)}) — maximum ${formatBytes(MAX_AUDIO_BYTES)}.`,
    };
  }

  return { ok: true };
}

export function checkDuration(seconds: number): AudioCheck {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return {
      ok: false,
      message: "Fichier audio illisible ou corrompu.",
    };
  }

  if (seconds > MAX_AUDIO_SECONDS) {
    return {
      ok: false,
      message: `Morceau trop long (${formatDuration(seconds)}) — maximum ${MAX_AUDIO_SECONDS / 60} minutes.`,
    };
  }

  return { ok: true };
}

/** Lit la durée via un élément `<audio>`, sans décoder tout le fichier. */
export function readDuration(objectUrl: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = new Audio();
    probe.preload = "metadata";
    probe.onloadedmetadata = () => resolve(probe.duration);
    probe.onerror = () =>
      reject(new Error("Fichier audio illisible ou corrompu."));
    probe.src = objectUrl;
  });
}
