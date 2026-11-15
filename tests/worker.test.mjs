// Tests du proxy /api/claude (worker.js) : ce que le serveur laisse réellement partir chez Anthropic.
// Lancement : node --test tests/worker.test.mjs (aucune dépendance, node:test est fourni avec Node).

// ── Imports et réglages ──
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, test } from 'node:test';
import worker from '../worker.js';

const ENV = {
  ACCESS_CODE: 'code-de-test',
  PARENT_CODE_1: 'code-parent-un',
  PARENT_CODE_2: 'code-parent-deux',
  ANTHROPIC_API_KEY: 'cle-de-test'
};
const MODELE_SERVEUR = 'claude-haiku-5-5';
const PLAFOND = 6000;        // longueur de réponse maximale qu'un navigateur peut demander
const MARGE_REFLEXION = 2000; // ajoutée par le serveur : la réflexion du modèle compte dans max_tokens

// ── Outils de test ──
let envois;
let statutAnthropic;   // réponse simulée d'Anthropic, modifiable par chaque test
let reponseAnthropic;
const fetchOriginal = globalThis.fetch;

// Remplace l'appel réseau par un enregistreur : aucun test ne contacte Anthropic.
beforeEach(() => {
  envois = [];
  globalThis.fetch = async (url, options) => {
    // Corps JSON (Anthropic) ou binaire (notification chiffrée)
    envois.push({ url, options, corps: typeof options.body === 'string' ? JSON.parse(options.body) : options.body });
    return new Response(JSON.stringify(reponseAnthropic), { status: statutAnthropic });
  };
  statutAnthropic = 200;
  reponseAnthropic = { content: [], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } };
});

afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

// Appelle le Worker comme le ferait le navigateur, avec le bon code d'accès par défaut.
function appeler(corps, code = ENV.ACCESS_CODE) {
  const texte = typeof corps === 'string' ? corps : JSON.stringify(corps);
  const requete = new Request('https://exemple.test/api/claude', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-access-code': code },
    body: texte
  });
  return worker.fetch(requete, ENV);
}

const MESSAGES = [{ role: 'user', content: 'bonjour' }];

// ── Contrôle d'accès (comportement existant à préserver) ──
test('un mauvais code est refusé sans aucun appel à Anthropic', async () => {
  const reponse = await appeler({ max_tokens: 10, messages: MESSAGES }, 'mauvais');
  assert.equal(reponse.status, 401);
  assert.equal(envois.length, 0);
});

test('un ACCESS_CODE vide côté serveur ferme le proxy', async () => {
  const requete = new Request('https://exemple.test/api/claude', {
    method: 'POST',
    headers: { 'x-access-code': '' },
    body: JSON.stringify({ max_tokens: 10, messages: MESSAGES })
  });
  const reponse = await worker.fetch(requete, { ...ENV, ACCESS_CODE: '' });
  assert.equal(reponse.status, 401);
  assert.equal(envois.length, 0);
});

// ── Limites imposées par le serveur ──
test('le modèle demandé par le navigateur est ignoré', async () => {
  await appeler({ model: 'modele-tres-cher', max_tokens: 10, messages: MESSAGES });
  assert.equal(envois[0].corps.model, MODELE_SERVEUR);
});

test('le modèle est imposé même si le navigateur n\'en envoie pas', async () => {
  await appeler({ max_tokens: 10, messages: MESSAGES });
  assert.equal(envois[0].corps.model, MODELE_SERVEUR);
});

test('max_tokens au-delà du plafond est ramené au plafond, plus la marge de réflexion', async () => {
  await appeler({ max_tokens: 999999, messages: MESSAGES });
  assert.equal(envois[0].corps.max_tokens, PLAFOND + MARGE_REFLEXION);
});

test('max_tokens sous le plafond est conservé, plus la marge de réflexion', async () => {
  await appeler({ max_tokens: 400, messages: MESSAGES });
  assert.equal(envois[0].corps.max_tokens, 400 + MARGE_REFLEXION);
});

test('la réflexion du modèle est réglée au niveau bas par le serveur', async () => {
  await appeler({ max_tokens: 10, messages: MESSAGES, output_config: { effort: 'max' } });
  assert.deepEqual(envois[0].corps.output_config, { effort: 'low' });
});

test('les champs non prévus ne partent pas chez Anthropic', async () => {
  await appeler({ max_tokens: 10, messages: MESSAGES, tools: [{ name: 'x' }], stream: true, thinking: {} });
  assert.deepEqual(Object.keys(envois[0].corps).sort(), ['max_tokens', 'messages', 'model', 'output_config']);
});

test('system et messages sont transmis intacts', async () => {
  await appeler({ max_tokens: 10, system: 'consigne', messages: MESSAGES });
  assert.equal(envois[0].corps.system, 'consigne');
  assert.deepEqual(envois[0].corps.messages, MESSAGES);
});

