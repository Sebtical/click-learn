// Worker Cloudflare — sert les fichiers statiques (public/) et fait office de proxy
// vers l'API Anthropic pour /api/claude. Le navigateur n'a jamais la vraie clé API :
// il envoie juste le code d'accès (state.accessCode), qu'on vérifie ici avant de relayer
// vers Anthropic en y ajoutant la clé API — qui elle ne vit que comme secret Cloudflare
// (env.ANTHROPIC_API_KEY), jamais dans le repo ni servie au client.
// Il enregistre aussi les résultats de l'enfant dans la base D1 (env.DB) via /api/sync.

// ── Réglages ──
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODELE_ANTHROPIC = 'claude-haiku-5-5';
const NIVEAU_REFLEXION = 'low';  // le modèle réfléchit avant de répondre : niveau bas, suffisant pour l'appli
const PLAFOND_MAX_TOKENS = 6000; // longueur de réponse maximale qu'un navigateur peut demander
const MARGE_REFLEXION = 2000;    // ajoutée par le serveur : la réflexion compte dans max_tokens
const TAILLE_MAX_LOT = 200;      // éléments par envoi /api/sync (le navigateur découpe en lots)
const LONGUEUR_MAX_TEXTE = 2000; // au-delà, un texte est tronqué avant d'entrer en base
const LIMITE_SUIVI = 5000;       // réponses les plus récentes renvoyées à l'espace parent
const LIMITE_COURS_SUIVI = 10;   // derniers cours montrés dans la vue d'ensemble parent
const COURS_PAR_PAGE = 20;       // cours par page dans l'onglet « Cours » de l'espace parent
const LONGUEUR_MAX_FICHE = 20000; // fiche détaillée d'un cours (quelques pages)
const LONGUEUR_MAX_EXPLICATION = 6000; // méthode ou exemple d'un cours sur mesure
const TAILLE_MAX_ENVOI = 2000000;  // caractères d'un envoi /api/sync, refusé au-delà
const MAX_QUESTIONS_DEFI = 15;     // questions d'un défi (10 en pratique)
const TAILLE_MAX_QUESTIONS_DEFI = 100000; // caractères du quiz figé d'un défi
const LIMITE_DEFIS = 30;          // défis les plus récents renvoyés à la liste
// Limites d'une carte mentale : les mêmes que dans public/js/carte.js (à modifier ensemble)
const CARTE_MAX_BRANCHES = 6, CARTE_MAX_ELEMENTS = 5, CARTE_LONGUEUR_MAX = 90, CARTE_CENTRE_MAX = 40;

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

// Reconstruit la demande côté serveur : modèle et réflexion imposés, longueur plafonnée, champs non prévus écartés.
// Renvoie null si la demande est invalide, pour la refuser avant tout appel payant.
function construireCorpsAnthropic(texte) {
  const demande = lireObjetJson(texte);
  if (demande === null) return null;
  if (!Number.isInteger(demande.max_tokens) || demande.max_tokens <= 0) return null;
  return {
    model: MODELE_ANTHROPIC,
    max_tokens: Math.min(demande.max_tokens, PLAFOND_MAX_TOKENS) + MARGE_REFLEXION,
    output_config: { effort: NIVEAU_REFLEXION },
    ...(demande.system ? { system: demande.system } : {}),
    messages: demande.messages
  };
}

// Traduit la réponse d'Anthropic pour le navigateur : seulement les blocs de texte et la consommation,
// ou un message clair si le modèle a refusé ou a manqué de place (le JSON serait alors coupé).
function reponsePourNavigateur(data) {
  if (data.stop_reason === 'refusal') return erreur(422, "L'IA a refusé cette demande. Essaie de la reformuler.");
  if (data.stop_reason === 'max_tokens') return erreur(502, "La réponse de l'IA était trop longue. Réessaie.");
  const textes = (data.content || []).filter(bloc => bloc.type === 'text').map(bloc => ({ type: 'text', text: bloc.text }));
  return reponseJson(200, { content: textes, usage: data.usage ?? null });
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

  // Appel à Anthropic ; une coupure réseau donne un message clair plutôt qu'une erreur générique
  let anthropicResponse;
  try {
    anthropicResponse = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(corps)
    });
  } catch {
    return erreur(502, "L'IA est injoignable pour le moment. Réessaie dans un instant.");
  }

  // Erreur d'Anthropic (surcharge, quota…) : relayée telle quelle, son format est déjà celui attendu par api.js
  if (!anthropicResponse.ok) {
    return new Response(anthropicResponse.body, {
      status: anthropicResponse.status,
      headers: { 'content-type': 'application/json' }
    });
  }
  let data;
  try {
    data = await anthropicResponse.json();
  } catch {
    return erreur(502, "Réponse de l'IA illisible. Réessaie.");
  }
  // Consommation de l'appel (nombres de jetons seulement, aucun contenu) : visible dans les journaux du Worker
  console.log('jetons', data.usage?.input_tokens, data.usage?.output_tokens);
  return reponsePourNavigateur(data);
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

