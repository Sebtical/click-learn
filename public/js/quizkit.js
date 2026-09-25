// Outils partagés par les générateurs de questions locaux (aucun appel API).

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

function fmtNum(x) {
  const r = Math.round(x * 1e6) / 1e6;
  const [i, d] = String(Math.abs(r)).split('.');
  const iSpaced = i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (r < 0 ? '−' : '') + iSpaced + (d ? ',' + d : '');
}

function normalizeText(s) {
  return s.toString().trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*\/\s*/g, '/'); // "19 / 15" et "19/15" doivent être équivalents (réponses en fraction)
}

// Formes acceptées pour une réponse en fraction : la fraction telle quelle, et sa forme simplifiée
// (ou l'entier si elle se simplifie en nombre entier) — utilisé avec courtQ.
function fracAnswers(num, den) {
  const g = gcd(num, den);
  const sNum = num / g, sDen = den / g;
  const forms = new Set([`${num}/${den}`]);
  forms.add(sDen === 1 ? `${sNum}` : `${sNum}/${sDen}`);
  return [...forms];
}

// Questions QCM : même format que celui déjà utilisé par les quiz générés par l'IA
// (choix + correctIndex + pisteReflexion), pour être rendues sans aucun changement dans quiz.js.
function qcm(notion, enonce, correct, wrongs, pisteReflexion) {
  const choix = shuffle([correct, ...new Set(wrongs)].filter((v, i, a) => a.indexOf(v) === i));
  return { type: 'qcm', notion, enonce, choix, correctIndex: choix.indexOf(correct), pisteReflexion };
}

// Réponse numérique, comparée avec une petite tolérance pour les décimaux.
function numQ(notion, enonce, answer, pisteReflexion, unit = '') {
  return { type: 'num', notion, enonce, answer, unit, pisteReflexion };
}

// Réponse courte : comparée après normalisation (accents, casse, espaces) à une ou plusieurs formes acceptées.
function courtQ(notion, enonce, reponses, pisteReflexion) {
  return { type: 'court', notion, enonce, reponses: Array.isArray(reponses) ? reponses : [reponses], pisteReflexion };
}

// QCM à réponses multiples : l'élève doit cocher toutes les bonnes réponses (et seulement elles).
function qcmMulti(notion, enonce, corrects, wrongs, pisteReflexion) {
  const choix = shuffle([...corrects, ...wrongs]);
  const correctIndexes = corrects.map(c => choix.indexOf(c)).sort((a, b) => a - b);
  return { type: 'qcm-multi', notion, enonce, choix, correctIndexes, pisteReflexion };
}