// ── Réponse renvoyée au navigateur ──
test('seuls les blocs de texte reviennent au navigateur, avec la consommation', async () => {
  reponseAnthropic = {
    content: [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'text', text: '{"a":1}' }],
    stop_reason: 'end_turn', usage: { input_tokens: 120, output_tokens: 80 }
  };
  const reponse = await appeler({ max_tokens: 10, messages: MESSAGES });
  assert.equal(reponse.status, 200);
  assert.deepEqual(await reponse.json(), {
    content: [{ type: 'text', text: '{"a":1}' }],
    usage: { input_tokens: 120, output_tokens: 80 }
  });
});

test('un refus du modèle donne un message clair', async () => {
  reponseAnthropic = { content: [], stop_reason: 'refusal', usage: {} };
  const reponse = await appeler({ max_tokens: 10, messages: MESSAGES });
  assert.equal(reponse.status, 422);
  assert.match((await reponse.json()).error.message, /refusé/);
});

test('une réponse coupée faute de place donne un message clair', async () => {
  reponseAnthropic = { content: [{ type: 'text', text: '{"a":' }], stop_reason: 'max_tokens', usage: {} };
  const reponse = await appeler({ max_tokens: 10, messages: MESSAGES });
  assert.equal(reponse.status, 502);
  assert.match((await reponse.json()).error.message, /trop longue/);
});

test("une erreur d'Anthropic est relayée telle quelle", async () => {
  statutAnthropic = 529;
  reponseAnthropic = { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } };
  const reponse = await appeler({ max_tokens: 10, messages: MESSAGES });
  assert.equal(reponse.status, 529);
  assert.equal((await reponse.json()).error.message, 'Overloaded');
});

test("une coupure réseau vers Anthropic donne un message clair", async () => {
  globalThis.fetch = async () => { throw new TypeError('network'); };
  const reponse = await appeler({ max_tokens: 10, messages: MESSAGES });
  assert.equal(reponse.status, 502);
  assert.match((await reponse.json()).error.message, /injoignable/);
});

// ── Rôles : le serveur déduit qui parle à partir du code ──
// Interroge /api/moi avec un code donné.
function demanderRole(code, env = ENV, methode = 'GET') {
  const requete = new Request('https://exemple.test/api/moi', {
    method: methode,
    headers: { 'x-access-code': code }
  });
  return worker.fetch(requete, env);
}

for (const [code, role] of [
  ['code-de-test', 'enfant'],
  ['code-parent-un', 'parent1'],
  ['code-parent-deux', 'parent2']
]) {
  test(`le code ${code} donne le rôle ${role}`, async () => {
    const reponse = await demanderRole(code);
    assert.equal(reponse.status, 200);
    assert.deepEqual(await reponse.json(), { role });
  });
}

test('un code inconnu n\'obtient aucun rôle', async () => {
  const reponse = await demanderRole('inconnu');
  assert.equal(reponse.status, 401);
});

test('un code vide n\'obtient aucun rôle quand des codes parents manquent', async () => {
  const reponse = await demanderRole('', { ACCESS_CODE: 'code-de-test' });
  assert.equal(reponse.status, 401);
});

test('/api/moi refuse une autre méthode que GET', async () => {
  const reponse = await demanderRole('code-de-test', ENV, 'POST');
  assert.equal(reponse.status, 405);
});

test('un code parent peut aussi utiliser le proxy', async () => {
  const reponse = await appeler({ max_tokens: 10, messages: MESSAGES }, 'code-parent-un');
  assert.equal(reponse.status, 200);
  assert.equal(envois.length, 1);
});

// ── Synchronisation : base D1 simulée par le SQLite intégré à Node ──

