// Cartes mentales : l'IA rédige le contenu (centre, branches, mots-clés), l'appli dessine la carte en SVG,
// dans le style d'une page de carnet à spirale : papier crème, encadrés vert sauge, écriture manuscrite (Caveat).
// Deux dispositions : « pile » (téléphone tenu droit) et « étoile » (téléphone tourné, ordinateur).
// Règle dure : tout texte venant de l'IA est échappé avant d'entrer dans le SVG.

// ── Réglages ──
const CARTE_MAX_BRANCHES = 6;
const CARTE_MAX_ELEMENTS = 5;
const CARTE_LONGUEUR_MAX = 90; // caractères d'un titre ou d'un élément, au-delà c'est coupé
const CARTE_POLICE = "'Caveat', 'Segoe Print', 'Bradley Hand', cursive";
const CARTE_FICHIER_POLICE = 'fonts/caveat-600.woff2'; // embarquée dans l'image enregistrée
// Couleurs du carnet
const CARNET = {
  papier: '#FBF8EF', points: '#E6E0CC', spirale: '#A9A499', trou: '#E9E3D3',
  encre: '#2F4A2A', trait: '#5F8752', fond: '#F4F8EE', etiquette: '#D3E6C3',
  bulle: '#E6F0DA', feuille: '#8DB27D', postit: '#E1EFCF', scotch: '#EADFC4'
};
// Largeur moyenne d'un caractère de Caveat, en fraction de la taille de police (pour couper les lignes)
const CAVEAT_LARGEUR = 0.42;

// ── Contrôle de ce que renvoie l'IA ──

// Remet en forme une carte mentale ; null si elle a moins de 2 branches exploitables.
function validerCarteMentale(objet) {
  if (!objet || typeof objet !== 'object') return null;
  const texte = v => (typeof v === 'string' ? v.trim().slice(0, CARTE_LONGUEUR_MAX) : '');
  const branches = (Array.isArray(objet.branches) ? objet.branches : [])
    .filter(b => b && texte(b.titre))
    .slice(0, CARTE_MAX_BRANCHES)
    .map(b => ({
      titre: texte(b.titre),
      elements: (Array.isArray(b.elements) ? b.elements : []).map(texte).filter(Boolean).slice(0, CARTE_MAX_ELEMENTS)
    }));
  if (branches.length < 2) return null;
  return { centre: texte(objet.centre) || 'Mon cours', branches };
}

// ── Mise en page ──

// Coupe un texte en lignes d'au plus maxCar caractères, sans couper les mots (sauf mot trop long).
function couperLignes(texte, maxCar) {
  const lignes = [];
  let ligne = '';
  for (const mot of String(texte).split(/\s+/).filter(Boolean)) {
    if (!ligne) ligne = mot;
    else if ((ligne + ' ' + mot).length <= maxCar) ligne += ' ' + mot;
    else { lignes.push(ligne); ligne = mot; }
    while (ligne.length > maxCar) { lignes.push(ligne.slice(0, maxCar)); ligne = ligne.slice(maxCar); }
  }
  if (ligne) lignes.push(ligne);
  return lignes;
}

// Nombre de caractères qui tiennent dans une largeur donnée, pour une taille de police donnée.
function carParLigne(largeur, taille) {
  return Math.max(6, Math.floor(largeur / (taille * CAVEAT_LARGEUR)));
}

// Boîte d'une branche : lignes de l'étiquette et des éléments, et hauteur totale pour une largeur donnée.
function boiteBranche(branche, largeur) {
  const titre = couperLignes(branche.titre, carParLigne(largeur - 40, 24));
  const elements = branche.elements.map(e => couperLignes(e, carParLigne(largeur - 40, 19)));
  const hauteurEtiquette = 12 + titre.length * 24;
  const hauteur = 14 + hauteurEtiquette + 10 + elements.reduce((h, l) => h + l.length * 21 + 3, 0) + 12;
  return { titre, elements, hauteurEtiquette, hauteur };
}

// ── Éléments dessinés ──

