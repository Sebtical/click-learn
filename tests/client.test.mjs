// Tests du code exécuté dans le navigateur : correction des réponses, générateurs de questions,
// calculs de l'espace parent. Les vrais fichiers de public/js sont chargés dans un bac à sable
// Node (module vm), comme le navigateur les charge : scripts globaux, dans l'ordre d'index.html.
// Lancement : node --test tests/ (aucune dépendance).

// ── Chargement des scripts de l'appli ──
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const SCRIPTS = ['storage', 'quizkit', 'figures-maths', 'generators-maths', 'generators-francais', 'localquiz', 'sync', 'parent'];
const bacASable = vm.createContext({ console, state: { quizzes: [] } });
for (const nom of SCRIPTS) {
  vm.runInContext(readFileSync(new URL(`../public/js/${nom}.js`, import.meta.url), 'utf8'), bacASable, { filename: `${nom}.js` });
}
// Donne accès à une fonction ou constante globale de l'appli.
const appli = nom => vm.runInContext(nom, bacASable);

const estReponseNumJuste = appli('estReponseNumJuste');
const comparerFraction = appli('comparerFraction');
const fmtNum = appli('fmtNum');
const normalizeText = appli('normalizeText');
const NB_TIRAGES = 3000; // tirages par générateur et par niveau de difficulté

// ── Réponses numériques ──
test('réponses numériques justes acceptées (questions locales, égalité exacte)', () => {
  for (const [saisie, attendu] of [
    ['1 080', 1080], ['1 080', 1080], ['1 080', 1080], ['1080', 1080],
    ['2,3', 2.3], ['2.3', 2.3], ['−8', -8], ['-8', -8], ['(−8)', -8], ['+5', 5],
    ['12 €', 12], ['45°', 45], ['6,15', 6.15], ['0,1', 0.1]
  ]) assert.equal(estReponseNumJuste(saisie, attendu, true), true, `« ${saisie} » devrait valoir ${attendu}`);
});

test('réponses numériques fausses refusées (questions locales)', () => {
  for (const [saisie, attendu] of [
    ['2,29', 2.3], ['2,31', 2.3], ['6,159', 6.15], ['6,151', 6.15], ['1/2', 1], ['3+4', 7],
    ['', 0], ['abc', 0], ['8', -8], ['1 08', 1080]
  ]) assert.equal(estReponseNumJuste(saisie, attendu, true), false, `« ${saisie} » ne devrait pas valoir ${attendu}`);
});

test('questions IA : égalité à l\'arrondi au centième', () => {
  assert.equal(estReponseNumJuste('3,33', 10 / 3), true);
  assert.equal(estReponseNumJuste('3,3', 10 / 3), false);
  assert.equal(estReponseNumJuste('2,29', 2.3), false);
});

// ── Fractions ──
test('toute fraction égale est juste, la simplification est repérée', () => {
  const cas = [
    ['10/8', 5, 4, true, false], ['5/4', 10, 8, true, true], ['5/10', 10, 20, true, false],
    ['1/2', 10, 20, true, true], ['2', 4, 2, true, true], ['4/2', 4, 2, true, false],
    [' 10 / 8 ', 5, 4, true, false], ['3/4', 5, 4, false, true], ['1/0', 1, 2, false, false], ['abc', 1, 2, false, false]
  ];
  for (const [saisie, num, den, juste, simplifiee] of cas) {
    const r = comparerFraction(saisie, num, den);
    assert.equal(r.juste, juste, `« ${saisie} » pour ${num}/${den}`);
    if (juste) assert.equal(r.simplifiee, simplifiee, `simplification de « ${saisie} »`);
  }
});

// ── Ce que voit le parent ──
test('la bonne réponse vue par le parent est le texte montré à l\'élève', () => {
  const texteBonneReponse = appli('texteBonneReponse');
  assert.equal(texteBonneReponse({ type: 'num', answer: 1080, unit: 'cm³' }), '1 080 cm³');
  assert.equal(texteBonneReponse({ type: 'num', answer: -8, unit: '' }), '−8');
  assert.equal(texteBonneReponse({ type: 'num', answer: 2.3, unit: '€' }), '2,3 €');
  assert.equal(texteBonneReponse({ type: 'qcm', choix: ['a', 'b'], correctIndex: 1 }), 'b');
  assert.equal(texteBonneReponse({ type: 'qcm-multi', choix: ['a', 'b', 'c'], correctIndexes: [0, 2] }), 'a, c');
  assert.equal(texteBonneReponse({ type: 'court', reponses: ['10/20', '1/2'] }), '1/2');
});