// Liste de textes courts : seulement des chaînes, bornées en nombre et en longueur.
function listeTextes(valeur, maxElements, maxLongueur) {
  return (Array.isArray(valeur) ? valeur : []).filter(t => typeof t === 'string')
    .map(t => t.trim().slice(0, maxLongueur)).filter(Boolean).slice(0, maxElements);
}

// Carte mentale reçue : remise en forme stricte (centre, 6 branches de 5 éléments au plus), en JSON ; null sinon.
// Mêmes limites que validerCarteMentale (carte.js) : à modifier aux deux endroits ensemble.
function carteValide(carte) {
  if (!carte || typeof carte !== 'object' || !Array.isArray(carte.branches)) return null;
  const branches = carte.branches
    .filter(b => b && typeof b.titre === 'string' && b.titre.trim())
    .slice(0, CARTE_MAX_BRANCHES)
    .map(b => ({ titre: b.titre.trim().slice(0, CARTE_LONGUEUR_MAX), elements: listeTextes(b.elements, CARTE_MAX_ELEMENTS, CARTE_LONGUEUR_MAX) }));
  if (branches.length < 2) return null;
  const centre = typeof carte.centre === 'string' ? carte.centre.trim().slice(0, CARTE_CENTRE_MAX).trim() : '';
  return JSON.stringify({ centre: centre || 'Mon cours', branches });
}

// Explications d'un cours sur mesure reçues : 10 au plus, champs texte bornés, en JSON ; null sinon.
function explicationsValides(liste) {
  if (!Array.isArray(liste)) return null;
  // Comme dans l'appli (validerCoursSurMesure) : une explication sans méthode est écartée
  const propres = liste.filter(e => e && typeof e === 'object' && typeof e.methode === 'string' && e.methode.trim()).slice(0, 10).map(e => ({
    notion: texteBorne(e.notion, 300) ?? '', erreur: texteBorne(e.erreur) ?? '',
    methode: texteBorne(e.methode, LONGUEUR_MAX_EXPLICATION) ?? '', exemple: texteBorne(e.exemple, LONGUEUR_MAX_EXPLICATION) ?? ''
  }));
  return propres.length ? JSON.stringify(propres) : null;
}

// Valide un cours ; renvoie les valeurs à insérer, ou null s'il est inutilisable.
function valeursCours(c) {
  if (c === null || typeof c !== 'object') return null;
  if (typeof c.id !== 'string' || !c.id || c.id.length > 100 || typeof c.date !== 'string') return null;
  const notions = listeTextes(c.notions, 50, 300);
  return [
    c.id, texteBorne(c.matiere, 100), texteBorne(c.titre, 300), texteBorne(c.resume),
    JSON.stringify(notions), c.date.slice(0, 40),
    c.type === 'sur-mesure' ? 'sur-mesure' : null, texteBorne(c.fiche, LONGUEUR_MAX_FICHE),
    carteValide(c.carte), explicationsValides(c.explications)
  ];
}