// Encadré d'une branche : étiquette vert pâle en haut, puis liste à puces manuscrite.
function boiteSvg(boite, x, y, largeur) {
  const largEtiquette = Math.min(largeur - 24, Math.max(...boite.titre.map(l => l.length)) * 24 * CAVEAT_LARGEUR + 30);
  const etiquetteX = x + (largeur - largEtiquette) / 2;
  let ligneY = y + 14 + 26;
  const titre = boite.titre.map(l => {
    const t = `<text x="${x + largeur / 2}" y="${ligneY}" text-anchor="middle" font-size="24" fill="${CARNET.encre}">${echapperHtml(l)}</text>`;
    ligneY += 24;
    return t;
  }).join('');
  ligneY = y + 14 + boite.hauteurEtiquette + 10 + 16;
  const elements = boite.elements.map(lignes => {
    const puce = `<circle cx="${x + 18}" cy="${ligneY - 5}" r="2.4" fill="${CARNET.encre}"/>`;
    const texte = lignes.map(l => {
      const t = `<text x="${x + 28}" y="${ligneY}" font-size="19" fill="${CARNET.encre}">${echapperHtml(l)}</text>`;
      ligneY += 21;
      return t;
    }).join('');
    ligneY += 3;
    return puce + texte;
  }).join('');
  return `<rect x="${x}" y="${y}" width="${largeur}" height="${boite.hauteur}" rx="16" fill="${CARNET.fond}" stroke="${CARNET.trait}" stroke-width="1.6"/>`
    + `<rect x="${etiquetteX}" y="${y + 12}" width="${largEtiquette}" height="${boite.hauteurEtiquette}" rx="12" fill="${CARNET.etiquette}"/>`
    + titre + elements;
}

// Bulle centrale (titre du cours) centrée sur (cx, cy), avec un brin de feuillage de chaque côté.
function centreSvg(centre, cx, cy, largeur) {
  const lignes = couperLignes(centre, carParLigne(largeur - 50, 40));
  const hauteur = 34 + lignes.length * 40;
  const y0 = cy - hauteur / 2;
  const textes = lignes.map((l, i) =>
    `<text x="${cx}" y="${y0 + 46 + i * 40}" text-anchor="middle" font-size="40" fill="${CARNET.encre}">${echapperHtml(l)}</text>`).join('');
  const bulle = `<rect x="${cx - largeur / 2}" y="${y0}" width="${largeur}" height="${hauteur}" rx="${hauteur / 2}" fill="${CARNET.bulle}" stroke="${CARNET.trait}" stroke-width="1.8"/>`
    + `<rect x="${cx - largeur / 2 + 6}" y="${y0 + 6}" width="${largeur - 12}" height="${hauteur - 12}" rx="${hauteur / 2 - 6}" fill="none" stroke="${CARNET.trait}" stroke-width="0.8" stroke-dasharray="3 4"/>`;
  return { hauteur, svg: bulle + textes };
}

// Brin de feuillage décoratif (tige et feuilles) à la position (x, y), tourné de « angle » degrés.
function brinSvg(x, y, angle, echelle = 1) {
  const feuilles = [[0, -6, -35], [10, -14, 30], [20, -22, -35], [30, -30, 30], [40, -38, -20]]
    .map(([fx, fy, a]) => `<ellipse cx="${fx}" cy="${fy}" rx="9" ry="4.4" transform="rotate(${a} ${fx} ${fy})" fill="${CARNET.feuille}" opacity=".85"/>`).join('');
  return `<g transform="translate(${x} ${y}) rotate(${angle}) scale(${echelle})"><path d="M -4 4 Q 22 -16 46 -44" fill="none" stroke="${CARNET.trait}" stroke-width="1.4"/>${feuilles}</g>`;
}

// Post-it « Révise avec clarté ! » tenu par un morceau de scotch.
function postitSvg(x, y) {
  return `<g transform="rotate(-3 ${x + 70} ${y + 40})">`
    + `<rect x="${x}" y="${y}" width="140" height="78" rx="6" fill="${CARNET.postit}" stroke="${CARNET.trait}" stroke-width="1"/>`
    + `<rect x="${x + 50}" y="${y - 9}" width="40" height="18" rx="2" fill="${CARNET.scotch}" opacity=".9"/>`
    + `<text x="${x + 70}" y="${y + 36}" text-anchor="middle" font-size="24" fill="${CARNET.encre}">Révise avec</text>`
    + `<text x="${x + 70}" y="${y + 62}" text-anchor="middle" font-size="24" fill="${CARNET.encre}">clarté !</text></g>`;
}

