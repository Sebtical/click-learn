// Worker Cloudflare — sert les fichiers statiques (public/) et fait office de proxy
// vers l'API Anthropic pour /api/claude. Le navigateur n'a jamais la vraie clé API :
// il envoie juste le code d'accès (state.accessCode), qu'on vérifie ici avant de relayer
// vers Anthropic en y ajoutant la clé API — qui elle ne vit que comme secret Cloudflare
// (env.ANTHROPIC_API_KEY), jamais dans le repo ni servie au client.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

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

  const body = await request.text();

  const anthropicResponse = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body
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
