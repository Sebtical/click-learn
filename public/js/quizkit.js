// Outils partagés par les générateurs de questions locaux (aucun appel API)
// et règles de correction des réponses saisies (utilisées par quiz.js).

// ── Hasard et arithmétique ──
const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const shuffle = arr => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const gcd = (a, b) => b ? gcd(b, a % b) : a;

// ── Mise en forme ──

// Écrit un nombre à la française : virgule décimale, espace entre milliers, vrai signe moins.
function fmtNum(x) {
  const r = Math.round(x * 1e6) / 1e6;
  const [i, d] = String(Math.abs(r)).split('.');
  const iSpaced = i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (r < 0 ? '−' : '') + iSpaced + (d ? ',' + d : '');
}

// Met un texte sous une forme comparable : sans accents, sans majuscules, espaces simplifiés.
function normalizeText(s) {
  return s.toString().trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*\/\s*/g, '/'); // "19 / 15" et "19/15" doivent être équivalents (réponses en fraction)
}

// Texte de la bonne réponse d'une question, quel que soit son type (null pour une question ouverte).
// Seule source de ce texte : montré à l'élève après deux essais et enregistré pour l'espace parent.
function texteBonneReponse(q) {
  if (!q) return null;
  if (q.type === 'qcm') return q.choix?.[q.correctIndex] ?? null;
  if (q.type === 'qcm-multi') return (q.correctIndexes || []).map(i => q.choix[i]).join(', ');
  if (q.type === 'num') return fmtNum(q.answer) + (q.unit ? ` ${q.unit}` : '');
  if (q.type === 'court') return q.reponses?.[q.reponses.length - 1] ?? null;
  return null;
}

// Pourcentage arrondi, calculé sur des entiers (29/200 donne bien 15 et non 14 à cause des décimales binaires).
function pourcentage(justes, total) {
  return Math.round((justes * 100) / total);
}

// ── Correction des réponses saisies ──

// Lit un nombre tapé par l'élève ; renvoie NaN si la saisie n'est pas un nombre simple.
// Acceptés : espaces de milliers (« 1 080 »), virgule ou point, vrai signe moins (−), parenthèses
// autour (« (−8) ») et une unité collée à la fin (« 12 € », « 45° »). Refusés : « 1/2 », « 3+4 ».
function lireNombre(saisie) {
  let s = String(saisie).replace(/[\s  ]/g, '').replace(/[−–]/g, '-').replace(',', '.');
  const entreParentheses = /^\((.*)\)$/.exec(s);
  if (entreParentheses) s = entreParentheses[1];
  const m = /^([+-]?\d+(?:\.\d+)?)[a-zA-Z€°%²³]*$/.exec(s);
  return m ? Number(m[1]) : NaN;
}

// Ajoute ou retire le signe moins devant une saisie (bouton ± : le clavier chiffres de l'iPhone n'a pas de touche moins).
function basculerSigne(saisie) {
  const s = String(saisie).trim();
  return /^[-−]/.test(s) ? s.slice(1) : '−' + s;
}

// Vrai si la saisie vaut la réponse attendue. Questions locales (exacte) : égalité stricte,
// car leurs réponses sont des décimaux exacts. Questions IA : égalité à l'arrondi au centième près.
function estReponseNumJuste(saisie, attendu, exacte = false) {
  const n = lireNombre(saisie);
  if (isNaN(n)) return false;
  const ecart = Math.abs(n - attendu);
  return exacte ? ecart < 1e-9 * Math.max(1, Math.abs(attendu)) : ecart < 0.005 + 1e-9;
}

// Compare une fraction saisie (« 10/8 » ou un entier) à num/den par produit en croix.
// Renvoie { juste, simplifiee } : une fraction égale mais non simplifiée est juste.
function comparerFraction(saisie, num, den) {
  const m = /^(\d+)(?:\/(\d+))?$/.exec(String(saisie).replace(/\s/g, ''));
  if (!m) return { juste: false, simplifiee: false };
  const a = Number(m[1]), b = m[2] === undefined ? 1 : Number(m[2]);
  if (b === 0) return { juste: false, simplifiee: false };
  return { juste: a * den === b * num, simplifiee: gcd(a, b) === 1 };
}

// Formes affichées d'une réponse en fraction : telle quelle, puis simplifiée (ou l'entier).
// La dernière forme est celle montrée comme « bonne réponse ».
function fracAnswers(num, den) {
  const g = gcd(num, den);
  const sNum = num / g, sDen = den / g;
  const forms = new Set([`${num}/${den}`]);
  forms.add(sDen === 1 ? `${sNum}` : `${sNum}/${sDen}`);
  return [...forms];
}

// ── Questions venues de l'IA ──

// Prépare une question renvoyée par l'IA : nouvel identifiant, et retrait de la figure,
// seul champ affiché sans échappement (réservé aux figures SVG de figures-maths.js).
function questionDepuisIA(q) {
  const { fig, ...reste } = q || {};
  return { id: uid(), ...reste };
}

// ── Fabriques de questions ──

// Questions QCM : même format que celui déjà utilisé par les quiz générés par l'IA
// (choix + correctIndex + pisteReflexion), pour être rendues sans aucun changement dans quiz.js.
function qcm(notion, enonce, correct, wrongs, pisteReflexion) {
  const choix = shuffle([correct, ...new Set(wrongs)].filter((v, i, a) => a.indexOf(v) === i));
  return { type: 'qcm', notion, enonce, choix, correctIndex: choix.indexOf(correct), pisteReflexion };
}

// Réponse numérique exacte (questions locales : voir estReponseNumJuste).
function numQ(notion, enonce, answer, pisteReflexion, unit = '') {
  return { type: 'num', notion, enonce, answer, unit, pisteReflexion, exacte: true };
}

// Réponse courte : comparée après normalisation (accents, casse, espaces) à une ou plusieurs formes acceptées.
function courtQ(notion, enonce, reponses, pisteReflexion) {
  return { type: 'court', notion, enonce, reponses: Array.isArray(reponses) ? reponses : [reponses], pisteReflexion };
}

// Réponse en fraction : toute fraction égale est acceptée (voir comparerFraction).
function fractionQ(notion, enonce, num, den, pisteReflexion) {
  return { ...courtQ(notion, enonce, fracAnswers(num, den), pisteReflexion), fraction: [num, den] };
}

// QCM à réponses multiples : l'élève doit cocher toutes les bonnes réponses (et seulement elles).
// Les doublons sont retirés, sinon une bonne réponse en double rendrait la question impossible.
function qcmMulti(notion, enonce, corrects, wrongs, pisteReflexion) {
  const bonnes = [...new Set(corrects)];
  const choix = shuffle([...bonnes, ...new Set(wrongs)].filter((v, i, a) => a.indexOf(v) === i));
  const correctIndexes = bonnes.map(c => choix.indexOf(c)).sort((a, b) => a - b);
  return { type: 'qcm-multi', notion, enonce, choix, correctIndexes, pisteReflexion };
}
