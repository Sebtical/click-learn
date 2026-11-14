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
const LIMITE_COURS_SUIVI = 10;   // derniers cours détaillés dans l'espace parent
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
      env.DB.prepare(
        'SELECT matiere, titre, resume, notions, date, type, fiche, carte, explications FROM cours WHERE joueur = ?1 ORDER BY date DESC LIMIT ?2'
      ).bind('enfant', LIMITE_COURS_SUIVI).all()
    ]);
  } catch {
    return erreur(500, 'Lecture du suivi impossible pour le moment.');
  }
  return reponseJson(200, {
    profil: profil ?? null,
    tentatives: tentatives.results,
    nbCours: cours?.nb ?? 0,
    cours: derniersCours.results.map(c => ({
      ...c, notions: lireNotions(c.notions), carte: lireJson(c.carte), explications: lireJson(c.explications) ?? []
    })),
    tronque: tentatives.results.length === LIMITE_SUIVI // l'écran parent le signale : chiffres sur les dernières réponses
  });
}

// ── Défis en famille ──
// Un joueur lance un quiz figé ; chacun le joue quand il veut ; les réponses des autres ne sont
// visibles qu'après avoir joué soi-même. Le joueur est toujours déduit du code d'accès.

const ROLES = ['enfant', 'parent1', 'parent2'];
const TYPES_QUESTION_DEFI = ['qcm', 'qcm-multi', 'num', 'court'];

// Questions d'un défi reçues : 1 à 15, types connus, sans figure (seul HTML affiché tel quel),
// taille totale bornée ; null si inutilisables.
function questionsDefiValides(liste) {
  if (!Array.isArray(liste) || liste.length === 0 || liste.length > MAX_QUESTIONS_DEFI) return null;
  const propres = [];
  for (const q of liste) {
    if (!q || typeof q !== 'object' || !TYPES_QUESTION_DEFI.includes(q.type) || typeof q.enonce !== 'string') return null;
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

// Enregistre le surnom du joueur (« Papa »), affiché aux autres dans les défis.
function ecritureSurnom(env, role, surnom) {
  return env.DB.prepare(
    `INSERT INTO profils (role, prenom, maj) VALUES (?1, ?2, ?3)
     ON CONFLICT (role) DO UPDATE SET prenom = excluded.prenom, maj = excluded.maj`
  ).bind(role, surnom, new Date().toISOString());
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
async function creerDefi(request, env, role) {
  const envoi = lireObjetJson(await request.text());
  if (envoi === null || typeof envoi.id !== 'string' || !envoi.id || envoi.id.length > 100) return erreur(400, 'Défi invalide.');
  const questions = questionsDefiValides(envoi.questions);
  if (questions === null) return erreur(400, 'Questions du défi invalides.');
  const ecritures = [env.DB.prepare(
    `INSERT OR IGNORE INTO defis (id, lance_par, matiere, titre, questions, cree_le) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
  ).bind(envoi.id, role, texteBorne(envoi.matiere, 100), texteBorne(envoi.titre, 200), questions, new Date().toISOString())];
  const surnom = texteBorne(envoi.surnom, 40);
  if (surnom) ecritures.push(ecritureSurnom(env, role, surnom));
  try {
    await env.DB.batch(ecritures);
  } catch {
    return erreur(500, 'Enregistrement impossible pour le moment.');
  }
  return reponseJson(200, { id: envoi.id });
}

// GET /api/defis : les derniers défis, avec qui a terminé et ce que ce joueur a le droit de voir.
async function listerDefis(env, role) {
  let defis, participations, noms;
  try {
    [defis, participations, noms] = await Promise.all([
      env.DB.prepare('SELECT id, lance_par, matiere, titre, cree_le, questions FROM defis ORDER BY cree_le DESC LIMIT ?1').bind(LIMITE_DEFIS).all(),
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
      nb_questions: (lireJson(d.questions) ?? []).length,
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
async function participerDefi(request, env, role, id) {
  const envoi = lireObjetJson(await request.text());
  if (envoi === null) return erreur(400, 'Participation invalide.');
  let defi;
  try {
    defi = await env.DB.prepare('SELECT questions FROM defis WHERE id = ?1').bind(id).first();
  } catch {
    return erreur(500, 'Enregistrement impossible pour le moment.');
  }
  if (!defi) return erreur(404, 'Défi introuvable.');
  const total = (lireJson(defi.questions) ?? []).length;
  const score = Number.isInteger(envoi.score) ? Math.min(Math.max(envoi.score, 0), total) : null;
  if (score === null) return erreur(400, 'Score invalide.');
  const ecritures = [env.DB.prepare(
    `INSERT OR IGNORE INTO participations (defi_id, joueur, score, total, reponses, termine_le) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
  ).bind(id, role, score, total, reponsesValides(envoi.reponses, total), new Date().toISOString())];
  const surnom = texteBorne(envoi.surnom, 40);
  if (surnom) ecritures.push(ecritureSurnom(env, role, surnom));
  let resultats;
  try {
    resultats = await env.DB.batch(ecritures);
  } catch {
    return erreur(500, 'Enregistrement impossible pour le moment.');
  }
  // INSERT OR IGNORE : aucune ligne écrite = ce joueur avait déjà joué (son premier résultat compte)
  if (resultats[0]?.meta?.changes === 0) return erreur(409, 'Tu as déjà joué ce défi.');
  return reponseJson(200, { enregistre: true });
}

// Aiguillage des routes /api/defis… (tous les joueurs y ont accès).
async function handleDefis(request, env, chemin) {
  const morceaux = chemin.split('/').filter(Boolean); // ['api', 'defis', id?, 'participation'?]
  const id = morceaux[2] ? decodeURIComponent(morceaux[2]) : null;
  const methode = morceaux.length === 2 && request.method === 'POST' ? 'POST'
    : morceaux.length === 4 && morceaux[3] === 'participation' ? 'POST' : 'GET';
  if (morceaux.length > 4 || (morceaux.length === 4 && morceaux[3] !== 'participation')) return erreur(404, 'Route inconnue.');
  const { role, refus } = await controlerAcces(request, env, methode);
  if (refus) return refus;
  if (!id) return methode === 'POST' ? creerDefi(request, env, role) : listerDefis(env, role);
  if (id.length > 100) return erreur(400, 'Défi invalide.');
  return morceaux.length === 4 ? participerDefi(request, env, role, id) : lireDefi(env, role, id);
}

// ── Aiguillage ──
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/moi') return handleMoi(request, env);
    if (url.pathname === '/api/parent/suivi') return handleSuivi(request, env);
    if (url.pathname === '/api/sync') return handleSync(request, env);
    if (url.pathname === '/api/claude') return handleClaudeProxy(request, env);
    if (url.pathname === '/api/defis' || url.pathname.startsWith('/api/defis/')) return handleDefis(request, env, url.pathname);
    return env.ASSETS.fetch(request);
  }
};
