// Worker Cloudflare — sert les fichiers statiques (public/) et fait office de proxy
// vers l'API Anthropic pour /api/claude. Le navigateur n'a jamais la vraie clé API :
// il envoie juste le code d'accès (state.accessCode), qu'on vérifie ici avant de relayer
// vers Anthropic en y ajoutant la clé API — qui elle ne vit que comme secret Cloudflare
// (env.ANTHROPIC_API_KEY), jamais dans le repo ni servie au client.
// Il enregistre aussi les résultats de l'enfant dans la base D1 (env.DB) via /api/sync.

// ── Réglages ──
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODELE_ANTHROPIC = 'claude-haiku-4-5-20251001';
const PLAFOND_MAX_TOKENS = 5000; // appel le plus long de l'appli : 5000 (app.js)
const TAILLE_MAX_LOT = 200;      // éléments par envoi /api/sync (le navigateur découpe en lots)
const LONGUEUR_MAX_TEXTE = 2000; // au-delà, un texte est tronqué avant d'entrer en base
const LIMITE_SUIVI = 5000;       // réponses les plus récentes renvoyées à l'espace parent
const LIMITE_COURS_SUIVI = 10;   // derniers cours détaillés dans l'espace parent

// ── Outils ──

// Construit une réponse JSON avec le bon statut HTTP.
function reponseJson(statut, objet) {
  return new Response(JSON.stringify(objet), {
    status: statut,
    headers: { 'content-type': 'application/json' }
  });
}

// Raccourci pour une réponse d'erreur au format attendu par api.js.
function erreur(statut, message) {
  return reponseJson(statut, { error: { message } });
}

// Lit un corps JSON qui doit être un objet ; renvoie null sinon.
function lireObjetJson(texte) {
  try {
    const objet = JSON.parse(texte);
    return objet !== null && typeof objet === 'object' && !Array.isArray(objet) ? objet : null;
  } catch {
    return null;
  }
}

// Garde un texte borné, ou null si la valeur n'est pas une chaîne.
function texteBorne(valeur, max = LONGUEUR_MAX_TEXTE) {
  return typeof valeur === 'string' ? valeur.slice(0, max) : null;
}

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

// Déduit le rôle à partir du code reçu : enfant, parent1, parent2, ou null si le code est inconnu.
// Tous les codes sont comparés à chaque fois, et un secret absent ne peut jamais correspondre.
async function roleDepuisCode(code, env) {
  const candidats = [
    ['enfant', env.ACCESS_CODE],
    ['parent1', env.PARENT_CODE_1],
    ['parent2', env.PARENT_CODE_2]
  ];
  let role = null;
  for (const [nom, valeur] of candidats) {
    if (valeur && (await constantTimeEqual(code, valeur)) && role === null) role = nom;
  }
  return role;
}

// Rôle de la requête à partir de son en-tête x-access-code.
function roleDeLaRequete(request, env) {
  return roleDepuisCode(request.headers.get('x-access-code') || '', env);
}

// Contrôle commun à toutes les routes : méthode attendue, code connu, rôle autorisé (null = tous).
// Renvoie { role } si l'accès est accordé, sinon { refus } : la réponse d'erreur à renvoyer telle quelle.
async function controlerAcces(request, env, methode, rolesAutorises = null, messageRefus = 'Accès non autorisé.') {
  if (request.method !== methode) return { refus: erreur(405, 'Méthode non autorisée.') };
  const role = await roleDeLaRequete(request, env);
  if (role === null) return { refus: erreur(401, 'Code d\'accès invalide.') };
  if (rolesAutorises && !rolesAutorises.includes(role)) return { refus: erreur(403, messageRefus) };
  return { role };
}

