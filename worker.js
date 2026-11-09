// Worker Cloudflare — sert les fichiers statiques (public/) et fait office de proxy
// vers l'API Anthropic pour /api/claude. Le navigateur n'a jamais la vraie clé API :
// il envoie juste le code d'accès (state.accessCode), qu'on vérifie ici avant de relayer
// vers Anthropic en y ajoutant la clé API — qui elle ne vit que comme secret Cloudflare
// (env.ANTHROPIC_API_KEY), jamais dans le repo ni servie au client.

// ── Réglages ──
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODELE_ANTHROPIC = 'claude-haiku-4-5-20251001';
const PLAFOND_MAX_TOKENS = 5000; // appel le plus long de l'appli : 5000 (app.js)

// ── Contrôles ──

// Comparaison à temps constant : on hache les deux valeurs (longueur de sortie fixe, 32 octets)
// puis on compare tous les octets sans jamais sortir de boucle en avance, pour qu'un attaquant
// ne puisse pas deviner le code d'accès caractère par caractère en mesurant le temps de réponse.
async function constantTimeEqual(a, b) {
  const enc = new TextEncoder();
  const [digestA, digestB] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b))
  ]);
  const viewA = new Uint8Array(digestA);
  const viewB = new Uint8Array(digestB);
  let diff = 0;
  for (let i = 0; i < viewA.length; i++) diff |= viewA[i] ^ viewB[i];
  return diff === 0;
}

// Reconstruit la demande côté serveur : modèle imposé, longueur plafonnée, champs non prévus écartés.
// Renvoie null si la demande est invalide, pour la refuser avant tout appel payant.
function construireCorpsAnthropic(texte) {
  let demande;
  try {
    demande = JSON.parse(texte);
  } catch {
    return null;
  }
  if (demande === null || typeof demande !== 'object' || Array.isArray(demande)) return null;
  if (!Number.isInteger(demande.max_tokens) || demande.max_tokens <= 0) return null;
  return {
    model: MODELE_ANTHROPIC,
    max_tokens: Math.min(demande.max_tokens, PLAFOND_MAX_TOKENS),
    ...(demande.system ? { system: demande.system } : {}),
    messages: demande.messages
  };
}

// ── Proxy ──
// Vérifie le code d'accès puis relaie vers Anthropic une demande bornée par le serveur.
async function handleClaudeProxy(request, env) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: { message: 'Méthode non autorisée.' } }), {
      status: 405,
      headers: { 'content-type': 'application/json' }
    });
  }

  const providedCode = request.headers.get('x-access-code') || '';
  const validCode = env.ACCESS_CODE || '';
  if (!validCode || !(await constantTimeEqual(providedCode, validCode))) {
    return new Response(JSON.stringify({ error: { message: 'Code d\'accès invalide.' } }), {
      status: 401,
      headers: { 'content-type': 'application/json' }
    });
  }

  // Le navigateur ne décide ni du modèle ni de la longueur maximale : c'est ce qui borne le coût si le code d'accès fuite
  const corps = construireCorpsAnthropic(await request.text());
  if (corps === null) {
    return new Response(JSON.stringify({ error: { message: 'Requête invalide.' } }), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    });
  }

  const anthropicResponse = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(corps)
  });

  return new Response(anthropicResponse.body, {
    status: anthropicResponse.status,
    headers: { 'content-type': 'application/json' }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/claude') {
      return handleClaudeProxy(request, env);
    }
    return env.ASSETS.fetch(request);
  }
};
