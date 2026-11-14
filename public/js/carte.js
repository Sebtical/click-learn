// Cartes mentales : l'IA rédige le contenu (centre, branches, mots-clés), l'appli dessine la carte en SVG.
// Deux dispositions : « pile » (téléphone tenu droit) et « étoile » (téléphone tourné, ordinateur).
// Règle dure : tout texte venant de l'IA est échappé avant d'entrer dans le SVG.

// ── Réglages ──
const CARTE_MAX_BRANCHES = 6;
const CARTE_MAX_ELEMENTS = 5;
const CARTE_LONGUEUR_MAX = 90; // caractères d'un titre ou d'un élément, au-delà c'est coupé
// Couleurs des branches (fond, bordure) : les pastels du design de l'appli
const CARTE_COULEURS = [
  ['#E9E7FD', '#8B8CF2'], ['#FDE6D6', '#F2A273'], ['#DDF6EA', '#3FB884'],
  ['#E0EEFD', '#5B9BE6'], ['#FDE3EE', '#E8789F'], ['#FFF2CC', '#D9A400']
];
const CARTE_POLICE = "'Nunito', 'Segoe UI', system-ui, sans-serif";

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

// Boîte d'une branche : lignes du titre et des éléments, et hauteur totale pour une largeur donnée.
function boiteBranche(branche, largeur) {
  const maxCar = Math.floor((largeur - 34) / 7.6); // ≈ largeur d'un caractère en 14 px
  const titre = couperLignes(branche.titre, Math.floor((largeur - 28) / 8.6));
  const elements = branche.elements.map(e => couperLignes(e, maxCar));
  const hauteur = 16 + titre.length * 20 + 6 + elements.reduce((h, l) => h + l.length * 19 + 4, 0) + 10;
  return { titre, elements, hauteur };
}

// SVG d'une boîte de branche placée en (x, y), avec sa couleur.
function boiteSvg(boite, x, y, largeur, [fond, bord]) {
  let ligneY = y + 30;
  const titre = boite.titre.map(l => {
    const t = `<text x="${x + 14}" y="${ligneY}" font-weight="800" font-size="16" fill="#1E1C3F">${echapperHtml(l)}</text>`;
    ligneY += 20;
    return t;
  }).join('');
  ligneY += 6;
  const elements = boite.elements.map(lignes => {
    const puce = `<circle cx="${x + 18}" cy="${ligneY - 5}" r="2.6" fill="${bord}"/>`;
    const texte = lignes.map(l => {
      const t = `<text x="${x + 28}" y="${ligneY}" font-size="14" fill="#3B3860">${echapperHtml(l)}</text>`;
      ligneY += 19;
      return t;
    }).join('');
    ligneY += 4;
    return puce + texte;
  }).join('');
  return `<rect x="${x}" y="${y}" width="${largeur}" height="${boite.hauteur}" rx="18" fill="${fond}" stroke="${bord}" stroke-width="2"/>${titre}${elements}`;
}

// SVG du centre de la carte (titre du cours), centré sur (cx, cy).
function centreSvg(centre, cx, cy, largeur) {
  const lignes = couperLignes(centre, Math.floor((largeur - 30) / 11.5));
  const hauteur = 30 + lignes.length * 26;
  const y0 = cy - hauteur / 2;
  const textes = lignes.map((l, i) =>
    `<text x="${cx}" y="${y0 + 36 + i * 26}" text-anchor="middle" font-weight="800" font-size="22" fill="#FFFFFF">${echapperHtml(l)}</text>`).join('');
  return {
    hauteur,
    svg: `<rect x="${cx - largeur / 2}" y="${y0}" width="${largeur}" height="${hauteur}" rx="22" fill="#5B5BD6"/>${textes}`
  };
}

// Enveloppe SVG commune : fond clair, police de l'appli.
function enveloppeSvg(largeur, hauteur, contenu, disposition) {
  return `<svg xmlns="http://www.w3.org/2000/svg" class="carte-svg carte-${disposition}" viewBox="0 0 ${largeur} ${hauteur}" width="${largeur}" height="${hauteur}" font-family="${CARTE_POLICE}">`
    + `<rect width="${largeur}" height="${hauteur}" fill="#FBFAFF"/>${contenu}</svg>`;
}