// Fausse base D1 : vraie base SQLite en mémoire, avec la même structure que la production.
function faireD1() {
  const db = new DatabaseSync(':memory:');
  // Toutes les migrations, dans l'ordre, comme wrangler les applique
  for (const fichier of readdirSync(new URL('../migrations/', import.meta.url)).filter(f => f.endsWith('.sql')).sort()) {
    db.exec(readFileSync(new URL(`../migrations/${fichier}`, import.meta.url), 'utf8'));
  }
  const preparer = (sql, params = []) => ({
    bind: (...valeurs) => preparer(sql, valeurs),
    // Comme D1 : une écriture renvoie le nombre de lignes modifiées (meta.changes)
    run: async () => ({ success: true, meta: { changes: Number(db.prepare(sql).run(...params).changes) } }),
    all: async () => ({ results: db.prepare(sql).all(...params) }),
    first: async () => db.prepare(sql).get(...params) ?? null
  });
  return {
    prepare: sql => preparer(sql),
    async batch(instructions) {
      db.exec('BEGIN');
      try {
        const resultats = [];
        for (const instruction of instructions) resultats.push(await instruction.run());
        db.exec('COMMIT');
        return resultats; // comme D1 : un résultat par instruction
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    lire: sql => db.prepare(sql).all()
  };
}

// Envoie un lot à /api/sync avec le code de l'enfant par défaut.
function synchroniser(corps, env, code = ENV.ACCESS_CODE, methode = 'POST') {
  const requete = new Request('https://exemple.test/api/sync', {
    method: methode,
    headers: { 'content-type': 'application/json', 'x-access-code': code },
    ...(methode === 'POST' ? { body: typeof corps === 'string' ? corps : JSON.stringify(corps) } : {})
  });
  return worker.fetch(requete, env);
}

const TENTATIVE = {
  id: 'id-1', quizId: 'q-1', questionId: 'qq-1', subject: 'Maths', theme: 'fractions',
  notion: 'Simplifier', type: 'qcm', correct: false, date: '2026-11-10T10:00:00.000Z',
  enonce: 'Simplifie 6/8', reponseDonnee: '2/3', bonneReponse: '3/4'
};

test('l\'enfant enregistre ses réponses, toujours au nom de l\'enfant', async () => {
  const DB = faireD1();
  const reponse = await synchroniser({ tentatives: [{ ...TENTATIVE, joueur: 'parent1' }] }, { ...ENV, DB });
  assert.equal(reponse.status, 200);
  const lignes = DB.lire('SELECT * FROM tentatives');
  assert.equal(lignes.length, 1);
  assert.equal(lignes[0].joueur, 'enfant');
  assert.equal(lignes[0].reponse_donnee, '2/3');
  assert.equal(lignes[0].correct, 0);
});

test('renvoyer la même réponse ne crée pas de doublon', async () => {
  const DB = faireD1();
  await synchroniser({ tentatives: [TENTATIVE] }, { ...ENV, DB });
  await synchroniser({ tentatives: [TENTATIVE] }, { ...ENV, DB });
  assert.equal(DB.lire('SELECT * FROM tentatives').length, 1);
});

test('un code parent ne peut pas écrire dans les résultats de l\'enfant', async () => {
  const DB = faireD1();
  const reponse = await synchroniser({ tentatives: [TENTATIVE] }, { ...ENV, DB }, 'code-parent-un');
  assert.equal(reponse.status, 403);
  assert.equal(DB.lire('SELECT * FROM tentatives').length, 0);
});

test('un code inconnu est refusé par /api/sync', async () => {
  const DB = faireD1();
  const reponse = await synchroniser({ tentatives: [TENTATIVE] }, { ...ENV, DB }, 'inconnu');
  assert.equal(reponse.status, 401);
  assert.equal(DB.lire('SELECT * FROM tentatives').length, 0);
});

test('/api/sync refuse une autre méthode que POST', async () => {
  const reponse = await synchroniser(null, { ...ENV, DB: faireD1() }, ENV.ACCESS_CODE, 'GET');
  assert.equal(reponse.status, 405);
});

test('les éléments invalides sont écartés et comptés, les autres enregistrés', async () => {
  const DB = faireD1();
  const reponse = await synchroniser({
    tentatives: [TENTATIVE, { ...TENTATIVE, id: 'id-2', correct: 'oui' }, { ...TENTATIVE, id: '' }, null]
  }, { ...ENV, DB });
  assert.deepEqual(await reponse.json(), { recus: 4, ignores: 3 });
  assert.equal(DB.lire('SELECT * FROM tentatives').length, 1);
});

test('un lot trop gros est refusé sans rien écrire', async () => {
  const DB = faireD1();
  const lot = Array.from({ length: 201 }, (_, i) => ({ ...TENTATIVE, id: `id-${i}` }));
  const reponse = await synchroniser({ tentatives: lot }, { ...ENV, DB });
  assert.equal(reponse.status, 400);
  assert.equal(DB.lire('SELECT * FROM tentatives').length, 0);
});

test('un corps illisible ou des listes mal formées renvoient 400', async () => {
  const env = { ...ENV, DB: faireD1() };
  assert.equal((await synchroniser('pas du json', env)).status, 400);
  assert.equal((await synchroniser({ tentatives: 'x' }, env)).status, 400);
});

test('les textes trop longs sont tronqués', async () => {
  const DB = faireD1();
  await synchroniser({ tentatives: [{ ...TENTATIVE, enonce: 'a'.repeat(5000) }] }, { ...ENV, DB });
  assert.equal(DB.lire('SELECT enonce FROM tentatives')[0].enonce.length, 2000);
});

test('les cours et le profil sont enregistrés, le profil mis à jour', async () => {
  const DB = faireD1();
  const cours = { id: 'c-1', matiere: 'SVT', titre: 'La cellule', resume: 'r', notions: ['noyau', 3], date: '2026-11-10' };
  await synchroniser({ cours: [cours], profil: { prenom: 'Zoé-test', niveau: '5ème' } }, { ...ENV, DB });
  await synchroniser({ profil: { prenom: 'Zoé-test', niveau: '4ème' } }, { ...ENV, DB });
  assert.deepEqual(JSON.parse(DB.lire('SELECT notions FROM cours')[0].notions), ['noyau']);
  const profils = DB.lire('SELECT role, niveau FROM profils');
  assert.deepEqual(profils.map(p => ({ ...p })), [{ role: 'enfant', niveau: '4ème' }]);
});

test('une panne de la base renvoie une erreur propre, sans planter', async () => {
  const DB = { prepare: () => ({ bind: () => ({}) }), batch: async () => { throw new Error('D1 indisponible'); } };
  const reponse = await synchroniser({ tentatives: [TENTATIVE] }, { ...ENV, DB });
  assert.equal(reponse.status, 500);
  assert.match((await reponse.json()).error.message, /impossible/);
});

// ── Espace parent : lecture du suivi de l'enfant ──

// Demande le suivi à /api/parent/suivi avec un code donné.
function lireSuivi(env, code = 'code-parent-un', methode = 'GET') {
  const requete = new Request('https://exemple.test/api/parent/suivi', {
    method: methode,
    headers: { 'x-access-code': code }
  });
  return worker.fetch(requete, env);
}

test('chaque parent lit le profil, les réponses et les cours de l\'enfant', async () => {
  const env = { ...ENV, DB: faireD1() };
  await synchroniser({
    profil: { prenom: 'Zoé-test', niveau: '5ème' },
    tentatives: [TENTATIVE, { ...TENTATIVE, id: 'id-2', correct: true, date: '2026-11-11T10:00:00.000Z' }],
    cours: [
      { id: 'c-1', matiere: 'SVT', titre: 'La cellule', resume: 'Tout être vivant…', notions: ['noyau', 'membrane'], date: '2026-11-10' },
      { id: 'c-2', matiere: 'Maths', titre: 'Fractions', date: '2026-11-12' }
    ]
  }, env);
  for (const code of ['code-parent-un', 'code-parent-deux']) {
    const reponse = await lireSuivi(env, code);
    assert.equal(reponse.status, 200);
    const suivi = await reponse.json();
    assert.equal(suivi.profil.prenom, 'Zoé-test');
    assert.equal(suivi.nbCours, 2);
    // Derniers cours, plus récent d'abord, notions déjà décodées ; jamais de photo
    assert.deepEqual(suivi.cours.map(c => c.titre), ['Fractions', 'La cellule']);
    assert.deepEqual(suivi.cours[1], {
      id: 'c-1', matiere: 'SVT', titre: 'La cellule', resume: 'Tout être vivant…', notions: ['noyau', 'membrane'], date: '2026-11-10',
      type: null, a_fiche: false, a_carte: false, a_explications: false
    });
    assert.deepEqual(suivi.cours[0].notions, []);
    assert.deepEqual(suivi.tentatives.map(t => t.id), ['id-2', 'id-1']); // plus récente d'abord
    assert.equal(suivi.tentatives[1].reponse_donnee, '2/3');
  }
});

test('le code enfant ne peut pas lire l\'espace parent', async () => {
  const reponse = await lireSuivi({ ...ENV, DB: faireD1() }, ENV.ACCESS_CODE);
  assert.equal(reponse.status, 403);
});

test('un code inconnu ne peut pas lire l\'espace parent', async () => {
  const reponse = await lireSuivi({ ...ENV, DB: faireD1() }, 'inconnu');
  assert.equal(reponse.status, 401);
});

test("l'espace parent ne reçoit que les 10 cours les plus récents", async () => {
  const env = { ...ENV, DB: faireD1() };
  const cours = Array.from({ length: 12 }, (_, i) => ({ id: `c-${i}`, titre: `T${i}`, date: `2026-11-${String(i + 1).padStart(2, '0')}` }));
  await synchroniser({ cours }, env);
  const suivi = await (await lireSuivi(env)).json();
  assert.equal(suivi.nbCours, 12);
  assert.equal(suivi.cours.length, 10);
  assert.equal(suivi.cours[0].titre, 'T11');
});

// Contenu d'un cours, lu par un parent comme au clic sur « Voir la fiche ».
async function lireContenu(env, id, code = 'code-parent-un') {
  const reponse = await worker.fetch(new Request(`https://exemple.test/api/parent/cours/${id}`, { headers: { 'x-access-code': code } }), env);
  return reponse.status === 200 ? reponse.json() : reponse.status;
}

// Une page de la liste des cours, lue par un parent.
async function lirePageCours(env, requete = '') {
  const reponse = await worker.fetch(new Request(`https://exemple.test/api/parent/cours${requete}`, { headers: { 'x-access-code': 'code-parent-un' } }), env);
  return reponse.json();
}

test("tous les cours sont consultables page par page, filtrés par matière, réservés aux parents", async () => {
  const env = { ...ENV, DB: faireD1() };
  const cours = Array.from({ length: 25 }, (_, i) => ({ id: `c-${i}`, titre: `T${i}`, matiere: i % 5 ? 'Maths' : 'SVT', date: `2026-10-${String(i + 1).padStart(2, '0')}` }));
  await synchroniser({ cours }, env);
  const page0 = await lirePageCours(env);
  assert.equal(page0.cours.length, 20);
  assert.equal(page0.suivant, true);
  assert.deepEqual(page0.matieres, ['Maths', 'SVT']);
  assert.equal(page0.cours[0].titre, 'T24');
  const page1 = await lirePageCours(env, '?page=1');
  assert.equal(page1.cours.length, 5);
  assert.equal(page1.suivant, false);
  const svt = await lirePageCours(env, '?matiere=SVT');
  assert.equal(svt.cours.length, 5);
  assert.ok(svt.cours.every(c => c.matiere === 'SVT'));
  assert.equal(await lireContenu(env, 'c-1', ENV.ACCESS_CODE), 403);
  assert.equal(await lireContenu(env, 'inconnu'), 404);
});

test("la fiche, la carte et les explications d'un cours remontent au parent, complétées après coup", async () => {
  const env = { ...ENV, DB: faireD1() };
  const base = { id: 'c-1', matiere: 'Maths', titre: 'Fractions', date: '2026-11-14' };
  await synchroniser({ cours: [base] }, env);
  const carte = { centre: 'Fractions', branches: [{ titre: 'A', elements: ['x', 4] }, { titre: 'B', elements: [] }], source: 'fiche' };
  await synchroniser({ cours: [{ ...base, type: 'sur-mesure', fiche: '## Titre\n- règle', carte, explications: [{ notion: 'n', methode: 'm' }] }] }, env);
  assert.equal((await (await lireSuivi(env)).json()).cours[0].a_fiche, true);
  const c = await lireContenu(env, 'c-1');
  assert.equal(c.fiche, '## Titre\n- règle');
  assert.deepEqual(c.carte, { centre: 'Fractions', branches: [{ titre: 'A', elements: ['x'] }, { titre: 'B', elements: [] }] });
  assert.deepEqual(c.explications, [{ notion: 'n', erreur: '', methode: 'm', exemple: '' }]);
  // Un envoi sans fiche n'efface pas la fiche déjà reçue
  await synchroniser({ cours: [base] }, env);
  assert.equal((await lireContenu(env, 'c-1')).fiche, '## Titre\n- règle');
});

test("un envoi démesuré est refusé avant d'être lu, et le type d'un ancien cours est complété", async () => {
  const env = { ...ENV, DB: faireD1() };
  const reponse = await synchroniser({ cours: [{ id: 'c-1', titre: 'T', date: 'd', fiche: 'x'.repeat(2100000) }] }, env);
  assert.equal(reponse.status, 413);
  await synchroniser({ cours: [{ id: 'c-2', titre: 'T', date: '2026-11-14' }] }, env);
  await synchroniser({ cours: [{ id: 'c-2', titre: 'T', date: '2026-11-14', type: 'sur-mesure', carte: { centre: '  ', branches: [{ titre: ' A ', elements: [' x ', '  '] }, { titre: '   ' }, { titre: 'B' }] } }] }, env);
  assert.equal((await (await lireSuivi(env)).json()).cours[0].type, 'sur-mesure');
  const c = await lireContenu(env, 'c-2');
  assert.deepEqual(c.carte, { centre: 'Mon cours', branches: [{ titre: 'A', elements: ['x'] }, { titre: 'B', elements: [] }] });
});

test('une carte ou une fiche démesurée est bornée ou refusée par le serveur', async () => {
  const env = { ...ENV, DB: faireD1() };
  await synchroniser({ cours: [{ id: 'c-1', titre: 'T', date: '2026-11-14', fiche: 'x'.repeat(50000), carte: { centre: 'c', branches: 'pas une liste' } }] }, env);
  const c = await lireContenu(env, 'c-1');
  assert.equal(c.fiche.length, 20000);
  assert.equal(c.carte, null);
});

test('des notions illisibles en base ne cassent pas le suivi', async () => {
  const env = { ...ENV, DB: faireD1() };
  await synchroniser({ cours: [{ id: 'c-1', titre: 'T', date: '2026-11-10' }] }, env);
  env.DB.lire("UPDATE cours SET notions = 'pas du json'");
  const suivi = await (await lireSuivi(env)).json();
  assert.deepEqual(suivi.cours[0].notions, []);
});

test('/api/parent/suivi refuse une autre méthode que GET', async () => {
  const reponse = await lireSuivi({ ...ENV, DB: faireD1() }, 'code-parent-un', 'POST');
  assert.equal(reponse.status, 405);
});

test('sans aucune donnée partagée, le suivi est vide mais valide', async () => {
  const suivi = await (await lireSuivi({ ...ENV, DB: faireD1() })).json();
  assert.deepEqual(suivi, { profil: null, tentatives: [], nbCours: 0, cours: [], tronque: false });
});

// ── Requêtes invalides : refus avant tout appel payant ──
for (const [nom, corps] of [
  ['du JSON illisible', 'pas du json'],
  ['un corps qui n\'est pas un objet', '[1,2]'],
  ['max_tokens absent', { messages: MESSAGES }],
  ['max_tokens négatif', { max_tokens: -5, messages: MESSAGES }],
  ['max_tokens non entier', { max_tokens: 'beaucoup', messages: MESSAGES }]
]) {
  test(`${nom} renvoie 400 sans appeler Anthropic`, async () => {
    const reponse = await appeler(corps);
    assert.equal(reponse.status, 400);
    assert.equal(envois.length, 0);
  });
}

// ── Défis en famille ──

// Appelle une route des défis avec le code d'un joueur.
async function defis(env, chemin, { code = ENV.ACCESS_CODE, methode = 'GET', corps } = {}) {
  const requete = new Request(`https://exemple.test/api/defis${chemin}`, {
    method: methode,
    headers: { 'x-access-code': code, 'content-type': 'application/json' },
    ...(corps !== undefined ? { body: JSON.stringify(corps) } : {})
  });
  const reponse = await worker.fetch(requete, env);
  return { statut: reponse.status, json: await reponse.json() };
}

const QUESTIONS_DEFI = [
  { type: 'qcm', notion: 'n', enonce: 'Q1', choix: ['a', 'b'], correctIndex: 0, fig: '<svg onload=alert(1)>' },
  { type: 'num', notion: 'n', enonce: 'Q2', answer: 3, exacte: true }
];

test('un parent lance un défi : le serveur fixe le lanceur et retire les figures', async () => {
  const env = { ...ENV, DB: faireD1() };
  const cree = await defis(env, '', { code: 'code-parent-un', methode: 'POST', corps: { id: 'd1', matiere: 'Maths', titre: 'Fractions', questions: QUESTIONS_DEFI, surnom: 'Papa', lance_par: 'enfant' } });
  assert.equal(cree.statut, 200);
  const { json } = await defis(env, '/d1');
  assert.equal(json.defi.lance_par, 'parent1');
  assert.equal(json.defi.questions[0].fig, undefined);
  assert.equal(json.surnoms.parent1, 'Papa');
});

test('les questions d\'un défi sont contrôlées', async () => {
  const env = { ...ENV, DB: faireD1() };
  for (const questions of [[], 'x', [{ type: 'ouverte', enonce: 'e' }], Array.from({ length: 16 }, () => QUESTIONS_DEFI[1])]) {
    assert.equal((await defis(env, '', { methode: 'POST', corps: { id: 'd', questions } })).statut, 400);
  }
  // Questions incomplètes : l'écran de quiz planterait chez les autres joueurs
  const incompletes = [
    { type: 'qcm', enonce: 'e' },
    { type: 'qcm', enonce: 'e', choix: ['a', 'b'], correctIndex: 5 },
    { type: 'qcm-multi', enonce: 'e', choix: ['a', 'b'], correctIndexes: [] },
    { type: 'num', enonce: 'e', answer: '3' },
    { type: 'court', enonce: 'e', reponses: [] }
  ];
  for (const q of incompletes) {
    assert.equal((await defis(env, '', { methode: 'POST', corps: { id: 'd', questions: [q] } })).statut, 400, JSON.stringify(q));
  }
});

test('une adresse mal encodée renvoie 400 au lieu de faire planter le Worker', async () => {
  const env = { ...ENV, DB: faireD1() };
  assert.equal((await defis(env, '/%E0%A4%A')).statut, 400);
  const reponse = await worker.fetch(new Request('https://exemple.test/api/parent/cours/%ZZ', { headers: { 'x-access-code': 'code-parent-un' } }), env);
  assert.equal(reponse.status, 400);
});

test("les réponses des autres ne sont visibles qu'après avoir joué", async () => {
  const env = { ...ENV, DB: faireD1() };
  await defis(env, '', { code: 'code-parent-un', methode: 'POST', corps: { id: 'd1', questions: QUESTIONS_DEFI } });
  await defis(env, '/d1/participation', { code: 'code-parent-un', methode: 'POST', corps: { score: 2, reponses: [{ reponse: 'a', correct: true }, { reponse: '3', correct: true }] } });
  // L'enfant n'a pas joué : il sait seulement que Papa a terminé
  let vue = (await defis(env, '/d1')).json;
  assert.deepEqual(Object.keys(vue.participations[0]).sort(), ['joueur', 'termine_le']);
  let liste = (await defis(env, '')).json;
  assert.equal(liste.defis[0].a_joue, false);
  assert.equal(liste.defis[0].nb_questions, 2);
  // Après avoir joué, il voit le score et les réponses de Papa
  await defis(env, '/d1/participation', { methode: 'POST', corps: { score: 1, reponses: [{ reponse: 'b', correct: false }] } });
  vue = (await defis(env, '/d1')).json;
  const papa = vue.participations.find(p => p.joueur === 'parent1');
  assert.equal(papa.score, 2);
  assert.equal(papa.reponses[0].reponse, 'a');
  liste = (await defis(env, '')).json;
  assert.equal(liste.defis[0].a_joue, true);
  assert.equal(liste.defis[0].participations.find(p => p.joueur === 'parent1').score, 2);
});

test('un joueur ne participe qu\'une fois, avec un score borné, et le joueur vient du code', async () => {
  const env = { ...ENV, DB: faireD1() };
  await defis(env, '', { methode: 'POST', corps: { id: 'd1', questions: QUESTIONS_DEFI } });
  const premier = await defis(env, '/d1/participation', { methode: 'POST', corps: { score: 99, joueur: 'parent2' } });
  assert.equal(premier.statut, 200);
  assert.equal((await defis(env, '/d1/participation', { methode: 'POST', corps: { score: 0 } })).statut, 409);
  const [p] = (await defis(env, '/d1')).json.participations;
  assert.equal(p.joueur, 'enfant');
  assert.equal(p.score, 2, 'score ramené au nombre de questions');
  assert.equal((await defis(env, '/inconnu/participation', { methode: 'POST', corps: { score: 1 } })).statut, 404);
  assert.equal((await defis(env, '/d1/participation', { methode: 'POST', corps: { score: 'beaucoup' } })).statut, 400);
});

test('les défis exigent un code valide', async () => {
  const env = { ...ENV, DB: faireD1() };
  assert.equal((await defis(env, '', { code: 'inconnu' })).statut, 401);
  assert.equal((await defis(env, '/d1/autre')).statut, 404);
});

// ── Notifications : chiffrement vérifié en jouant le rôle du téléphone ──
const b64url = octets => Buffer.from(octets).toString('base64url');

// Fabrique un « téléphone » : sa paire de clés et son secret, comme le ferait le navigateur.
async function faireTelephone(nom) {
  const cles = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const publique = new Uint8Array(await crypto.subtle.exportKey('raw', cles.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { cles, publique, auth, abonnement: { endpoint: `https://web.push.apple.com/${nom}`, keys: { p256dh: b64url(publique), auth: b64url(auth) } } };
}

// HKDF-SHA256, pour déchiffrer comme le téléphone.
async function hkdfTest(sel, secret, info, longueur) {
  const cle = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: sel, info }, cle, longueur * 8));
}

// Déchiffre une notification reçue (RFC 8291) avec les clés du téléphone ; renvoie l'objet envoyé.
async function dechiffrer(corps, tel) {
  const o = new Uint8Array(corps);
  const sel = o.slice(0, 16), longueurCle = o[20], cleServeur = o.slice(21, 21 + longueurCle), chiffre = o.slice(21 + longueurCle);
  const pubServeur = await crypto.subtle.importKey('raw', cleServeur, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: pubServeur }, tel.cles.privateKey, 256));
  const enc = new TextEncoder();
  const ikm = await hkdfTest(tel.auth, ecdh, Buffer.concat([enc.encode('WebPush: info\0'), tel.publique, cleServeur]), 32);
  const cek = await hkdfTest(sel, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdfTest(sel, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const cle = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const clair = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, cle, chiffre));
  assert.equal(clair[clair.length - 1], 2, 'délimiteur de dernier bloc');
  return JSON.parse(new TextDecoder().decode(clair.slice(0, -1)));
}

