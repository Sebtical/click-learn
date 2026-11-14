// Tests du proxy /api/claude (worker.js) : ce que le serveur laisse réellement partir chez Anthropic.
// Lancement : node --test tests/worker.test.mjs (aucune dépendance, node:test est fourni avec Node).

// ── Imports et réglages ──
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, test } from 'node:test';
import worker from '../worker.js';

const ENV = {
  ACCESS_CODE: 'code-de-test',
  PARENT_CODE_1: 'code-parent-un',
  PARENT_CODE_2: 'code-parent-deux',
  ANTHROPIC_API_KEY: 'cle-de-test'
};
const MODELE_SERVEUR = 'claude-haiku-4-5-20251001';
const PLAFOND = 5000;

// ── Outils de test ──
let envois;
const fetchOriginal = globalThis.fetch;

// Remplace l'appel réseau par un enregistreur : aucun test ne contacte Anthropic.
beforeEach(() => {
  envois = [];
  globalThis.fetch = async (url, options) => {
    envois.push({ url, options, corps: JSON.parse(options.body) });
    return new Response('{"content":[]}', { status: 200 });
  };
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

test('max_tokens au-delà du plafond est ramené au plafond', async () => {
  await appeler({ max_tokens: 999999, messages: MESSAGES });
  assert.equal(envois[0].corps.max_tokens, PLAFOND);
});

test('max_tokens sous le plafond est conservé', async () => {
  await appeler({ max_tokens: 400, messages: MESSAGES });
  assert.equal(envois[0].corps.max_tokens, 400);
});

test('les champs non prévus ne partent pas chez Anthropic', async () => {
  await appeler({ max_tokens: 10, messages: MESSAGES, tools: [{ name: 'x' }], stream: true, thinking: {} });
  assert.deepEqual(Object.keys(envois[0].corps).sort(), ['max_tokens', 'messages', 'model']);
});

test('system et messages sont transmis intacts', async () => {
  await appeler({ max_tokens: 10, system: 'consigne', messages: MESSAGES });
  assert.equal(envois[0].corps.system, 'consigne');
  assert.deepEqual(envois[0].corps.messages, MESSAGES);
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
  db.exec(readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
  const preparer = (sql, params = []) => ({
    bind: (...valeurs) => preparer(sql, valeurs),
    run: async () => { db.prepare(sql).run(...params); return { success: true }; },
    all: async () => ({ results: db.prepare(sql).all(...params) }),
    first: async () => db.prepare(sql).get(...params) ?? null
  });
  return {
    prepare: sql => preparer(sql),
    async batch(instructions) {
      db.exec('BEGIN');
      try {
        for (const instruction of instructions) await instruction.run();
        db.exec('COMMIT');
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
  await synchroniser({ cours: [cours], profil: { prenom: 'Léa', niveau: '5ème' } }, { ...ENV, DB });
  await synchroniser({ profil: { prenom: 'Léa', niveau: '4ème' } }, { ...ENV, DB });
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
    profil: { prenom: 'Léa', niveau: '5ème' },
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
    assert.equal(suivi.profil.prenom, 'Léa');
    assert.equal(suivi.nbCours, 2);
    // Derniers cours, plus récent d'abord, notions déjà décodées ; jamais de photo
    assert.deepEqual(suivi.cours.map(c => c.titre), ['Fractions', 'La cellule']);
    assert.deepEqual(suivi.cours[1], { matiere: 'SVT', titre: 'La cellule', resume: 'Tout être vivant…', notions: ['noyau', 'membrane'], date: '2026-11-10' });
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