// ── Les deux dispositions ──

// Carte « pile » : centre en haut, branches empilées, reliées par un trait vertical (téléphone tenu droit).
function carteMentalePileSvg(carte) {
  const largeur = 360, marge = 16, larg = largeur - marge * 2 - 20;
  // La hauteur du centre ne dépend que de son texte : on la calcule d'abord pour le placer en haut
  const hauteurCentre = centreSvg(carte.centre, 0, 0, largeur - marge * 2).hauteur;
  const centre = centreSvg(carte.centre, largeur / 2, marge + hauteurCentre / 2, largeur - marge * 2);
  let y = marge + centre.hauteur + 24;
  const boites = carte.branches.map((b, i) => {
    const boite = boiteBranche(b, larg);
    const svg = boiteSvg(boite, marge + 20, y, larg, CARTE_COULEURS[i % CARTE_COULEURS.length]);
    const lien = `<path d="M ${marge + 8} ${y + 22} H ${marge + 20}" stroke="#B9B6E8" stroke-width="3" stroke-linecap="round"/>`;
    const milieu = y + 22;
    y += boite.hauteur + 16;
    return { svg: lien + svg, milieu };
  });
  const tronc = `<path d="M ${marge + 8} ${marge + centre.hauteur} V ${boites[boites.length - 1].milieu}" stroke="#B9B6E8" stroke-width="3" stroke-linecap="round"/>`;
  return enveloppeSvg(largeur, y + marge - 16, tronc + centre.svg + boites.map(b => b.svg).join(''), 'pile');
}

// Carte « étoile » : centre au milieu, branches à gauche et à droite, reliées par des courbes.
function carteMentaleEtoileSvg(carte) {
  const largeur = 760, marge = 20, larg = 250, ecart = 18, largCentre = 190;
  // Répartition alternée gauche / droite, puis hauteur de chaque colonne
  const colonnes = [[], []];
  carte.branches.forEach((b, i) => colonnes[i % 2].push({ boite: boiteBranche(b, larg), couleur: CARTE_COULEURS[i % CARTE_COULEURS.length] }));
  const hauteurCol = col => col.reduce((h, e) => h + e.boite.hauteur, 0) + ecart * (col.length - 1);
  const hauteur = Math.max(hauteurCol(colonnes[0]), hauteurCol(colonnes[1]), 200) + marge * 2;
  const cx = largeur / 2, cy = hauteur / 2;
  const centre = centreSvg(carte.centre, cx, cy, largCentre);
  // Placement des boîtes, chaque colonne centrée verticalement, et des liens vers le centre
  let liens = '', boites = '';
  colonnes.forEach((col, c) => {
    const x = c === 0 ? marge : largeur - marge - larg;
    let y = (hauteur - hauteurCol(col)) / 2;
    for (const { boite, couleur } of col) {
      const bordInterne = c === 0 ? x + larg : x;
      const depart = c === 0 ? cx - largCentre / 2 : cx + largCentre / 2;
      const yb = y + boite.hauteur / 2;
      liens += `<path d="M ${depart} ${cy} C ${(depart + bordInterne) / 2} ${cy}, ${(depart + bordInterne) / 2} ${yb}, ${bordInterne} ${yb}" fill="none" stroke="${couleur[1]}" stroke-width="3" stroke-linecap="round"/>`;
      boites += boiteSvg(boite, x, y, larg, couleur);
      y += boite.hauteur + ecart;
    }
  });
  return enveloppeSvg(largeur, hauteur, liens + boites + centre.svg, 'etoile');
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

// Convertit un SVG en image PNG (deux fois plus grande, pour rester nette) ; renvoie un Blob.
function svgEnPng(svgTexte, largeur, hauteur) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = largeur * 2;
        canvas.height = hauteur * 2;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('image impossible à créer'))), 'image/png');
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('image impossible à créer'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgTexte);
  });
}

// Enregistre la carte en image : menu de partage du téléphone (« Enregistrer l'image »), sinon téléchargement.
async function enregistrerCarteImage(carte, titre) {
  const etoile = window.matchMedia('(min-width: 640px), (orientation: landscape)').matches;
  const svg = etoile ? carteMentaleEtoileSvg(carte) : carteMentalePileSvg(carte);
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