// Reconstruit la demande côté serveur : modèle imposé, longueur plafonnée, champs non prévus écartés.
// Renvoie null si la demande est invalide, pour la refuser avant tout appel payant.
function construireCorpsAnthropic(texte) {
  const demande = lireObjetJson(texte);
  if (demande === null) return null;
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
  const { refus } = await controlerAcces(request, env, 'POST');
  if (refus) return refus;

  // Le navigateur ne décide ni du modèle ni de la longueur maximale : la dépense par appel est bornée
  // (le nombre d'appels, lui, ne l'est pas : c'est le rôle de la limite de dépenses côté Anthropic).
  const corps = construireCorpsAnthropic(await request.text());
  if (corps === null) return erreur(400, 'Requête invalide.');

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

// ── Profils ──
// Indique au navigateur le rôle associé à son code, sans aucun appel payant.
async function handleMoi(request, env) {
  const { role, refus } = await controlerAcces(request, env, 'GET');
  return refus ?? reponseJson(200, { role });
}

// ── Synchronisation ──

// Valide une réponse envoyée par le navigateur ; renvoie les valeurs à insérer, ou null si elle est inutilisable.
function valeursTentative(t) {
  if (t === null || typeof t !== 'object') return null;
  if (typeof t.id !== 'string' || !t.id || t.id.length > 100) return null;
  if (typeof t.correct !== 'boolean' || typeof t.date !== 'string') return null;
  return [
    t.id, texteBorne(t.quizId, 100), texteBorne(t.questionId, 100), texteBorne(t.subject, 100),
    texteBorne(t.theme, 200), texteBorne(t.notion, 300), texteBorne(t.type, 30),
    t.correct ? 1 : 0, t.date.slice(0, 40),
    texteBorne(t.enonce), texteBorne(t.reponseDonnee), texteBorne(t.bonneReponse)
  ];
}

// Valide un résumé de cours ; renvoie les valeurs à insérer, ou null s'il est inutilisable.
function valeursCours(c) {
  if (c === null || typeof c !== 'object') return null;
  if (typeof c.id !== 'string' || !c.id || c.id.length > 100 || typeof c.date !== 'string') return null;
  const notions = Array.isArray(c.notions)
    ? c.notions.filter(n => typeof n === 'string').map(n => n.slice(0, 300)).slice(0, 50)
    : [];
  return [
    c.id, texteBorne(c.matiere, 100), texteBorne(c.titre, 300), texteBorne(c.resume),
    JSON.stringify(notions), c.date.slice(0, 40)
  ];
}

// Enregistre les réponses, cours et profil de l'enfant. Seul le code enfant peut écrire ici,
// et le joueur est toujours fixé par le serveur, quoi que le navigateur envoie.
async function handleSync(request, env) {
  const { role, refus } = await controlerAcces(request, env, 'POST', ['enfant'], 'Seul le profil enfant partage ses résultats.');
  if (refus) return refus;

  // Lecture et contrôle de la forme générale de l'envoi
  const envoi = lireObjetJson(await request.text());
  if (envoi === null) return erreur(400, 'Requête invalide.');
  const tentatives = envoi.tentatives ?? [];
  const cours = envoi.cours ?? [];
  if (!Array.isArray(tentatives) || !Array.isArray(cours)) return erreur(400, 'Requête invalide.');
  if (tentatives.length + cours.length > TAILLE_MAX_LOT) return erreur(400, 'Envoi trop volumineux.');

  // Préparation des écritures : les éléments invalides sont écartés et comptés.
  // Le rôle est toujours lié en dernier : ?13 pour les réponses, ?7 pour les cours.
  const ecritures = [];
  let ignores = 0;
  for (const t of tentatives) {
    const valeurs = valeursTentative(t);
    if (valeurs === null) { ignores++; continue; }
    ecritures.push(env.DB.prepare(
      `INSERT OR IGNORE INTO tentatives
        (id, joueur, quiz_id, question_id, matiere, theme, notion, type, correct, date, enonce, reponse_donnee, bonne_reponse)
       VALUES (?1, ?13, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`
    ).bind(...valeurs, role));
  }
  for (const c of cours) {
    const valeurs = valeursCours(c);
    if (valeurs === null) { ignores++; continue; }
    ecritures.push(env.DB.prepare(
      `INSERT OR IGNORE INTO cours (id, joueur, matiere, titre, resume, notions, date)
       VALUES (?1, ?7, ?2, ?3, ?4, ?5, ?6)`
    ).bind(...valeurs, role));
  }

  // Profil : prénom et niveau, mis à jour à chaque envoi
  const profil = envoi.profil;
  if (profil && typeof profil === 'object') {
    ecritures.push(env.DB.prepare(
      `INSERT INTO profils (role, prenom, niveau, maj) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT (role) DO UPDATE SET prenom = excluded.prenom, niveau = excluded.niveau, maj = excluded.maj`
    ).bind(role, texteBorne(profil.prenom, 60), texteBorne(profil.niveau, 10), new Date().toISOString()));
  }

  // Écriture en une seule transaction : tout ou rien (un batch compte pour une seule requête D1)
  try {
    if (ecritures.length) await env.DB.batch(ecritures);
  } catch {
    return erreur(500, 'Enregistrement impossible pour le moment.'); // le navigateur réessaiera plus tard
  }
  return reponseJson(200, { recus: tentatives.length + cours.length, ignores });
}

// ── Espace parent ──

// Décode la liste de notions stockée en JSON ; une valeur illisible donne une liste vide.
function lireNotions(texte) {
  try {
    const notions = JSON.parse(texte);
    return Array.isArray(notions) ? notions.filter(n => typeof n === 'string') : [];
  } catch {
    return [];
  }
}

// Renvoie le profil, les dernières réponses, le nombre et le détail des derniers cours de l'enfant ;
// lecture réservée aux codes parents.
async function handleSuivi(request, env) {
  const { refus } = await controlerAcces(request, env, 'GET', ['parent1', 'parent2'], 'Espace réservé aux parents.');
  if (refus) return refus;

  let profil, tentatives, cours, derniersCours;
  try {
    [profil, tentatives, cours, derniersCours] = await Promise.all([
      env.DB.prepare('SELECT prenom, niveau, maj FROM profils WHERE role = ?1').bind('enfant').first(),
      env.DB.prepare(
        `SELECT id, quiz_id, matiere, theme, notion, type, correct, date, enonce, reponse_donnee, bonne_reponse
         FROM tentatives WHERE joueur = ?1 ORDER BY date DESC LIMIT ?2`
      ).bind('enfant', LIMITE_SUIVI).all(),
      env.DB.prepare('SELECT COUNT(*) AS nb FROM cours WHERE joueur = ?1').bind('enfant').first(),
      env.DB.prepare(
        'SELECT matiere, titre, resume, notions, date FROM cours WHERE joueur = ?1 ORDER BY date DESC LIMIT ?2'
      ).bind('enfant', LIMITE_COURS_SUIVI).all()
    ]);
  } catch {
    return erreur(500, 'Lecture du suivi impossible pour le moment.');
  }
  return reponseJson(200, {
    profil: profil ?? null,
    tentatives: tentatives.results,
    nbCours: cours?.nb ?? 0,
    cours: derniersCours.results.map(c => ({ ...c, notions: lireNotions(c.notions) })),
    tronque: tentatives.results.length === LIMITE_SUIVI // l'écran parent le signale : chiffres sur les dernières réponses
  });
}

// ── Aiguillage ──
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/moi') return handleMoi(request, env);
    if (url.pathname === '/api/parent/suivi') return handleSuivi(request, env);
    if (url.pathname === '/api/sync') return handleSync(request, env);
    if (url.pathname === '/api/claude') return handleClaudeProxy(request, env);
    return env.ASSETS.fetch(request);
  }
};