// Environnement avec une clé VAPID neuve et une base vide.
async function envPush() {
  const cles = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', cles.privateKey);
  return { env: { ...ENV, DB: faireD1(), VAPID_JWK: JSON.stringify(jwk) }, clePublique: cles.publicKey };
}

// Abonne le téléphone d'un joueur.
async function abonner(env, code, tel) {
  const requete = new Request('https://exemple.test/api/notifications', {
    method: 'POST', headers: { 'x-access-code': code }, body: JSON.stringify(tel.abonnement)
  });
  return worker.fetch(requete, env);
}

test('un nouveau défi notifie les autres joueurs, chiffré et signé, avec la pastille', async () => {
  const { env, clePublique } = await envPush();
  const telEnfant = await faireTelephone('enfant'), telPapa = await faireTelephone('papa');
  assert.equal((await abonner(env, ENV.ACCESS_CODE, telEnfant)).status, 200);
  assert.equal((await abonner(env, 'code-parent-un', telPapa)).status, 200);
  await defis(env, '', { code: 'code-parent-un', methode: 'POST', corps: { id: 'd1', titre: 'Les fractions', questions: QUESTIONS_DEFI, surnom: 'Papa' } });
  const pushs = envois.filter(e => e.url.startsWith('https://web.push.apple.com/'));
  assert.deepEqual(pushs.map(e => e.url), ['https://web.push.apple.com/enfant'], "seul l'enfant est prévenu, pas le lanceur");
  const message = await dechiffrer(pushs[0].corps, telEnfant);
  assert.equal(message.corps, "Papa t'a lancé un défi : Les fractions");
  assert.equal(message.badge, 1);
  // La signature du serveur se vérifie avec sa clé publique
  const [, jeton] = pushs[0].options.headers.authorization.match(/^vapid t=([^,]+), k=/);
  const [h, c, sig] = jeton.split('.');
  assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, clePublique, Buffer.from(sig, 'base64url'), new TextEncoder().encode(`${h}.${c}`)));
  assert.equal(JSON.parse(Buffer.from(c, 'base64url')).aud, 'https://web.push.apple.com');
  assert.ok(!JSON.parse(Buffer.from(c, 'base64url')).sub.includes('@'), 'aucun e-mail dans la signature');
});