// Enregistre les réponses, cours et profil de l'enfant. Seul le code enfant peut écrire ici,
// et le joueur est toujours fixé par le serveur, quoi que le navigateur envoie.
async function handleSync(request, env) {
  const { role, refus } = await controlerAcces(request, env, 'POST', ['enfant'], 'Seul le profil enfant partage ses résultats.');
  if (refus) return refus;

  // Lecture et contrôle de la forme générale de l'envoi
  // Taille annoncée vérifiée avant de lire le corps, puis taille réelle après lecture
  if (Number(request.headers.get('content-length')) > TAILLE_MAX_ENVOI * 4) return erreur(413, 'Envoi trop volumineux.');
  const texte = await request.text();
  if (texte.length > TAILLE_MAX_ENVOI) return erreur(413, 'Envoi trop volumineux.');
  const envoi = lireObjetJson(texte);
  if (envoi === null) return erreur(400, 'Requête invalide.');
  const tentatives = envoi.tentatives ?? [];
  const cours = envoi.cours ?? [];
  if (!Array.isArray(tentatives) || !Array.isArray(cours)) return erreur(400, 'Requête invalide.');
  if (tentatives.length + cours.length > TAILLE_MAX_LOT) return erreur(400, 'Envoi trop volumineux.');

  // Préparation des écritures : les éléments invalides sont écartés et comptés.
  // Le rôle est toujours lié en dernier : ?13 pour les réponses, ?11 pour les cours.
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
      // Un cours déjà reçu est complété (fiche ou carte créées après coup), seulement pour le même joueur
      `INSERT INTO cours (id, joueur, matiere, titre, resume, notions, date, type, fiche, carte, explications)
       VALUES (?1, ?11, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
       ON CONFLICT (id) DO UPDATE SET
         type = COALESCE(excluded.type, cours.type),
         fiche = COALESCE(excluded.fiche, cours.fiche),
         carte = COALESCE(excluded.carte, cours.carte),
         explications = COALESCE(excluded.explications, cours.explications)
       WHERE cours.joueur = excluded.joueur`
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

// Décode un objet stocké en JSON ; une valeur absente ou illisible donne null.
function lireJson(texte) {
  try {
    return texte ? JSON.parse(texte) : null;
  } catch {
    return null;
  }
}

// Décode la liste de notions stockée en JSON ; une valeur illisible donne une liste vide.
function lireNotions(texte) {
  const notions = lireJson(texte);
  return Array.isArray(notions) ? notions.filter(n => typeof n === 'string') : [];
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
      env.DB.prepare(`SELECT ${COLONNES_COURS_LEGER} FROM cours WHERE joueur = ?1 ORDER BY date DESC LIMIT ?2`).bind('enfant', LIMITE_COURS_SUIVI).all()
    ]);
  } catch {
    return erreur(500, 'Lecture du suivi impossible pour le moment.');
  }
  return reponseJson(200, {
    profil: profil ?? null,
    tentatives: tentatives.results,
    nbCours: cours?.nb ?? 0,
    cours: derniersCours.results.map(coursLeger),
    tronque: tentatives.results.length === LIMITE_SUIVI // l'écran parent le signale : chiffres sur les dernières réponses
  });
}

// Colonnes d'un cours sans son contenu (fiche, carte, explications), chargé seulement à la demande.
const COLONNES_COURS_LEGER = `id, matiere, titre, resume, notions, date, type,
  fiche IS NOT NULL AS a_fiche, carte IS NOT NULL AS a_carte, explications IS NOT NULL AS a_explications`;

// Cours léger prêt à envoyer : notions décodées, indicateurs de contenu en booléens.
function coursLeger(c) {
  return { ...c, notions: lireNotions(c.notions), a_fiche: !!c.a_fiche, a_carte: !!c.a_carte, a_explications: !!c.a_explications };
}

// /api/parent/cours (liste paginée, filtrable par matière) et /api/parent/cours/:id (contenu d'un cours).
async function handleParentCours(request, env, chemin) {
  const { refus } = await controlerAcces(request, env, 'GET', ['parent1', 'parent2'], 'Espace réservé aux parents.');
  if (refus) return refus;
  const id = decoderSegment(chemin.split('/')[4] || '');
  if (id === null) return erreur(400, 'Adresse invalide.');
  try {
    // Contenu d'un cours : fiche, carte et explications, lus au clic
    if (id) {
      const c = await env.DB.prepare('SELECT fiche, carte, explications FROM cours WHERE joueur = ?1 AND id = ?2').bind('enfant', id).first();
      if (!c) return erreur(404, 'Cours introuvable.');
      return reponseJson(200, { fiche: c.fiche, carte: lireJson(c.carte), explications: lireJson(c.explications) ?? [] });
    }
    // Liste paginée : une page de plus est demandée pour savoir s'il en reste
    const url = new URL(request.url);
    const page = Math.max(0, Math.min(Number.parseInt(url.searchParams.get('page'), 10) || 0, 500));
    const matiere = (url.searchParams.get('matiere') || '').slice(0, 100);
    const filtre = matiere ? ' AND matiere = ?4' : '';
    // Les matières (pour le filtre) ne sont lues qu'avec la première page, la seule qui les affiche
    const [liste, matieres] = await Promise.all([
      env.DB.prepare(`SELECT ${COLONNES_COURS_LEGER} FROM cours WHERE joueur = ?1${filtre} ORDER BY date DESC LIMIT ?2 OFFSET ?3`)
        .bind('enfant', COURS_PAR_PAGE + 1, page * COURS_PAR_PAGE, ...(matiere ? [matiere] : [])).all(),
      page === 0 ? env.DB.prepare('SELECT DISTINCT matiere FROM cours WHERE joueur = ?1 AND matiere IS NOT NULL ORDER BY matiere').bind('enfant').all() : null
    ]);
    return reponseJson(200, {
      cours: liste.results.slice(0, COURS_PAR_PAGE).map(coursLeger),
      suivant: liste.results.length > COURS_PAR_PAGE,
      matieres: matieres ? matieres.results.map(m => m.matiere) : []
    });
  } catch {
    return erreur(500, 'Lecture des cours impossible pour le moment.');
  }
}

