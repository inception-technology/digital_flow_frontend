import { describe, expect, it } from "vitest";

import { checkDuration, checkFile, formatBytes, formatDuration } from "./audio";
import { MAX_AUDIO_BYTES } from "./constants";

function fakeFile(name: string, size: number): File {
  const file = new File(["x"], name, { type: "audio/mpeg" });
  // La taille réelle d'un File n'est pas modifiable — on la simule pour
  // éviter d'allouer 50 Mo dans un test.
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("checkFile", () => {
  it("accepte un mp3 et un wav", () => {
    expect(checkFile(fakeFile("morceau.mp3", 1000)).ok).toBe(true);
    expect(checkFile(fakeFile("morceau.wav", 1000)).ok).toBe(true);
  });

  it("ignore la casse de l'extension", () => {
    expect(checkFile(fakeFile("MORCEAU.MP3", 1000)).ok).toBe(true);
  });

  it("refuse un format non supporté", () => {
    const result = checkFile(fakeFile("morceau.flac", 1000));
    expect(result).toMatchObject({ ok: false });
    expect(result.ok === false && result.message).toContain("Format non supporté");
  });

  it("refuse un fichier vide", () => {
    const result = checkFile(fakeFile("morceau.mp3", 0));
    expect(result.ok === false && result.message).toContain("vide");
  });

  it("refuse au-delà de la limite de taille", () => {
    const result = checkFile(fakeFile("morceau.mp3", MAX_AUDIO_BYTES + 1));
    expect(result.ok === false && result.message).toContain("trop volumineux");
  });

  it("accepte exactement la limite", () => {
    expect(checkFile(fakeFile("morceau.mp3", MAX_AUDIO_BYTES)).ok).toBe(true);
  });
});

describe("checkDuration", () => {
  it("accepte une durée normale", () => {
    expect(checkDuration(180).ok).toBe(true);
  });

  it("accepte exactement dix minutes", () => {
    expect(checkDuration(600).ok).toBe(true);
  });

  it("refuse au-delà de dix minutes", () => {
    const result = checkDuration(601);
    expect(result.ok === false && result.message).toContain("trop long");
  });

  it("refuse une durée illisible", () => {
    // `<audio>` renvoie NaN ou Infinity sur un fichier corrompu ou en flux.
    expect(checkDuration(Number.NaN).ok).toBe(false);
    expect(checkDuration(Number.POSITIVE_INFINITY).ok).toBe(false);
    expect(checkDuration(0).ok).toBe(false);
  });
});

describe("formatage", () => {
  it("affiche les durées en minutes:secondes", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(600)).toBe("10:00");
  });

  it("affiche les tailles avec une précision utile", () => {
    expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.5 Mo");
    expect(formatBytes(50 * 1024 * 1024)).toBe("50 Mo");
  });

  it("bascule en kilooctets sous le mégaoctet", () => {
    // « 0.0 Mo » n'apprend rien à l'utilisateur sur un petit fichier.
    expect(formatBytes(48 * 1024)).toBe("48 Ko");
    expect(formatBytes(200)).toBe("1 Ko");
  });
});
