/**
 * Vérification d'une image de pochette fournie par le créateur, côté navigateur.
 *
 * Le backend revalide (Pillow) — mais contrôler ici évite de faire monter une
 * image inutilisable pour recevoir un 422, et donne un retour immédiat.
 *
 * Les plafonds et planchers ci-dessous doublent volontairement ceux du backend
 * (`shared/enums.py` et `app/services/images.py`). Si l'un des deux change,
 * l'autre doit suivre — le backend fait autorité.
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

// ── Import d'une image destinée à un seul format ────────────────────────────

/** Dimensions **maximales** par cadrage — miroir de `ASPECT_RATIO_MAX_SIZES`. */
const RATIO_MAX: Record<string, [number, number]> = {
  "16:9": [1280, 720],
  "9:16": [1080, 1920],
  "1:1": [3000, 3000],
};

/**
 * Plancher **par cadrage**, appliqué au résultat du rognage — miroir de
 * `MIN_CROPPED_SIZES`. Le carré garde le plancher historique de 1080 px : son
 * plafond SoundCloud (3000 px) exclurait presque toutes les images.
 */
export const MIN_CROPPED: Record<string, [number, number]> = {
  "16:9": [1280, 720],
  "9:16": [1080, 1920],
  "1:1": [1080, 1080],
};

/**
 * Dimensions du rognage centré, avant réduction au plafond.
 *
 * Renvoie `null` sur un cadrage inconnu plutôt que de laisser la
 * déstructuration d'un `undefined` lever une `TypeError` : la fonction est
 * exportée, et un appelant qui n'aurait pas filtré en amont mérite un refus
 * lisible, pas un écran blanc.
 */
export function croppedSize(
  width: number,
  height: number,
  ratio: string,
): [number, number] | null {
  const maximum = RATIO_MAX[ratio];
  if (!maximum) return null;

  const target = maximum[0] / maximum[1];
  if (width / height > target) return [Math.round(height * target), height];
  return [width, Math.round(width / target)];
}

/** Refuse une image dont le rognage donnerait une pochette trop petite. */
export function checkFormatDimensions(
  ratio: string,
  width: number,
  height: number,
): CoverCheck {
  const minimum = MIN_CROPPED[ratio];
  const cropped = croppedSize(width, height, ratio);
  if (!minimum || !cropped) return { ok: false, message: "Format de pochette inconnu." };

  const [cropWidth, cropHeight] = cropped;
  if (cropWidth < minimum[0] || cropHeight < minimum[1]) {
    return {
      ok: false,
      message: `Image trop petite pour le format ${ratio} (${width}×${height} px) — il faut au moins ${minimum[0]}×${minimum[1]} px une fois recadrée au centre.`,
    };
  }
  return { ok: true };
}

// En deçà, l'écart de rapport ne se voit pas : annoncer un recadrage inquiéterait
// pour rien.
const CROP_TOLERANCE = 0.02;

/**
 * Décrit ce que le rognage centré va retirer, ou `null` si l'image est déjà au
 * bon rapport. Le créateur doit savoir qu'une partie de son visuel disparaît.
 */
export function cropNotice(
  ratio: string,
  width: number,
  height: number,
): string | null {
  const maximum = RATIO_MAX[ratio];
  if (!maximum) return null;

  const target = maximum[0] / maximum[1];
  const source = width / height;
  if (Math.abs(source - target) / target <= CROP_TOLERANCE) return null;

  const cropped = croppedSize(width, height, ratio);
  if (!cropped) return null;

  const [cropWidth, cropHeight] = cropped;
  const share =
    source > target ? 1 - cropWidth / width : 1 - cropHeight / height;
  const side = source > target ? "largeur" : "hauteur";
  return `Recadrée au centre pour le ${ratio} — environ ${Math.round(
    share * 100,
  )} % de la ${side} a été retiré.`;
}
