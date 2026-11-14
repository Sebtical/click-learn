// Tests du code exécuté dans le navigateur : correction des réponses, générateurs de questions,
// calculs de l'espace parent. Les vrais fichiers de public/js sont chargés dans un bac à sable
// Node (module vm), comme le navigateur les charge : scripts globaux, dans l'ordre d'index.html.
// Lancement : node --test tests/ (aucune dépendance).

// ── Chargement des scripts de l'appli ──
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const SCRIPTS = ['storage', 'api', 'prompts', 'habillage', 'quizkit', 'figures-maths', 'generators-maths', 'generators-francais', 'localquiz', 'sync', 'parent', 'quiz', 'cours', 'carte'];
const bacASable = vm.createContext({
  console, setTimeout,
  state: { quizzes: [] },
  localStorage: { setItem() {}, getItem() { return null; } } // la sauvegarde est sans effet dans les tests
});
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

test('le bouton ± ajoute puis retire le signe, et la saisie reste comprise', () => {
  const basculerSigne = appli('basculerSigne');
  assert.equal(basculerSigne('8'), '−8');
  assert.equal(basculerSigne('−8'), '8');
  assert.equal(basculerSigne('-8'), '8');
  assert.equal(basculerSigne(''), '−'); // signe d'abord, chiffres ensuite
  assert.equal(estReponseNumJuste(basculerSigne('8'), -8, true), true);
  assert.equal(estReponseNumJuste(basculerSigne('') + '12,5', -12.5, true), true);
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
  assert.deepEqual(JSON.parse(JSON.stringify(groupes)), [{ cle: 'M', total: 2, justes: 1, derniere: 'b', matiere: 'M', pct: 50 }]);
});

// ── Partage avec le serveur (sync.js) ──

// État d'un appareil enfant prêt à partager, avec une première réponse.
function etatEnfant() {
  return {
    role: 'enfant', reprise: 'faite', accessCode: 'x', profile: { prenom: 'T', niveau: '5ème' },
    attempts: [{ id: 'a1', correct: true, date: 'd' }], lessons: [], quizzes: []
  };
}

test('une réponse arrivée pendant un envoi en cours part aussi', async () => {
  const envois = [];
  let libererPremierEnvoi;
  const accepte = () => new Response('{"recus":1,"ignores":0}');
  bacASable.fetch = (url, options) => {
    envois.push(JSON.parse(options.body));
    if (envois.length === 1) return new Promise(r => { libererPremierEnvoi = () => r(accepte()); });
    return Promise.resolve(accepte());
  };
  bacASable.state = etatEnfant();
  const synchroniser = appli('synchroniser');

  const premierEnvoi = synchroniser();
  bacASable.state.attempts.push({ id: 'a2', correct: false, date: 'd' }); // réponse pendant l'envoi
  synchroniser();
  libererPremierEnvoi();
  await premierEnvoi;
  await new Promise(r => setImmediate(r));

  assert.equal(envois.length, 2);
  assert.deepEqual(envois[1].tentatives.map(t => t.id), ['a2']);
  assert.ok(bacASable.state.attempts.every(a => a.synchro === true));
});

test('un envoi refusé ne marque rien comme partagé', async () => {
  bacASable.fetch = () => Promise.resolve(new Response('{"error":{"message":"refus"}}', { status: 403 }));
  bacASable.state = etatEnfant();
  await appli('synchroniser')();
  assert.equal(bacASable.state.attempts[0].synchro, undefined);
});

test('un appareil parent ou non informé n\'envoie rien', async () => {
  let appels = 0;
  bacASable.fetch = () => { appels++; return Promise.resolve({ ok: true }); };
  bacASable.state = { ...etatEnfant(), role: 'parent1' };
  await appli('synchroniser')();
  bacASable.state = { ...etatEnfant(), reprise: null };
  await appli('synchroniser')();
  assert.equal(appels, 0);
  assert.equal(appli('repriseADemander')(), true, 'l\'enfant doit voir l\'écran d\'information, même sans historique');
});

test('les lots du navigateur ne dépassent pas la limite du serveur', () => {
  const serveur = readFileSync(new URL('../worker.js', import.meta.url), 'utf8');
  const limiteServeur = Number(/const TAILLE_MAX_LOT = (\d+)/.exec(serveur)[1]);
  assert.ok(appli('TAILLE_LOT_SYNCHRO') <= limiteServeur);
});

