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

/**
 * Plateformes visées par le produit — liste unique, partagée par l'accueil et
 * les Paramètres (audit reco #8 : deux listes maintenues séparément faisaient
 * apparaître TikTok à un endroit et pas l'autre).
 *
 * `key` correspond à `connected_platforms` renvoyé par le backend (une
 * plateforme y figure dès qu'un jeton est stocké). YouTube se relie d'office via
 * le login Google ; SoundCloud se relie séparément (`connectable`) ; TikTok
 * n'est pas encore branché (`comingSoon`).
 */
export type Platform = {
  key: string;
  label: string;
  /** Se relie via son propre flow OAuth (bouton « Connecter »). */
  connectable?: boolean;
  /** Pas encore branché — affiché « Bientôt », non tapable. */
  comingSoon?: boolean;
};

export const PLATFORMS: readonly Platform[] = [
  { key: "youtube", label: "YouTube" },
  { key: "soundcloud", label: "SoundCloud", connectable: true },
  { key: "tiktok", label: "TikTok", comingSoon: true },
];
