/**
 * Limites et vocabulaire du domaine.
 *
 * Ces valeurs doublent volontairement celles du backend (`ccauto_shared` et
 * `app/config.py`) : le front les utilise pour éviter d'envoyer un fichier voué
 * au refus, mais c'est le backend qui fait autorité. Si l'un des deux change,
 * l'autre doit suivre.
 */

export const MUSIC_STYLES = [
  "RAP",
  "RNB",
  "BOUNCE",
  "AFROTRAP",
  "DRILL",
  "FUNK",
] as const;

export type MusicStyle = (typeof MUSIC_STYLES)[number];

export const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
export const MAX_AUDIO_SECONDS = 600;
export const ACCEPTED_EXTENSIONS = [".mp3", ".wav"] as const;
export const ACCEPT_ATTRIBUTE = "audio/mpeg,audio/wav,.mp3,.wav";