// ── Notifications (Web Push) ──
// Chiffrement du message (RFC 8291, aes128gcm) et signature du serveur (RFC 8292, VAPID), écrits avec
// les outils de chiffrement intégrés (WebCrypto), sans dépendance. Le message passe par le service
// d'Apple ou de Google, qui ne peut pas le lire. Secret requis : VAPID_JWK (clé privée P-256 en JWK).

// Services de notification acceptés : le serveur ne contacte jamais une autre adresse.
const SERVICES_PUSH = ['web.push.apple.com', 'fcm.googleapis.com', 'updates.push.services.mozilla.com', 'notify.windows.com'];
const CONTACT_VAPID = 'https://click-learn.scanquelain.workers.dev'; // contact exigé par la norme : le site, pas un e-mail

// Encodage base64url (sans remplissage) d'octets, et l'inverse.
function versBase64Url(octets) {
  let binaire = '';
  for (const o of new Uint8Array(octets)) binaire += String.fromCharCode(o);
  return btoa(binaire).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function depuisBase64Url(texte) {
  const b64 = texte.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64 + '='.repeat((4 - b64.length % 4) % 4)), c => c.charCodeAt(0));
}

// Concatène des suites d'octets.
function concatener(...parts) {
  const total = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) { total.set(p, i); i += p.length; }
  return total;
}

// HKDF-SHA256 (dérivation de clé) : longueur octets à partir d'un sel, d'un secret et d'une info.
async function hkdf(sel, secret, info, longueur) {
  const cle = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: sel, info }, cle, longueur * 8));
}

// Chiffre un message pour un téléphone (RFC 8291) ; renvoie le corps binaire à envoyer.
async function chiffrerPush(message, p256dh, auth) {
  const clePubliqueTel = depuisBase64Url(p256dh);
  const secretTel = depuisBase64Url(auth);
  // Paire de clés éphémère du serveur, puis secret commun avec le téléphone (ECDH)
  const ephemere = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const clePubliqueServeur = new Uint8Array(await crypto.subtle.exportKey('raw', ephemere.publicKey));
  const cleTel = await crypto.subtle.importKey('raw', clePubliqueTel, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const secretEcdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: cleTel }, ephemere.privateKey, 256));
  // Dérivations de la norme : clé de contenu (16 octets) et nonce (12 octets)
  const enc = new TextEncoder();
  const ikm = await hkdf(secretTel, secretEcdh, concatener(enc.encode('WebPush: info\0'), clePubliqueTel, clePubliqueServeur), 32);
  const sel = crypto.getRandomValues(new Uint8Array(16));
  const cleContenu = await hkdf(sel, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(sel, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  // Chiffrement AES-GCM du message suivi du délimiteur de dernier bloc (0x02)
  const cleAes = await crypto.subtle.importKey('raw', cleContenu, 'AES-GCM', false, ['encrypt']);
  const chiffre = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cleAes, concatener(enc.encode(message), new Uint8Array([2]))));
  // En-tête : sel, taille de bloc (4096), longueur et valeur de la clé publique du serveur
  const entete = concatener(sel, new Uint8Array([0, 0, 16, 0]), new Uint8Array([clePubliqueServeur.length]), clePubliqueServeur);
  return concatener(entete, chiffre);
}

// Clé publique du serveur (base64url, 65 octets) tirée de la clé privée JWK : à donner aux téléphones.
function clePubliqueVapid(jwk) {
  return versBase64Url(concatener(new Uint8Array([4]), depuisBase64Url(jwk.x), depuisBase64Url(jwk.y)));
}

