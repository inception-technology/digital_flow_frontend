/**
 * Règles de navigation du parcours de publication, isolées du composant.
 *
 * `cover-step.tsx` fait 2 600 lignes et n'a aucun test : les conditions qui
 * décident de ce qui s'affiche à quelle étape y étaient noyées dans le JSX,
 * donc invérifiables autrement qu'à l'œil. C'est ainsi qu'une impasse est
 * passée en production — une fois publié, plus aucun chemin ne menait aux
 * vidéos rendues.
 *
 * Ces fonctions sont pures et testées (`parcours.test.ts`). Le composant les
 * consomme au lieu de recalculer les mêmes booléens.
 */

/** L'état du parcours dont dépend l'affichage, réduit à ce qui décide. */
export type EtatParcours = {
  /** Au moins une pochette validée. */
  hasCovers: boolean;
  /** Au moins une vidéo rendue et disponible. */
  hasVideos: boolean;
  /** Un rendu est en cours côté serveur. */
  isRendering: boolean;
  /** Au moins une plateforme porte déjà le morceau. */
  anyPublished: boolean;
  /** Le créateur a demandé à passer à l'étape de publication. */
  showPublication: boolean;
};

/**
 * Étape 4 (Post) : les vidéos sont prêtes ET le créateur y est passé — ou une
 * plateforme publie déjà, auquel cas on ne peut plus revenir en arrière.
 */
export function atPublication(etat: EtatParcours): boolean {
  return (
    etat.hasVideos && !etat.isRendering && (etat.showPublication || etat.anyPublished)
  );
}

/** Étape courante, pour la barre à quatre attentes. */
export function currentStep(etat: EtatParcours): 2 | 3 | 4 {
  if (atPublication(etat)) return 4;
  return etat.isRendering || etat.hasVideos ? 3 : 2;
}

/**
 * La galerie de pochettes « à vérifier » n'appartient qu'à l'étape 2 : dès le
 * rendu puis la publication, la vidéo et les textes prennent le relais.
 */
export function showCoversGallery(etat: EtatParcours): boolean {
  return etat.hasCovers && !etat.isRendering && !etat.hasVideos;
}

/**
 * Les fichiers rendus doivent rester récupérables **à toute étape où ils
 * existent**, y compris après la mise en ligne.
 *
 * C'est la règle qui manquait : l'étape 3 affichait les lecteurs et leurs liens
 * de téléchargement, l'étape 4 n'affichait rien, et une fois publié l'étape 4
 * devenait le seul écran atteignable. Les vidéos — seule copie locale du
 * travail — n'étaient plus accessibles nulle part.
 */
export function videosAreDownloadable(etat: EtatParcours): boolean {
  return etat.hasVideos && !etat.isRendering;
}

/**
 * Le bloc de téléchargement de l'étape 4.
 *
 * Volontairement affiché **dès qu'on est à l'étape 4**, et pas seulement une
 * fois publié. La version conditionnée à la publication laissait un état où les
 * fichiers rendus n'étaient joignables que par le lien « ← Revenir aux vidéos »
 * — un chemin qui disparaît à la publication, et qu'un futur remaniement de
 * l'écran ferait disparaître sans que rien ne le signale. Le test exhaustif
 * ci-contre l'a relevé.
 *
 * Le prix est une légère redondance avant publication ; le gain est une
 * propriété simple à tenir : dès qu'une vidéo existe hors rendu, un écran la
 * propose au téléchargement.
 */
export function showPublishedDownloads(etat: EtatParcours): boolean {
  return videosAreDownloadable(etat) && atPublication(etat);
}