test('quand un joueur termine, les autres sont prévenus sans le score', async () => {
  const { env } = await envPush();
  const telEnfant = await faireTelephone('enfant'), telPapa = await faireTelephone('papa');
  await abonner(env, ENV.ACCESS_CODE, telEnfant);
  await abonner(env, 'code-parent-un', telPapa);
  await defis(env, '', { methode: 'POST', corps: { id: 'd1', titre: 'Volcans', questions: QUESTIONS_DEFI, surnom: 'Zoé-test' } });
  envois = [];
  await defis(env, '/d1/participation', { code: 'code-parent-un', methode: 'POST', corps: { score: 2, surnom: 'Papa' } });
  let [push] = envois.filter(e => e.url.startsWith('https://web.push.apple.com/'));
  let message = await dechiffrer(push.corps, telEnfant);
  assert.equal(message.corps, 'Papa a terminé « Volcans » : à toi de jouer !', "l'enfant a lancé le défi mais n'y a pas encore joué");
  assert.ok(!/\d/.test(message.corps), 'aucun score dans la notification');
  assert.equal(message.badge, 1);
  // L'enfant joue : Papa est prévenu que c'est le moment de comparer
  envois = [];
  await defis(env, '/d1/participation', { methode: 'POST', corps: { score: 1 } });
  [push] = envois.filter(e => e.url.startsWith('https://web.push.apple.com/'));
  message = await dechiffrer(push.corps, telPapa);
  assert.equal(message.corps, 'Zoé-test a terminé « Volcans » : découvrez qui a gagné !');
  assert.equal(message.badge, 0);
  // La pastille ne compte que les défis visibles dans la liste (les 30 derniers)
  for (let i = 0; i < 31; i++) {
    env.DB.lire(`INSERT INTO defis (id, lance_par, questions, cree_le) VALUES ('vieux-${i}', 'enfant', '[]', '2020-01-${String(i % 28 + 1).padStart(2, '0')}T${String(i).padStart(2, '0')}')`);
  }
  envois = [];
  await defis(env, '', { methode: 'POST', corps: { id: 'd2', titre: 'Encore', questions: QUESTIONS_DEFI } });
  [push] = envois.filter(e => e.url.startsWith('https://web.push.apple.com/'));
  message = await dechiffrer(push.corps, telPapa);
  assert.equal(message.badge, 29, '30 derniers défis dont « Volcans » déjà joué (32 sans la limite)');
});