// Signature du serveur (RFC 8292) : jeton JWT ES256 valable 12 h pour le service visé.
async function enteteVapid(endpoint, jwk) {
  const enc = new TextEncoder();
  const enTete = versBase64Url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const charge = versBase64Url(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: CONTACT_VAPID
  })));
  const cle = await crypto.subtle.importKey('jwk', { ...jwk, key_ops: ['sign'] }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, cle, enc.encode(`${enTete}.${charge}`));
  return `vapid t=${enTete}.${charge}.${versBase64Url(signature)}, k=${clePubliqueVapid(jwk)}`;
}

// Clé privée VAPID depuis le secret ; null si absente ou illisible (les notifications sont alors coupées).
function lireCleVapid(env) {
  const jwk = lireJson(env.VAPID_JWK);
  return jwk && jwk.kty === 'EC' && jwk.d && jwk.x && jwk.y ? jwk : null;
}

// Adresse d'abonnement acceptable : https, vers un service de notification connu.
function endpointAccepte(endpoint) {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && SERVICES_PUSH.some(h => url.hostname === h || url.hostname.endsWith('.' + h));
  } catch {
    return false;
  }
}

// Envoie un message à un abonnement ; un abonnement expiré (404 ou 410) est supprimé.
async function envoyerPush(env, abonnement, message, jwk) {
  try {
    const reponse = await fetch(abonnement.endpoint, {
      method: 'POST',
      headers: {
        authorization: await enteteVapid(abonnement.endpoint, jwk),
        'content-encoding': 'aes128gcm',
        'content-type': 'application/octet-stream',
        ttl: '86400',
        urgency: 'normal'
      },
      body: await chiffrerPush(JSON.stringify(message), abonnement.p256dh, abonnement.auth)
    });
    if (reponse.status === 404 || reponse.status === 410) {
      await env.DB.prepare('DELETE FROM abonnements_push WHERE endpoint = ?1').bind(abonnement.endpoint).run();
    }
  } catch {
    // Une notification ratée ne doit jamais faire échouer l'action du joueur
  }
}

// Nombre de défis qu'un joueur n'a pas encore joués, y compris ceux qu'il a lancés (pastille sur l'icône).
async function defisEnAttente(env, role) {
  const ligne = await env.DB.prepare(
    `SELECT COUNT(*) AS nb FROM (SELECT id FROM defis ORDER BY cree_le DESC LIMIT ?2) d
       WHERE NOT EXISTS (SELECT 1 FROM participations p WHERE p.defi_id = d.id AND p.joueur = ?1)`
  ).bind(role, LIMITE_DEFIS).first(); // mêmes défis que la liste de l'appli, sinon la pastille compterait des défis introuvables
  return ligne?.nb ?? 0;
}

// Notifie tous les joueurs sauf l'auteur de l'action ; message(role) donne { titre, corps } pour chacun.
async function notifierAutres(env, auteur, message) {
  const jwk = lireCleVapid(env);
  if (!jwk) return;
  let abonnements;
  try {
    abonnements = (await env.DB.prepare('SELECT * FROM abonnements_push WHERE role != ?1').bind(auteur).all()).results;
  } catch {
    return;
  }
  // Pastille calculée une fois par joueur, même s'il a plusieurs appareils abonnés
  const pastilles = new Map();
  const pastille = role => {
    if (!pastilles.has(role)) pastilles.set(role, defisEnAttente(env, role).catch(() => 0));
    return pastilles.get(role);
  };
  await Promise.all(abonnements.map(async a => {
    const contenu = message(a.role);
    if (!contenu) return;
    await envoyerPush(env, a, { ...contenu, badge: await pastille(a.role) }, jwk);
  }));
}

// /api/notifications : GET donne la clé publique du serveur ; POST enregistre l'abonnement du téléphone.
async function handleNotifications(request, env) {
  const methode = request.method === 'POST' ? 'POST' : 'GET';
  const { role, refus } = await controlerAcces(request, env, methode);
  if (refus) return refus;
  const jwk = lireCleVapid(env);
  if (!jwk) return erreur(503, 'Notifications indisponibles pour le moment.');
  if (methode === 'GET') return reponseJson(200, { cle: clePubliqueVapid(jwk) });
  const envoi = lireObjetJson(await request.text());
  const endpoint = envoi?.endpoint;
  const p256dh = envoi?.keys?.p256dh, auth = envoi?.keys?.auth;
  if (typeof endpoint !== 'string' || endpoint.length > 1000 || !endpointAccepte(endpoint)
    || typeof p256dh !== 'string' || p256dh.length > 200 || typeof auth !== 'string' || auth.length > 100) {
    return erreur(400, 'Abonnement invalide.');
  }
  try {
    await env.DB.prepare(
      `INSERT INTO abonnements_push (endpoint, role, p256dh, auth, maj) VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT (endpoint) DO UPDATE SET role = excluded.role, p256dh = excluded.p256dh, auth = excluded.auth, maj = excluded.maj`
    ).bind(endpoint, role, p256dh, auth, new Date().toISOString()).run();
  } catch {
    return erreur(500, 'Enregistrement impossible pour le moment.');
  }
  return reponseJson(200, { abonne: true });
}