// Page de carnet : papier crème à points, et spirale sur le bord gauche.
// id : disposition, pour que les deux cartes de la page n'aient pas les mêmes noms internes.
function pageSvg(largeur, hauteur, id) {
  let spirale = '';
  for (let y = 22; y < hauteur - 10; y += 26) {
    spirale += `<circle cx="16" cy="${y}" r="4" fill="${CARNET.trou}" stroke="${CARNET.spirale}" stroke-width="1"/>`
      + `<path d="M 16 ${y} C 2 ${y - 2}, -2 ${y - 10}, 8 ${y - 12}" fill="none" stroke="${CARNET.spirale}" stroke-width="2.2" stroke-linecap="round"/>`;
  }
  return `<defs><pattern id="points-${id}" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="${CARNET.points}"/></pattern>`
    + `<marker id="fleche-${id}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${CARNET.trait}"/></marker></defs>`
    + `<rect width="${largeur}" height="${hauteur}" rx="14" fill="${CARNET.papier}"/>`
    + `<rect x="30" width="${largeur - 30}" height="${hauteur}" fill="url(#points-${id})"/>${spirale}`;
}

// Enveloppe SVG commune (police manuscrite), avec un éventuel bloc de définitions en tête (police embarquée).
function enveloppeSvg(largeur, hauteur, contenu, disposition, entete = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" class="carte-svg carte-${disposition}" viewBox="0 0 ${largeur} ${hauteur}" width="${largeur}" height="${hauteur}" font-family="${CARTE_POLICE}" font-weight="600">`
    + `${entete}${pageSvg(largeur, hauteur, disposition)}${contenu}</svg>`;
}

// Flèche fine et courbe du point (x1, y1) au point (x2, y2) ; id : disposition (noms internes distincts).
function flecheSvg(x1, y1, x2, y2, id) {
  const mx = (x1 + x2) / 2;
  return `<path d="M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}" fill="none" stroke="${CARNET.trait}" stroke-width="1.6" marker-end="url(#fleche-${id})"/>`;
}

// ── Les deux dispositions ──

// Carte « pile » : bulle en haut, encadrés empilés reliés par un trait et des flèches (téléphone tenu droit).
function carteMentalePileSvg(carte, entete = '') {
  const largeur = 380, gauche = 40, droite = 16, larg = largeur - gauche - droite - 16;
  const hauteurCentre = centreSvg(carte.centre, 0, 0, largeur - gauche - droite).hauteur;
  const cx = gauche + (largeur - gauche - droite) / 2;
  const centre = centreSvg(carte.centre, cx, 22 + hauteurCentre / 2, largeur - gauche - droite);
  let y = 22 + hauteurCentre + 28;
  const tronc = gauche + 8;
  let boites = '', dernierMilieu = y;
  carte.branches.forEach(b => {
    const boite = boiteBranche(b, larg);
    dernierMilieu = y + 26;
    boites += flecheSvg(tronc, dernierMilieu, gauche + 16, dernierMilieu, 'pile') + boiteSvg(boite, gauche + 16, y, larg);
    y += boite.hauteur + 18;
  });
  const trait = `<path d="M ${tronc} ${22 + hauteurCentre} V ${dernierMilieu}" stroke="${CARNET.trait}" stroke-width="1.6"/>`;
  const decor = brinSvg(gauche + 40, y + 76, -30, 1.1)
    + postitSvg(largeur - droite - 150, y + 6);
  return enveloppeSvg(largeur, y + 100, trait + centre.svg + boites + decor, 'pile', entete);
}

