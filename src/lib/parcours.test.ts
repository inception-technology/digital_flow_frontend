import { describe, expect, it } from "vitest";

import {
  atPublication,
  currentStep,
  showCoversGallery,
  showPublishedDownloads,
  videosAreDownloadable,
  type EtatParcours,
} from "./parcours";

/** Étape 2 : pochettes validées, aucun rendu lancé. */
const ETAPE_2: EtatParcours = {
  hasCovers: true,
  hasVideos: false,
  isRendering: false,
  anyPublished: false,
  showPublication: false,
};

const EN_RENDU: EtatParcours = { ...ETAPE_2, isRendering: true };

/** Étape 3 : les deux vidéos sont prêtes, rien n'est encore publié. */
const ETAPE_3: EtatParcours = { ...ETAPE_2, hasVideos: true };

/** Étape 4 atteinte volontairement, avant publication. */
const ETAPE_4: EtatParcours = { ...ETAPE_3, showPublication: true };

/** Étape 4 après mise en ligne : le retour aux vidéos n'existe plus. */
const PUBLIE: EtatParcours = { ...ETAPE_3, anyPublished: true };

describe("currentStep", () => {
  it("reste à l'étape 2 tant qu'aucun rendu n'est lancé", () => {
    expect(currentStep(ETAPE_2)).toBe(2);
  });

  it("passe à l'étape 3 dès que le rendu démarre", () => {
    expect(currentStep(EN_RENDU)).toBe(3);
  });

  it("reste à l'étape 3 quand les vidéos sont prêtes", () => {
    expect(currentStep(ETAPE_3)).toBe(3);
  });

  it("passe à l'étape 4 sur demande explicite", () => {
    expect(currentStep(ETAPE_4)).toBe(4);
  });

  it("force l'étape 4 dès qu'une plateforme publie", () => {
    expect(currentStep(PUBLIE)).toBe(4);
  });

  it("ne saute pas à l'étape 4 pendant le rendu, même publié", () => {
    expect(currentStep({ ...PUBLIE, isRendering: true })).toBe(3);
  });
});

describe("atPublication", () => {
  it("exige des vidéos prêtes", () => {
    expect(atPublication({ ...ETAPE_2, showPublication: true })).toBe(false);
  });

  it("est vrai une fois publié, sans demande explicite", () => {
    expect(atPublication(PUBLIE)).toBe(true);
  });
});

describe("showCoversGallery", () => {
  it("montre les pochettes à l'étape 2", () => {
    expect(showCoversGallery(ETAPE_2)).toBe(true);
  });

  it("les retire dès le rendu", () => {
    expect(showCoversGallery(EN_RENDU)).toBe(false);
  });

  it("les retire une fois les vidéos prêtes", () => {
    expect(showCoversGallery(ETAPE_3)).toBe(false);
  });
});

describe("videosAreDownloadable", () => {
  it("est faux tant qu'aucune vidéo n'est rendue", () => {
    expect(videosAreDownloadable(ETAPE_2)).toBe(false);
  });

  it("est faux pendant le rendu", () => {
    expect(videosAreDownloadable({ ...ETAPE_3, isRendering: true })).toBe(false);
  });

  it("est vrai à l'étape 3", () => {
    expect(videosAreDownloadable(ETAPE_3)).toBe(true);
  });

  it("reste vrai après la publication", () => {
    // La régression à verrouiller : publier ne doit jamais rendre les fichiers
    // rendus inatteignables. Ils sont la seule copie locale du travail.
    expect(videosAreDownloadable(PUBLIE)).toBe(true);
  });
});

describe("showPublishedDownloads", () => {
  it("n'apparaît pas à l'étape 3, où les lecteurs portent déjà les liens", () => {
    expect(showPublishedDownloads(ETAPE_3)).toBe(false);
  });

  it("apparaît dès l'étape 4, sans attendre la publication", () => {
    // Ne pas dépendre du lien « ← Revenir aux vidéos » : c'est lui qui
    // disparaît à la publication, et le seul chemin restant serait perdu.
    expect(showPublishedDownloads(ETAPE_4)).toBe(true);
  });

  it("apparaît une fois publié — le seul écran encore atteignable", () => {
    expect(showPublishedDownloads(PUBLIE)).toBe(true);
  });

  it("n'apparaît pas si un nouveau rendu est en cours", () => {
    expect(showPublishedDownloads({ ...PUBLIE, isRendering: true })).toBe(false);
  });
});

describe("aucun état ne laisse les vidéos inatteignables", () => {
  /** Toutes les combinaisons possibles des cinq booléens. */
  const tousLesEtats = (): EtatParcours[] => {
    const bools = [false, true];
    const etats: EtatParcours[] = [];
    for (const hasCovers of bools)
      for (const hasVideos of bools)
        for (const isRendering of bools)
          for (const anyPublished of bools)
            for (const showPublication of bools)
              etats.push({
                hasCovers,
                hasVideos,
                isRendering,
                anyPublished,
                showPublication,
              });
    return etats;
  };

  it("dès que des vidéos existent hors rendu, un écran les propose", () => {
    for (const etat of tousLesEtats()) {
      if (!etat.hasVideos || etat.isRendering) continue;

      // Soit on est à l'étape 3 (lecteurs + téléchargement), soit à l'étape 4
      // avec le bloc dédié. Jamais ni l'un ni l'autre.
      const joignable = !atPublication(etat) || showPublishedDownloads(etat);
      expect(joignable, JSON.stringify(etat)).toBe(true);
    }
  });
});