// Nom affiché d'un joueur dans une notification (surnom, sinon « Papa/Maman » par défaut).
async function nomJoueur(env, role) {
  const noms = await surnoms(env).catch(() => ({}));
  return noms[role] || { enfant: 'Ton enfant', parent1: 'Un parent', parent2: 'Un parent' }[role];
}

// ── Défis en famille ──
// Un joueur lance un quiz figé ; chacun le joue quand il veut ; les réponses des autres ne sont
// visibles qu'après avoir joué soi-même. Le joueur est toujours déduit du code d'accès.

const TYPES_QUESTION_DEFI = ['qcm', 'qcm-multi', 'num', 'court'];

// Une question est jouable si elle a ce que l'écran de quiz lit pour son type
// (sinon le quiz planterait chez les autres joueurs).
function questionJouable(q) {
  if (!q || typeof q !== 'object' || !TYPES_QUESTION_DEFI.includes(q.type) || typeof q.enonce !== 'string') return false;
  const indiceValide = i => Number.isInteger(i) && i >= 0 && i < q.choix.length;
  const choixValides = Array.isArray(q.choix) && q.choix.length >= 2 && q.choix.every(c => typeof c === 'string' || typeof c === 'number');
  if (q.type === 'qcm') return choixValides && indiceValide(q.correctIndex);
  if (q.type === 'qcm-multi') return choixValides && Array.isArray(q.correctIndexes) && q.correctIndexes.length > 0 && q.correctIndexes.every(indiceValide);
  if (q.type === 'num') return typeof q.answer === 'number' && Number.isFinite(q.answer);
  return Array.isArray(q.reponses) && q.reponses.length > 0 && q.reponses.every(r => typeof r === 'string'); // court
}

// Questions d'un défi reçues : 1 à 15, jouables, sans figure (seul HTML affiché tel quel),
// taille totale bornée ; null si inutilisables.
function questionsDefiValides(liste) {
  if (!Array.isArray(liste) || liste.length === 0 || liste.length > MAX_QUESTIONS_DEFI) return null;
  const propres = [];
  for (const q of liste) {
    if (!questionJouable(q)) return null;
    const { fig, ...sansFigure } = q;
    propres.push(sansFigure);
  }
  const texte = JSON.stringify(propres);
  return texte.length <= TAILLE_MAX_QUESTIONS_DEFI ? texte : null;
}

// Réponses d'une participation : une par question au plus, texte court et booléen.
function reponsesValides(liste, total) {
  if (!Array.isArray(liste)) return '[]';
  return JSON.stringify(liste.slice(0, total).map(r => ({
    reponse: texteBorne(r?.reponse, 300) ?? '',
    correct: r?.correct === true
  })));
}

// Écrit en un lot une action de défi (lancement ou participation) et le surnom du joueur (« Papa »),
// affiché aux autres. Renvoie les résultats du lot, ou null si la base est indisponible.
async function ecrireAvecSurnom(env, role, ecriture, surnom) {
  const ecritures = [ecriture];
  if (surnom) {
    ecritures.push(env.DB.prepare(
      `INSERT INTO profils (role, prenom, maj) VALUES (?1, ?2, ?3)
       ON CONFLICT (role) DO UPDATE SET prenom = excluded.prenom, maj = excluded.maj`
    ).bind(role, surnom, new Date().toISOString()));
  }
  try {
    return await env.DB.batch(ecritures);
  } catch {
    return null;
  }
}

// Surnoms connus de chaque rôle (pour afficher « Papa », « Maman », le prénom de l'enfant).
async function surnoms(env) {
  const { results } = await env.DB.prepare('SELECT role, prenom FROM profils').all();
  return Object.fromEntries(results.map(p => [p.role, p.prenom]));
}

// Participations d'un défi vues par un joueur : les siennes en entier ; celles des autres avec score
// et réponses seulement s'il a déjà joué (sinon on sait juste qu'ils ont terminé).
function participationsVisibles(participations, role) {
  const aJoue = participations.some(p => p.joueur === role);
  return participations.map(p => (aJoue || p.joueur === role)
    ? { joueur: p.joueur, score: p.score, total: p.total, reponses: lireJson(p.reponses) ?? [], termine_le: p.termine_le }
    : { joueur: p.joueur, termine_le: p.termine_le });
}