test("un abonnement vers une adresse inconnue est refusé, un abonnement expiré est supprimé", async () => {
  const { env } = await envPush();
  const tel = await faireTelephone('x');
  for (const endpoint of ['https://pirate.example/collecte', 'http://web.push.apple.com/x', 'https://web.push.apple.com.pirate.example/x', 'https://pirateweb.push.apple.com/x']) {
    tel.abonnement.endpoint = endpoint;
    assert.equal((await abonner(env, ENV.ACCESS_CODE, tel)).status, 400, endpoint);
  }
  const telOk = await faireTelephone('expire');
  await abonner(env, ENV.ACCESS_CODE, telOk);
  globalThis.fetch = async () => new Response('', { status: 410 });
  await defis(env, '', { code: 'code-parent-un', methode: 'POST', corps: { id: 'd1', questions: QUESTIONS_DEFI } });
  assert.equal(env.DB.lire('SELECT * FROM abonnements_push').length, 0);
});

test('sans clé VAPID, les notifications sont coupées sans gêner les défis', async () => {
  const env = { ...ENV, DB: faireD1() };
  const reponse = await worker.fetch(new Request('https://exemple.test/api/notifications', { headers: { 'x-access-code': ENV.ACCESS_CODE } }), env);
  assert.equal(reponse.status, 503);
  assert.equal((await defis(env, '', { methode: 'POST', corps: { id: 'd1', questions: QUESTIONS_DEFI } })).statut, 200);
});
