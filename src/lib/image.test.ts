import { describe, expect, it } from "vitest";

import { checkFormatDimensions, cropNotice, croppedSize } from "./image";

describe("croppedSize", () => {
  it("rogne la hauteur d'un paysage trop haut pour le 16:9", () => {
    expect(croppedSize(1600, 1200, "16:9")).toEqual([1600, 900]);
  });

  it("rogne la largeur d'un carré pour le 9:16", () => {
    expect(croppedSize(1080, 1080, "9:16")).toEqual([608, 1080]);
  });

  it("laisse une image déjà au bon rapport intacte", () => {
    expect(croppedSize(1440, 2560, "9:16")).toEqual([1440, 2560]);
  });
});

describe("checkFormatDimensions", () => {
  it("accepte exactement le plancher du 16:9", () => {
    expect(checkFormatDimensions("16:9", 1280, 720).ok).toBe(true);
  });

  it("refuse un pixel sous le plancher du 16:9", () => {
    expect(checkFormatDimensions("16:9", 1279, 720).ok).toBe(false);
  });

  it("refuse une image carrée pour le format vertical", () => {
    const result = checkFormatDimensions("9:16", 1080, 1080);

    expect(result).toMatchObject({ ok: false });
    expect(result.ok === false && result.message).toContain("1080×1920");
  });

  it("accepte un portrait au bon rapport", () => {
    expect(checkFormatDimensions("9:16", 1440, 2560).ok).toBe(true);
  });

  it("accepte le plancher du carré", () => {
    expect(checkFormatDimensions("1:1", 1080, 1080).ok).toBe(true);
  });

  it("refuse un format inconnu plutôt que de laisser passer", () => {
    expect(checkFormatDimensions("4:3", 4000, 3000).ok).toBe(false);
  });
});

describe("cropNotice", () => {
  it("ne prévient pas quand le rapport correspond", () => {
    expect(cropNotice("16:9", 1920, 1080)).toBeNull();
  });

  it("tolère un écart de rapport imperceptible", () => {
    expect(cropNotice("1:1", 1000, 1010)).toBeNull();
  });

  it("annonce la part de hauteur retirée", () => {
    const notice = cropNotice("16:9", 1600, 1200);

    expect(notice).toContain("hauteur");
    expect(notice).toContain("25 %");
  });

  it("annonce la part de largeur retirée", () => {
    expect(cropNotice("9:16", 1080, 1080)).toContain("largeur");
  });
});