// POST /api/defis : lance un défi (n'importe quel joueur).
async function creerDefi(request, env, role, ctx) {
  // Vérification de l'envoi : identifiant et questions jouables
  const envoi = lireObjetJson(await request.text());
  if (envoi === null || typeof envoi.id !== 'string' || !envoi.id || envoi.id.length > 100) return erreur(400, 'Défi invalide.');
  const questions = questionsDefiValides(envoi.questions);
  if (questions === null) return erreur(400, 'Questions du défi invalides.');
  // Écriture en un lot : le défi (ignoré s'il existe déjà) et le surnom du lanceur
  const surnom = texteBorne(envoi.surnom, 40);
  const resultats = await ecrireAvecSurnom(env, role, env.DB.prepare(
    `INSERT OR IGNORE INTO defis (id, lance_par, matiere, titre, questions, cree_le) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
  ).bind(envoi.id, role, texteBorne(envoi.matiere, 100), texteBorne(envoi.titre, 200), questions, new Date().toISOString()), surnom);
  if (!resultats) return erreur(500, 'Enregistrement impossible pour le moment.');
  // Nouveau défi (pas un renvoi du même) : les deux autres joueurs sont prévenus
  if (resultats[0]?.meta?.changes) {
    const nom = surnom || await nomJoueur(env, role);
    const titre = texteBorne(envoi.titre, 200) || 'un quiz';
    await attendre(ctx, notifierAutres(env, role, () => ({ titre: 'Nouveau défi 🏆', corps: `${nom} t'a lancé un défi : ${titre}` })));
  }
  return reponseJson(200, { id: envoi.id });
}

// GET /api/defis : les derniers défis, avec qui a terminé et ce que ce joueur a le droit de voir.
async function listerDefis(env, role) {
  let defis, participations, noms;
  try {
    [defis, participations, noms] = await Promise.all([
      env.DB.prepare(
        'SELECT id, lance_par, matiere, titre, cree_le, json_array_length(questions) AS nb_questions FROM defis ORDER BY cree_le DESC LIMIT ?1'
      ).bind(LIMITE_DEFIS).all(),
      env.DB.prepare(
        'SELECT p.* FROM participations p JOIN (SELECT id FROM defis ORDER BY cree_le DESC LIMIT ?1) d ON d.id = p.defi_id'
      ).bind(LIMITE_DEFIS).all(),
      surnoms(env)
    ]);
  } catch {
    return erreur(500, 'Lecture des défis impossible pour le moment.');
  }
  const liste = defis.results.map(d => {
    const parts = participations.results.filter(p => p.defi_id === d.id);
    return {
      id: d.id, lance_par: d.lance_par, matiere: d.matiere, titre: d.titre, cree_le: d.cree_le,
      nb_questions: d.nb_questions ?? 0,
      a_joue: parts.some(p => p.joueur === role),
      participations: participationsVisibles(parts, role).map(({ reponses, ...resume }) => resume)
    };
  });
  return reponseJson(200, { moi: role, surnoms: noms, defis: liste });
}

// GET /api/defis/:id : le quiz figé et les participations visibles par ce joueur.
async function lireDefi(env, role, id) {
  let defi, participations, noms;
  try {
    [defi, participations, noms] = await Promise.all([
      env.DB.prepare('SELECT * FROM defis WHERE id = ?1').bind(id).first(),
      env.DB.prepare('SELECT * FROM participations WHERE defi_id = ?1').bind(id).all(),
      surnoms(env)
    ]);
  } catch {
    return erreur(500, 'Lecture du défi impossible pour le moment.');
  }
  if (!defi) return erreur(404, 'Défi introuvable.');
  return reponseJson(200, {
    moi: role, surnoms: noms,
    defi: { id: defi.id, lance_par: defi.lance_par, matiere: defi.matiere, titre: defi.titre, cree_le: defi.cree_le, questions: lireJson(defi.questions) ?? [] },
    participations: participationsVisibles(participations.results, role)
  });
}

// POST /api/defis/:id/participation : enregistre le résultat de ce joueur (une seule fois).
async function participerDefi(request, env, role, id, ctx) {
  const envoi = lireObjetJson(await request.text());
  if (envoi === null) return erreur(400, 'Participation invalide.');
  // Lecture du défi : son nombre de questions borne le score et les réponses
  let defi;
  try {
    defi = await env.DB.prepare('SELECT questions, titre FROM defis WHERE id = ?1').bind(id).first();
  } catch {
    return erreur(500, 'Enregistrement impossible pour le moment.');
  }
  if (!defi) return erreur(404, 'Défi introuvable.');
  const total = (lireJson(defi.questions) ?? []).length;
  const score = Number.isInteger(envoi.score) ? Math.min(Math.max(envoi.score, 0), total) : null;
  if (score === null) return erreur(400, 'Score invalide.');
  // Écriture en un lot : la participation (une seule par joueur) et le surnom
  const surnom = texteBorne(envoi.surnom, 40);
  const resultats = await ecrireAvecSurnom(env, role, env.DB.prepare(
    `INSERT OR IGNORE INTO participations (defi_id, joueur, score, total, reponses, termine_le) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
  ).bind(id, role, score, total, reponsesValides(envoi.reponses, total), new Date().toISOString()), surnom);
  if (!resultats) return erreur(500, 'Enregistrement impossible pour le moment.');
  // INSERT OR IGNORE : aucune ligne écrite = ce joueur avait déjà joué (son premier résultat compte)
  if (resultats[0]?.meta?.changes === 0) return erreur(409, 'Tu as déjà joué ce défi.');
  // Les autres sont prévenus, sans le score (gardé pour l'appli) : « à toi » ou « qui a gagné ? »
  await attendre(ctx, (async () => {
    const titre = defi.titre || 'le défi';
    const [nom, participants] = await Promise.all([
      surnom || nomJoueur(env, role),
      env.DB.prepare('SELECT joueur FROM participations WHERE defi_id = ?1').bind(id).all()
    ]);
    const joueurs = new Set(participants.results.map(p => p.joueur));
    await notifierAutres(env, role, r => ({
      titre: 'Défi terminé 🏁',
      corps: joueurs.has(r) ? `${nom} a terminé « ${titre} » : découvrez qui a gagné !` : `${nom} a terminé « ${titre} » : à toi de jouer !`
    }));
  })().catch(() => {}));
  return reponseJson(200, { enregistre: true });
}

// Aiguillage des routes /api/defis… (tous les joueurs y ont accès).
async function handleDefis(request, env, chemin, ctx) {
  const morceaux = chemin.split('/').filter(Boolean); // ['api', 'defis', id?, 'participation'?]
  if (morceaux.length > 4 || (morceaux.length === 4 && morceaux[3] !== 'participation')) return erreur(404, 'Route inconnue.');
  const id = morceaux[2] ? decoderSegment(morceaux[2]) : '';
  if (id === null) return erreur(400, 'Adresse invalide.');
  // Méthode attendue : POST pour lancer un défi ou envoyer sa participation, GET sinon
  let methode = 'GET';
  if (morceaux.length === 4 || (morceaux.length === 2 && request.method === 'POST')) methode = 'POST';
  const { role, refus } = await controlerAcces(request, env, methode);
  if (refus) return refus;
  if (!id) return methode === 'POST' ? creerDefi(request, env, role, ctx) : listerDefis(env, role);
  if (id.length > 100) return erreur(400, 'Défi invalide.');
  return morceaux.length === 4 ? participerDefi(request, env, role, id, ctx) : lireDefi(env, role, id);
}

// Laisse une tâche finir après la réponse (notifications) ; sans contexte (tests), on renvoie la promesse pour l'attendre.
function attendre(ctx, promesse) {
  if (!ctx?.waitUntil) return promesse;
  ctx.waitUntil(promesse);
  return undefined;
}

// Décode un morceau d'adresse (%20…) ; null s'il est mal formé, au lieu de faire planter le Worker.
function decoderSegment(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

// ── Aiguillage ──
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/moi') return handleMoi(request, env);
    if (url.pathname === '/api/parent/suivi') return handleSuivi(request, env);
    if (url.pathname === '/api/parent/cours' || url.pathname.startsWith('/api/parent/cours/')) return handleParentCours(request, env, url.pathname);
    if (url.pathname === '/api/sync') return handleSync(request, env);
    if (url.pathname === '/api/claude') return handleClaudeProxy(request, env);
    if (url.pathname === '/api/defis' || url.pathname.startsWith('/api/defis/')) return handleDefis(request, env, url.pathname, ctx);
    if (url.pathname === '/api/notifications') return handleNotifications(request, env);
    return env.ASSETS.fetch(request);
  }
};