test('pourcentages arrondis sans erreur de décimales binaires', () => {
  const pourcentage = appli('pourcentage');
  assert.equal(pourcentage(29, 200), 15);
  assert.equal(pourcentage(1, 3), 33);
  assert.equal(pourcentage(2, 3), 67);
  const groupes = appli('regrouper')([{ correct: 1, date: 'a', matiere: 'M' }, { correct: 0, date: 'b', matiere: 'M' }], t => t.matiere);
  // JSON : les objets du bac à sable n'ont pas le même prototype que ceux de Node
  assert.deepEqual(JSON.parse(JSON.stringify(groupes)), [{ cle: 'M', total: 2, justes: 1, derniere: 'b', pct: 50 }]);
});

// ── Vocabulaire ──
test('un mauvais choix de vocabulaire n\'est jamais aussi une bonne réponse', () => {
  const pool = appli('mauvaisChoixVocabulaire')('content', 'mécontent');
  for (const interdit of ['content', 'mécontent', 'heureux', 'triste']) assert.ok(!pool.includes(interdit), interdit);
  const poolGrand = appli('mauvaisChoixVocabulaire')('grand', 'petit');
  assert.ok(!poolGrand.includes('minuscule'), 'minuscule est aussi un contraire de grand');
  assert.ok(poolGrand.length >= 3, 'il reste assez de mauvais choix');
});

// ── Générateurs : tirages en masse ──

// Contrôle une question générée ; renvoie la liste des anomalies trouvées.
function anomalies(q) {
  const pb = [];
  if (typeof q.enonce !== 'string' || !q.enonce.trim()) pb.push('énoncé vide');
  if (q.type === 'qcm') {
    if (new Set(q.choix).size !== q.choix.length) pb.push(`choix en double : ${q.choix}`);
    if (!(q.correctIndex >= 0 && q.correctIndex < q.choix.length)) pb.push('bonne réponse absente des choix');
    if (q.choix.length < 2) pb.push('moins de deux choix');
  } else if (q.type === 'qcm-multi') {
    if (new Set(q.choix).size !== q.choix.length) pb.push('choix en double');
    if (new Set(q.correctIndexes).size !== q.correctIndexes.length || q.correctIndexes.some(i => i < 0)) pb.push('bonnes réponses invalides');
  } else if (q.type === 'num') {
    if (!Number.isFinite(q.answer)) pb.push(`réponse non finie : ${q.answer}`);
    if (Math.abs(q.answer * 100 - Math.round(q.answer * 100)) > 1e-6) pb.push(`plus de 2 décimales : ${q.answer}`);
    if (!estReponseNumJuste(fmtNum(q.answer), q.answer, q.exacte)) pb.push(`la réponse affichée ${fmtNum(q.answer)} serait refusée`);
  } else if (q.type === 'court') {
    if (!q.reponses.length || q.reponses.some(r => !normalizeText(r))) pb.push('réponse attendue vide');
    if (q.fraction) {
      if (q.reponses.some(r => !comparerFraction(r, ...q.fraction).juste)) pb.push(`forme acceptée fausse : ${q.reponses}`);
      if (!comparerFraction(q.reponses[q.reponses.length - 1], ...q.fraction).simplifiee) pb.push('bonne réponse affichée non simplifiée');
    }
  }
  const angle = /Angle de (\d+) degrés/.exec(q.fig || '');
  if (q.notion === 'angles : classer un angle' && angle) {
    const mesure = Number(angle[1]);
    if (mesure !== 90 && mesure > 75 && mesure < 105) pb.push(`angle ambigu à l'œil : ${mesure}°`);
  }
  if (/^vocabulaire : (antonymes|synonymes)$/.test(q.notion) && q.type === 'qcm') {
    const mot = /"([^"]+)"/.exec(q.enonce)[1];
    const autorises = appli('mauvaisChoixVocabulaire')(mot, q.choix[q.correctIndex]);
    q.choix.filter((_, i) => i !== q.correctIndex).forEach(w => { if (!autorises.includes(w)) pb.push(`mauvais choix ambigu : ${w}`); });
  }
  return pb;
}

for (const [matiere, nomGenerateurs] of [['Maths', 'G_MATHS'], ['Français', 'G_FR']]) {
  test(`${matiere} : chaque générateur, ${NB_TIRAGES} tirages par niveau, sans anomalie`, () => {
    const erreurs = [];
    for (const [theme, generateurs] of Object.entries(appli(nomGenerateurs))) {
      generateurs.forEach((genere, i) => {
        for (const difficile of [false, true]) {
          for (let n = 0; n < NB_TIRAGES; n++) {
            const pb = anomalies(genere(difficile));
            if (pb.length) { erreurs.push(`${theme}[${i}]${difficile ? ' (défi)' : ''} : ${pb[0]}`); break; }
          }
        }
      });
    }
    assert.deepEqual(erreurs, []);
  });
}

test('un quiz surprise garde le thème de chaque question', () => {
  const questions = appli('generateLocalQuiz')('Maths', null, 'normal', 50);
  const themes = Object.keys(appli('G_MATHS'));
  assert.ok(questions.every(q => themes.includes(q.theme)));
});