// Carte « étoile » : bulle au milieu, encadrés à gauche et à droite, reliés par des flèches courbes.
function carteMentaleEtoileSvg(carte, entete = '') {
  const largeur = 820, marge = 44, larg = 250, ecart = 20, largCentre = 220;
  // Répartition alternée gauche / droite, puis hauteur de chaque colonne
  const colonnes = [[], []];
  carte.branches.forEach((b, i) => colonnes[i % 2].push(boiteBranche(b, larg)));
  const hauteurCol = col => col.reduce((h, boite) => h + boite.hauteur, 0) + ecart * (col.length - 1);
  const hauteur = Math.max(hauteurCol(colonnes[0]), hauteurCol(colonnes[1]), 330) + 52;
  const cx = (marge + largeur - 16) / 2, cy = hauteur / 2 - 30;
  const centre = centreSvg(carte.centre, cx, cy, largCentre);
  // Placement des encadrés (chaque colonne centrée verticalement) et des flèches depuis la bulle
  let liens = '', boites = '';
  colonnes.forEach((col, c) => {
    const x = c === 0 ? marge : largeur - 16 - larg;
    let y = (hauteur - hauteurCol(col)) / 2;
    for (const boite of col) {
      const depart = c === 0 ? cx - largCentre / 2 : cx + largCentre / 2;
      const arrivee = c === 0 ? x + larg + 2 : x - 2;
      liens += flecheSvg(depart, cy, arrivee, y + boite.hauteur / 2, 'etoile');
      boites += boiteSvg(boite, x, y, larg);
      y += boite.hauteur + ecart;
    }
  });
  // Décor dans les espaces libres du milieu : brin au-dessus de la bulle, post-it et brin en dessous
  const yPostit = cy + centre.hauteur / 2 + 40;
  const decor = brinSvg(cx + 24, 10, 100, 1.1)
    + postitSvg(cx - 70, yPostit)
    + brinSvg(cx + 78, yPostit + 70, -25, 0.9);
  return enveloppeSvg(largeur, hauteur, liens + boites + centre.svg + decor, 'etoile', entete);
}

// Bloc affiché dans la fiche d'un cours : les deux dispositions (le CSS montre la bonne) et le bouton d'export.
function carteMentaleHtml(carte) {
  return `<section class="carte-mentale">
      ${carteMentalePileSvg(carte)}
      ${carteMentaleEtoileSvg(carte)}
      <button id="carte-image-btn" class="secondary">🖼️ Enregistrer en image</button>
      <p id="carte-image-info" class="subtitle"></p>
    </section>`;
}

// ── Export en image (navigateur) ──

// Bloc de définitions qui embarque la police manuscrite dans le SVG : une image ne peut pas charger
// de police externe, sans cela l'image enregistrée retomberait sur une police quelconque.
async function policeEmbarquee() {
  const octets = new Uint8Array(await (await fetch(CARTE_FICHIER_POLICE)).arrayBuffer());
  let binaire = '';
  for (let i = 0; i < octets.length; i += 0x8000) binaire += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return `<defs><style>@font-face{font-family:'Caveat';font-weight:600;src:url(data:font/woff2;base64,${btoa(binaire)}) format('woff2');}</style></defs>`;
}

// Convertit un SVG en image PNG (deux fois plus grande, pour rester nette) ; renvoie un Blob.
function svgEnPng(svgTexte, largeur, hauteur) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Court délai : Safari applique parfois la police embarquée juste après le chargement de l'image
      setTimeout(() => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = largeur * 2;
          canvas.height = hauteur * 2;
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('image impossible à créer'))), 'image/png');
        } catch (err) {
          reject(err);
        }
      }, 150);
    };
    img.onerror = () => reject(new Error('image impossible à créer'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgTexte);
  });
}

// Enregistre la carte en image : menu de partage du téléphone (« Enregistrer l'image »), sinon téléchargement.
async function enregistrerCarteImage(carte, titre) {
  const etoile = window.matchMedia('(min-width: 640px), (orientation: landscape)').matches;
  const entete = await policeEmbarquee();
  const svg = etoile ? carteMentaleEtoileSvg(carte, entete) : carteMentalePileSvg(carte, entete);
  const [, l, h] = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  const blob = await svgEnPng(svg, Number(l), Number(h));
  const nom = `carte-mentale-${String(titre).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cours'}.png`;
  const fichier = new File([blob], nom, { type: 'image/png' });
  if (navigator.canShare?.({ files: [fichier] })) {
    await navigator.share({ files: [fichier], title: titre });
    return 'partage';
  }
  const lien = document.createElement('a');
  lien.href = URL.createObjectURL(blob);
  lien.download = nom;
  lien.click();
  setTimeout(() => URL.revokeObjectURL(lien.href), 10000);
  return 'telechargement';
}