// ── Lecture des réponses du serveur (api.js) ──
test('les erreurs du serveur restent lisibles, même sans JSON', async () => {
  const lireReponse = appli('lireReponse');
  await assert.rejects(lireReponse(new Response('<html>panne</html>', { status: 500 })), /Erreur HTTP 500/);
  await assert.rejects(lireReponse(new Response('{"error":{"message":"Code refusé"}}', { status: 401 })), /Code refusé/);
  await assert.rejects(lireReponse(new Response('pas du json', { status: 200 })), /illisible/);
  assert.deepEqual(JSON.parse(JSON.stringify(await lireReponse(new Response('{"role":"enfant"}')))), { role: 'enfant' });
});

test('l\'écran parent s\'affiche, échappe les textes et signale la troncature', () => {
  const piege = '<img src=x onerror=alert(1)>';
  bacASable.app = { innerHTML: '' };
  bacASable.document = { getElementById: () => ({ addEventListener() {} }) };
  bacASable.masteryBadge = pct => `${pct}%`; // masteryBadge et renderHome sont dans app.js, non chargé ici
  bacASable.renderHome = () => {};
  const ligne = (id, correct, extra = {}) => ({
    id, quiz_id: 'q1', matiere: 'Maths', theme: 'fractions', notion: 'Simplifier', type: 'qcm',
    correct, date: '2026-11-10T10:00:00Z', enonce: 'Simplifie 6/8', reponse_donnee: '2/3', bonne_reponse: '3/4', ...extra
  });
  appli('afficherSuivi')({
    profil: { prenom: 'Léa', niveau: '5ème' }, nbCours: 1, tronque: true,
    cours: [{ matiere: 'SVT', titre: piege, resume: piege, notions: ['noyau', piege], date: '2026-11-12T10:00:00Z' }],
    tentatives: [ligne('a', 0, { reponse_donnee: piege, notion: piege }), ligne('b', 1), ligne('c', 0, { reponse_donnee: null })]
  });
  const page = bacASable.app.innerHTML;
  assert.ok(page.includes('Suivi de Léa'));
  assert.ok(!page.includes('<img'), 'le texte piégé ne doit jamais devenir une balise');
  assert.ok(page.includes('&lt;img'));
  assert.ok(page.includes('non conservée'));
  assert.ok(page.includes('dernières réponses'), 'la troncature doit être signalée');
  assert.match(page, /<b>1<\/b><span>Quiz faits/);
  assert.ok(page.includes('Ses derniers cours'));
  assert.ok(page.includes('noyau'));
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

// ── Habillage : niveaux, anneau de maîtrise, illustrations ──
test('un niveau tous les 50 points, avec le reste à faire', () => {
  const niveau = appli('niveauDepuisPoints');
  assert.deepEqual({ ...niveau(0) }, { niveau: 1, reste: 50, pct: 0 });
  assert.deepEqual({ ...niveau(49) }, { niveau: 1, reste: 1, pct: 98 });
  assert.deepEqual({ ...niveau(50) }, { niveau: 2, reste: 50, pct: 0 });
  assert.deepEqual({ ...niveau(125) }, { niveau: 3, reste: 25, pct: 50 });
  assert.deepEqual({ ...niveau(-3) }, { niveau: 1, reste: 50, pct: 0 }); // valeur absurde : on repart de zéro
  assert.deepEqual({ ...niveau(undefined) }, { niveau: 1, reste: 50, pct: 0 });
});

test('l\'anneau de maîtrise borne le pourcentage et signale un chapitre non testé', () => {
  const anneau = appli('anneauMaitrise');
  assert.match(anneau(null), /Pas encore testé/);
  assert.match(anneau(73), /--p:73;/);
  assert.match(anneau(140), /--p:100;/);
  assert.match(anneau(-5), /--p:0;/);
});

test('une illustration absente affiche le repli, jamais une image cassée', () => {
  const illustration = appli('illustration');
  assert.match(illustration('Maths', '🔢'), /<img class="illu" src="img\/maths\.webp" alt=""/);
  assert.equal(illustration('inconnue', 'X'), 'X');
  vm.runInContext('ILLUSTRATIONS.Maths = null', bacASable);
  try {
    assert.equal(illustration('Maths', '🔢'), '🔢');
  } finally {
    vm.runInContext("ILLUSTRATIONS.Maths = 'img/maths.webp'", bacASable); // ne pas polluer les tests suivants
  }
});

test('chaque illustration déclarée existe bien dans public/img', () => {
  const illustrations = vm.runInContext('ILLUSTRATIONS', bacASable);
  // Chaque matière proposée a son illustration, et chaque fichier déclaré existe
  for (const matiere of Object.keys(vm.runInContext('SUBJECT_ICONS', bacASable))) {
    assert.ok(illustrations[matiere], `pas d'illustration pour ${matiere}`);
  }
  for (const cle of ['banniere', 'trophee', 'photo', 'exercice']) assert.ok(illustrations[cle], cle);
  assert.equal(illustrations.avatar, null); // l'avatar personnel ne vit jamais dans public/
  const chemins = Object.values(illustrations).filter(Boolean);
  for (const chemin of chemins) {
    assert.match(chemin, /^img\/[a-z-]+\.webp$/);
    assert.ok(readFileSync(new URL(`../public/${chemin}`, import.meta.url)).length > 0, chemin);
  }
});

test("l'en-tête d'une fiche montre la vignette si elle existe, et le titre d'une matière perd son emoji", () => {
  const enTete = appli('enTete');
  assert.match(enTete('Maths', 'Programme', 'Maths'), /<img class="page-art" src="img\/maths\.webp"/);
  assert.ok(!enTete('Mes cours', '', 'inconnue').includes('<img'));
  assert.ok(!enTete('Mes cours', '', 'inconnue').includes('subtitle'));
  assert.equal(appli('titreMatiere')('Maths'), 'Maths');
  assert.equal(appli('titreMatiere')('Musique'), '📘 Musique'); // matière sans image : emoji de repli
});

test("un titre de chapitre venu de l'IA est échappé dans la liste", () => {
  const li = appli('chapitreLi')(0, '<img src=x onerror=alert(1)>', 50);
  assert.ok(!li.includes('<img'), li);
  assert.match(li, /&lt;img/);
});

test('la carte de niveau ne prend une image de fond que si la bannière est fournie', () => {
  const banniere = appli('banniereHtml');
  assert.equal(banniere(), '<img class="level-bg" src="img/banniere.webp" alt="">');
  vm.runInContext('ILLUSTRATIONS.banniere = null', bacASable);
  try {
    assert.equal(banniere(), '');
  } finally {
    vm.runInContext("ILLUSTRATIONS.banniere = 'img/banniere.webp'", bacASable);
  }
});

// ── Avatar personnel (gardé sur l'appareil) ──
test("seule une image JPEG encodée par l'appli est acceptée comme avatar", () => {
  const valide = appli('estAvatarValide');
  assert.equal(valide('data:image/jpeg;base64,/9j/4AAQSkZJRg=='), true);
  assert.equal(valide(null), false);
  assert.equal(valide('https://exemple.com/a.jpg'), false); // jamais d'image distante
  assert.equal(valide('data:image/jpeg;base64,abc" onerror="alert(1)'), false); // pas de sortie de l'attribut
  assert.equal(valide('data:image/svg+xml;base64,PHN2Zz4='), false); // un SVG peut contenir du script
  assert.equal(valide('data:image/jpeg;base64,' + 'A'.repeat(200000)), false); // trop lourd
  assert.match(appli('avatarHtml')('data:image/jpeg;base64,/9j/', 'X'), /<img class="illu" src="data:image\/jpeg/);
  assert.equal(appli('avatarHtml')('pas une image', 'X'), 'X');
});

test('le recadrage garde le plus grand carré centré', () => {
  const cadrage = appli('cadrageCarre');
  assert.deepEqual({ ...cadrage(1000, 600) }, { sx: 200, sy: 0, cote: 600 });
  assert.deepEqual({ ...cadrage(600, 1001) }, { sx: 0, sy: 200, cote: 600 });
  assert.deepEqual({ ...cadrage(500, 500) }, { sx: 0, sy: 0, cote: 500 });
});

test("l'avatar est rangé à part : ni dans l'état sauvegardé, ni dans les envois au serveur", async () => {
  const stockage = new Map();
  bacASable.localStorage = {
    getItem: k => (stockage.has(k) ? stockage.get(k) : null),
    setItem: (k, v) => stockage.set(k, String(v)),
    removeItem: k => stockage.delete(k)
  };
  try {
    appli('ecrireAvatar')('data:image/jpeg;base64,/9j/SECRETAVATAR');
    assert.equal(appli('lireAvatar')(), 'data:image/jpeg;base64,/9j/SECRETAVATAR');

    // L'état sauvegardé et les envois de synchro ne contiennent jamais l'image
    const corps = [];
    bacASable.fetch = (url, options) => { corps.push(options.body); return Promise.resolve(new Response('{"recus":1,"ignores":0}')); };
    bacASable.state = etatEnfant();
    await appli('synchroniser')();
    assert.ok(corps.length > 0, 'un envoi devait partir');
    assert.ok(!stockage.get('clicklearn:state').includes('SECRETAVATAR'));
    assert.ok(corps.every(c => !c.includes('SECRETAVATAR')));

    appli('ecrireAvatar')(null);
    assert.equal(appli('lireAvatar')(), null);
  } finally {
    bacASable.localStorage = { setItem() {}, getItem() { return null; } };
  }
});

// ── Écran de quiz : échappement des textes (règle dure) ──
const PIEGE = '<img src=x onerror=alert(1)>';

test("l'écran d'une question échappe énoncé, notion, choix et unité, quel que soit le type", () => {
  const questionHtml = appli('questionHtml');
  const base = { notion: PIEGE, enonce: PIEGE, choix: [PIEGE, 'b'], unit: PIEGE };
  for (const type of ['qcm', 'qcm-multi', 'num', 'court', 'ouverte']) {
    const html = questionHtml({ ...base, type }, 'Question 1/5');
    assert.ok(!html.includes('<img'), `balise non échappée pour le type ${type}`);
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'), type);
  }
});

test("l'indice et la bonne réponse révélée sont échappés", () => {
  const indiceHtml = appli('indiceHtml');
  assert.ok(!indiceHtml(PIEGE).includes('<img'));
  assert.ok(indiceHtml(PIEGE).includes('Réessaie'));
  const revelation = indiceHtml(PIEGE, PIEGE);
  assert.ok(!revelation.includes('<img'));
  assert.ok(revelation.includes('id="next-q"'));
});

test("une question venue de l'IA perd toute figure et reçoit un identifiant", () => {
  const q = appli('questionDepuisIA')({ type: 'qcm', enonce: 'E', fig: '<svg onload=alert(1)>' });
  assert.equal(q.fig, undefined);
  assert.equal(q.enonce, 'E');
  assert.match(q.id, /^id-/);
  // Les figures locales (générateurs) restent affichées
  assert.ok(appli('questionHtml')({ type: 'court', notion: 'n', enonce: 'e', fig: '<svg></svg>' }, 'Q').includes('<svg></svg>'));
});

// ── Écrans des cours et des corrections photo : échappement (règle dure) ──
test("l'aperçu d'un cours photographié échappe titre, résumé et notions venus de l'IA", () => {
  const html = appli('apercuCoursHtml')(
    { matiere: 'SVT', titre: '"><img src=x onerror=alert(1)>', resume: PIEGE, notions: [PIEGE, 'noyau'] },
    ['data:image/jpeg;base64,AAAA'], ['Maths', 'SVT']
  );
  assert.ok(!html.includes('<img src=x'), 'aucune balise injectée');
  assert.ok(html.includes('value="&quot;&gt;&lt;img'), "le titre ne sort pas de l'attribut value");
  assert.ok(html.includes('<option selected>SVT</option>'));
  assert.ok(html.includes('noyau'));
});

test("la fiche d'un cours échappe ses textes et garde les boutons de niveau", () => {
  const html = appli('ficheCoursHtml')(
    { titre: PIEGE, matiere: 'SVT', resume: PIEGE, notions: [PIEGE] },
    [{ id: 'facile', label: 'Facile' }]
  );
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('data-id="facile"'));
  assert.ok(html.includes('class="page-art"'), "vignette de la matière dans l'en-tête");
});

test("la correction d'un exercice photographié échappe énoncé, réponse et commentaire", () => {
  bacASable.mascotSVG = () => '<svg></svg>'; // mascot.js n'est pas chargé ici
  const html = appli('correctionHtml')(
    { matiere: PIEGE, exercices: [{ statut: 'faux', enonce: PIEGE, reponseEleve: PIEGE, feedback: PIEGE }, { statut: 'correct', enonce: 'e', reponseEleve: 'r', feedback: 'Bravo' }] },
    []
  );
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('🔴') && html.includes('✅'));
  assert.ok(html.includes('<p class="ok">Bravo</p>'));
});

// ── Fiches détaillées et cours sur mesure ──
test("la mise en forme d'une fiche échappe le texte avant d'ajouter titres, listes et gras", () => {
  const html = appli('texteRicheHtml')('## Les volcans\n- le **magma**\n- <img src=x onerror=alert(1)>\n\nUn texte.\n### Autre');
  assert.equal(html, '<h3>Les volcans</h3><ul><li>le <strong>magma</strong></li><li>&lt;img src=x onerror=alert(1)&gt;</li></ul><p>Un texte.</p><h3>Autre</h3>');
  assert.equal(appli('texteRicheHtml')(undefined), '');
});

test('une fiche vide ou absente est refusée, une fiche trop longue est bornée', () => {
  const lireFiche = appli('lireFiche');
  assert.equal(lireFiche('   '), null);
  assert.equal(lireFiche(42), null);
  assert.equal(lireFiche('x'.repeat(30000)).length, 20000);
});

test("la fiche détaillée d'un cours signale quand elle vient du résumé et non de la photo", () => {
  const ficheDetailleeHtml = appli('ficheDetailleeHtml');
  assert.match(ficheDetailleeHtml({ fiche: 'a', ficheSource: 'resume' }), /pas de ta photo/);
  assert.doesNotMatch(ficheDetailleeHtml({ fiche: 'a', ficheSource: 'photo' }), /pas de ta photo/);
});

test('un cours sur mesure inutilisable est refusé, ses questions invalides écartées', () => {
  const valider = appli('validerCoursSurMesure');
  assert.equal(valider(null), null);
  assert.equal(valider({ titre: 'T', explications: [{ notion: 'n' }] }), null, 'sans méthode, rien à apprendre');
  const cours = valider({
    titre: ' Fractions ', notions: ['a', 3],
    explications: [{ notion: 'Simplifier', erreur: 'e', methode: 'm', exemple: 'x' }, 'bruit'],
    questions: [
      { type: 'qcm', enonce: 'Q1', choix: ['a', 'b'], correctIndex: 1, fig: '<svg onload=alert(1)>' },
      { type: 'qcm', enonce: 'Q2', choix: ['a', 'b'], correctIndex: 2 },   // bonne réponse inexistante
      { type: 'num', enonce: 'Q3', answer: '12' },                          // réponse non numérique
      { type: 'num', enonce: 'Q4', answer: 1.5 },
      { type: 'ouverte', enonce: 'Q5' }                                     // type non prévu ici
    ]
  });
  assert.equal(cours.titre, 'Fractions');
  assert.deepEqual([...cours.notions], ['a']);
  assert.equal(cours.explications.length, 1);
  assert.deepEqual(cours.questions.map(q => q.enonce), ['Q1', 'Q4']);
  assert.equal(cours.questions[0].fig, undefined);
});

test("les erreurs d'un quiz partent vers l'IA avec la bonne réponse vérifiée, sans les réponses justes", () => {
  const erreurs = appli('erreursDuQuiz')([
    { correct: true, notion: 'ok', enonce: 'juste' },
    { correct: false, notion: 'Fractions', enonce: 'Simplifie 6/8', reponseDonnee: '2/3', bonneReponse: '3/4', id: 'x' }
  ]);
  assert.deepEqual(erreurs.map(e => ({ ...e })), [{ notion: 'Fractions', enonce: 'Simplifie 6/8', reponseDonnee: '2/3', bonneReponse: '3/4' }]);
  const prompt = appli('coursSurMesurePrompt')('5ème', 'Maths', erreurs);
  assert.ok(prompt.includes('Bonne réponse : 3/4'));
  assert.ok(prompt.includes("Réponse de l'élève : 2/3"));
});

test("la fiche d'un cours sur mesure montre ses explications échappées et le mini-quiz", () => {
  const ficheCoursHtml = appli('ficheCoursHtml');
  const surMesure = ficheCoursHtml({
    type: 'sur-mesure', titre: 'T', matiere: 'Maths', resume: '', notions: [],
    explications: [{ notion: PIEGE, erreur: PIEGE, methode: '- étape **1**', exemple: PIEGE }],
    questions: [{ type: 'num', enonce: 'Q', answer: 1 }]
  }, []);
  assert.ok(!surMesure.includes('<img src=x'));
  assert.ok(surMesure.includes('id="mini-quiz-btn"'));
  assert.ok(surMesure.includes('<li>étape <strong>1</strong></li>'));
  assert.ok(!surMesure.includes('fiche-btn'));
  const normal = ficheCoursHtml({ titre: 'T', matiere: 'SVT', resume: '', notions: [] }, []);
  assert.ok(normal.includes('id="fiche-btn"') && !normal.includes('mini-quiz-btn'));
});

test("seuls titre, matière, résumé, notions et date d'un cours partent vers l'espace parent", () => {
  const partage = appli('coursPourPartage')({
    id: 'c1', matiere: 'SVT', titre: 'T', resume: 'r', notions: ['n'], date: 'd',
    fiche: 'longue fiche', explications: [{}], questions: [{}], synchro: true, type: 'sur-mesure'
  });
  assert.deepEqual(Object.keys(partage).sort(), ['date', 'id', 'matiere', 'notions', 'resume', 'titre']);
});

test("l'icône de l'écran d'accueil iPhone est déclarée et existe", () => {
  const page = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(page, /<link rel="apple-touch-icon" href="apple-touch-icon.png">/);
  const icone = readFileSync(new URL('../public/apple-touch-icon.png', import.meta.url));
  assert.deepEqual([...icone.subarray(1, 4)], [0x50, 0x4e, 0x47]); // signature d'un fichier PNG
});

// ── Questions « fraction » venues de l'IA (le clavier chiffres n'a pas de « / ») ──
test("une question « fraction » de l'IA accepte toute fraction égale, tapée au clavier texte", () => {
  const q = appli('questionDepuisIA')({ type: 'fraction', notion: 'n', enonce: 'Calcule 1/4 + 2/4', numerateur: 6, denominateur: 8, pisteReflexion: 'p' });
  assert.equal(q.type, 'court', 'champ texte : le « / » est disponible');
  assert.deepEqual([...q.fraction], [6, 8]);
  assert.ok(comparerFraction('3/4', ...q.fraction).juste);
  assert.ok(comparerFraction('6/8', ...q.fraction).juste);
  assert.ok(!comparerFraction('2/3', ...q.fraction).juste);
  assert.ok(appli('questionHtml')(q, 'Q').includes('id="court-answer"'));
});

test('une fraction incohérente renvoyée par l\'IA est écartée du mini-quiz', () => {
  const valide = appli('questionIAValide');
  assert.ok(valide({ type: 'fraction', enonce: 'e', numerateur: 3, denominateur: 4 }));
  for (const [n, d] of [[3, 0], [1.5, 2], [-1, 4], ['3', 4]]) {
    assert.ok(!valide({ type: 'fraction', enonce: 'e', numerateur: n, denominateur: d }), `${n}/${d}`);
  }
});

test("les consignes de l'IA imposent le type fraction pour une réponse en fraction", () => {
  assert.ok(appli('coursSurMesurePrompt')('5ème', 'Maths', []).includes('"type": "fraction"'));
  assert.ok(appli('questionSetInstructions')().includes('jamais "num"'));
});

// ── Cartes mentales ──
const CARTE = {
  centre: 'Les fractions',
  branches: [
    { titre: 'Définition', elements: ['a/b : a parts sur b', 'b ≠ 0'] },
    { titre: 'Simplifier', elements: ['diviser haut ET bas par le même nombre', '6/8 = 3/4'] },
    { titre: 'Additionner', elements: ['même dénominateur d\'abord'] }
  ]
};

test("une carte mentale de l'IA est bornée, et refusée sous 2 branches", () => {
  const valider = appli('validerCarteMentale');
  assert.equal(valider(null), null);
  assert.equal(valider({ centre: 'c', branches: [{ titre: 'seule', elements: ['x'] }] }), null);
  const carte = valider({
    centre: '  ', branches: Array.from({ length: 9 }, (_, i) => ({ titre: `B${i}`, elements: ['x'.repeat(200), 4, '', 'a', 'b', 'c', 'd', 'e'] }))
  });
  assert.equal(carte.centre, 'Mon cours');
  assert.equal(carte.branches.length, 6);
  assert.equal(carte.branches[0].elements.length, 5);
  assert.equal(carte.branches[0].elements[0].length, 90);
});

test('le découpage en lignes respecte les mots et coupe un mot trop long', () => {
  const couper = appli('couperLignes');
  assert.deepEqual([...couper('diviser haut et bas par le même nombre', 16)], ['diviser haut et', 'bas par le même', 'nombre']);
  assert.deepEqual([...couper('anticonstitutionnellement', 10)], ['anticonsti', 'tutionnell', 'ement']);
});

test("les deux dispositions de la carte contiennent tous les textes, échappés", () => {
  const piegee = { centre: PIEGE, branches: [{ titre: PIEGE, elements: [PIEGE] }, ...CARTE.branches] };
  for (const nom of ['carteMentalePileSvg', 'carteMentaleEtoileSvg']) {
    const svg = appli(nom)(piegee);
    assert.ok(!svg.includes('<img'), nom);
    assert.equal(svg.split('<text').length, svg.split('</text>').length, `${nom} : balises équilibrées`);
    for (const mot of ['Simplifier', '6/8 = 3/4', 'Additionner']) assert.ok(svg.includes(mot), `${nom} : ${mot}`);
  }
  assert.match(appli('carteMentalePileSvg')(CARTE), /viewBox="0 0 380 /);
  assert.match(appli('carteMentaleEtoileSvg')(CARTE), /viewBox="0 0 840 /);
  const bloc = appli('carteMentaleHtml')(CARTE);
  assert.ok(bloc.includes('carte-pile') && bloc.includes('carte-etoile') && bloc.includes('carte-image-btn'));
});

test('la carte mentale part de la fiche détaillée si elle existe, sinon du résumé', () => {
  const prompt = appli('carteMentalePrompt');
  assert.ok(prompt('5ème', { matiere: 'SVT', titre: 'T', fiche: 'FICHE FIDELE', resume: 'RESUME' }).includes('FICHE FIDELE'));
  const sansFiche = prompt('5ème', { matiere: 'SVT', titre: 'T', resume: 'RESUME', notions: ['n'], explications: [{ notion: 'N', methode: 'M' }] });
  assert.ok(sansFiche.includes('RESUME') && sansFiche.includes('- N : M'));
  assert.ok(appli('ficheCoursHtml')({ titre: 'T', matiere: 'SVT', resume: '', notions: [] }, []).includes('id="carte-btn"'));
});

test("en étoile, chaque flèche part d'un point différent de la bulle", () => {
  const svg = appli('carteMentaleEtoileSvg')(CARTE);
  const departs = [...svg.matchAll(/<path d="M ([\d.]+) ([\d.]+) Q[^"]*" [^>]*marker-end/g)].map(m => `${m[1]},${m[2]}`);
  assert.equal(departs.length, CARTE.branches.length);
  assert.equal(new Set(departs).size, departs.length, 'aucun départ commun');
  // Le départ est sur le bord de la bulle : vers la droite, il part du bout droit
  assert.deepEqual([...appli('bordBulle')(100, 50, 200, 60, 1, 0)], [200, 50]);
});

test("le mini-quiz d'un cours sur mesure compte pour le chapitre d'origine, sans figure", () => {
  const quiz = appli('quizDuCoursSurMesure')({
    id: 'c1', matiere: 'Maths', themeOrigine: 'fractions',
    questions: [{ type: 'qcm', enonce: 'Q', choix: ['a', 'b'], correctIndex: 0, fig: '<svg>' }, { type: 'fraction', enonce: 'F', numerateur: 1, denominateur: 2 }]
  });
  assert.equal(quiz.theme, 'fractions');
  assert.equal(quiz.lessonId, 'c1');
  assert.equal(quiz.subject, 'Maths');
  assert.equal(quiz.questions[0].fig, undefined);
  assert.equal(quiz.questions[1].type, 'court');
  assert.equal(appli('quizDuCoursSurMesure')({ id: 'c2', matiere: 'SVT' }).theme, null);
});

test("le nom du fichier image d'une carte est simple et sans accents", () => {
  const nom = appli('nomFichierCarte');
  assert.equal(nom('Les Fractions égales !'), 'carte-mentale-les-fractions-egales.png');
  assert.equal(nom(''), 'carte-mentale-cours.png');
  assert.equal(nom(undefined), 'carte-mentale-cours.png');
});
