/**
 * Vérification d'une image de pochette fournie par le créateur, côté navigateur.
 *
 * Le backend revalide (Pillow) — mais contrôler ici évite de faire monter une
 * image inutilisable pour recevoir un 422, et donne un retour immédiat.
 */

// Plancher aligné sur le backend : en deçà, rogner l'image en trois formats
// donnerait des variantes floues.
export const MIN_COVER_SIDE = 1080;

export type CoverCheck = { ok: true } | { ok: false; message: string };

/** Lit les dimensions natives d'une image, sans la décoder entièrement à l'écran. */
export function readImageSize(
  file: File,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image illisible."));
    };
    image.src = url;
  });
}

/** Refuse une image trop petite pour produire les trois formats. */
export function checkCoverDimensions(width: number, height: number): CoverCheck {
  if (Math.min(width, height) < MIN_COVER_SIDE) {
    return {
      ok: false,
      message: `Image trop petite (${width}×${height} px) — il faut au moins ${MIN_COVER_SIDE}×${MIN_COVER_SIDE} px pour produire les trois formats.`,
    };
  }
  return { ok: true };
}
