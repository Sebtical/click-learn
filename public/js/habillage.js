// Habillage de l'interface : illustrations (avec repli si l'image manque), règle des niveaux,
// anneau de maîtrise des chapitres. Aucune donnée n'est envoyée nulle part.

// ── Illustrations ──
// Chemin de chaque image dans public/img/. Une entrée à null affiche le repli (emoji ou mascotte) :
// on renseigne le chemin seulement quand le fichier existe, pour ne jamais afficher d'image cassée.
const ILLUSTRATIONS = {
  avatar: null,
  banniere: null, // scène large (16:9) affichée en fond de la carte de niveau
  trophee: null,
  photo: null,
  exercice: null,
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

// Attributs de la carte de niveau : classe et image de fond si la bannière est fournie, rien sinon.
function attributsBanniere() {
  const src = ILLUSTRATIONS.banniere;
  return src ? ` avec-banniere" style="--banniere:url('${src}')` : '';
}

// ── Avatar personnel ──
// L'avatar choisi par l'enfant reste sur son appareil (clé CLE_AVATAR, storage.js) : il n'est ni dans public/, ni envoyé au serveur.
const TAILLE_AVATAR = 256;           // côté du carré enregistré, en pixels
const POIDS_MAX_AVATAR = 200000;     // garde-fou en caractères (~150 Ko) pour ne pas saturer le stockage du navigateur

// Vrai seulement pour une image JPEG encodée telle que l'appli la produit : rien d'autre n'entre dans la page.
function estAvatarValide(valeur) {
  return typeof valeur === 'string'
    && valeur.length < POIDS_MAX_AVATAR
    && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(valeur);
}

// Affiche l'avatar personnel s'il est valide, sinon le repli (illustration ou mascotte).
function avatarHtml(avatar, repli) {
  return estAvatarValide(avatar) ? `<img class="illu" src="${avatar}" alt="Mon avatar">` : repli;
}

// Calcule le plus grand carré centré dans une image (largeur × hauteur), pour recadrer sans déformer.
function cadrageCarre(largeur, hauteur) {
  const cote = Math.min(largeur, hauteur);
  return { sx: Math.floor((largeur - cote) / 2), sy: Math.floor((hauteur - cote) / 2), cote };
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

// ── Maîtrise des chapitres ──
// Teinte d'un pourcentage de maîtrise : rouge (0 %) → vert (100 %). Seule source de cette échelle de couleurs.
function teinteMaitrise(pct) {
  return Math.round((Math.min(100, Math.max(0, pct)) / 100) * 120);
}

// Dessine un anneau de progression (en CSS) pour un pourcentage de maîtrise, ou un tiret si non testé.
function anneauMaitrise(pct) {
  if (pct === null || pct === undefined) {
    return `<span class="ring vide" role="img" aria-label="Pas encore testé"><span>–</span></span>`;
  }
  const p = Math.min(100, Math.max(0, Math.round(pct)));
  return `<span class="ring" role="img" aria-label="Maîtrise : ${p} %" style="--p:${p};--c:hsl(${teinteMaitrise(p)} 60% 42%)"><span>${p}%</span></span>`;
}

// Ligne de la liste des chapitres : numéro, titre (échappé : il peut venir de l'IA) et anneau de maîtrise.
function chapitreLi(i, titre, pct) {
  return `
    <li data-i="${i}">
      <span class="chap-text"><span class="chap-num">Chapitre ${i + 1}</span><strong>${echapperHtml(titre)}</strong></span>
      ${anneauMaitrise(pct)}
    </li>`;
}
