// Tests du proxy /api/claude (worker.js) : ce que le serveur laisse réellement partir chez Anthropic.
// Lancement : node --test tests/worker.test.mjs (aucune dépendance, node:test est fourni avec Node).

// ── Imports et réglages ──
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import worker from '../worker.js';

const ENV = { ACCESS_CODE: 'code-de-test', ANTHROPIC_API_KEY: 'cle-de-test' };
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
