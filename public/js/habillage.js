// Habillage de l'interface : illustrations (avec repli si l'image manque), règle des niveaux,
// anneau de maîtrise des chapitres. Aucune donnée n'est envoyée nulle part.

// ── Illustrations ──
// Chemin de chaque image dans public/img/. Une entrée à null affiche le repli (emoji ou mascotte) :
// on renseigne le chemin seulement quand le fichier existe, pour ne jamais afficher d'image cassée.
const ILLUSTRATIONS = {
  avatar: null,
  trophee: null,
  photo: null,
  'Maths': null,
  'Français': null,
  'Histoire-Géographie': null,
  'SVT': null,
  'Anglais': null,
  'Physique-Chimie': null,
  'Technologie': null
};

// Renvoie la balise <img> de l'illustration demandée, ou le HTML de repli si elle n'est pas encore fournie.
function illustration(cle, repli) {
  const src = ILLUSTRATIONS[cle];
  return src ? `<img class="illu" src="${src}" alt="" loading="lazy">` : repli;
}

// ── Niveaux ──
const POINTS_PAR_NIVEAU = 50; // 1 point = 1 bonne réponse ; règle validée par Seb le 2026-11-12

// Calcule le niveau atteint et l'avancement vers le suivant à partir du nombre de points.
function niveauDepuisPoints(points) {
  const p = Math.max(0, Math.floor(Number(points) || 0));
  const dansNiveau = p % POINTS_PAR_NIVEAU;
  return {
    niveau: Math.floor(p / POINTS_PAR_NIVEAU) + 1,
    reste: POINTS_PAR_NIVEAU - dansNiveau,
    pct: Math.round((dansNiveau / POINTS_PAR_NIVEAU) * 100)
  };
}

// ── Anneau de maîtrise ──
// Dessine un anneau de progression (en CSS) pour un pourcentage de maîtrise, ou un tiret si non testé.
function anneauMaitrise(pct) {
  if (pct === null || pct === undefined) {
    return `<span class="ring vide" role="img" aria-label="Pas encore testé"><span>–</span></span>`;
  }
  const p = Math.min(100, Math.max(0, Math.round(pct)));
  const teinte = Math.round((p / 100) * 120); // rouge (0) → vert (120), comme les pastilles de l'espace parent
  return `<span class="ring" role="img" aria-label="Maîtrise : ${p} %" style="--p:${p};--c:hsl(${teinte} 60% 42%)"><span>${p}%</span></span>`;
}
