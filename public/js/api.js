// Appels au serveur (Worker Cloudflare) : proxy vers Claude, rôle du code d'accès, suivi parent,
// et préparation des photos. Le navigateur n'a jamais la clé API : il envoie seulement le code
// d'accès (x-access-code), vérifié par worker.js qui seul connaît la vraie clé.

// ── Réglages ──
const PROXY_URL = '/api/claude';

// ── Lecture des réponses du serveur ──

// Lit la réponse JSON du serveur ; lève une erreur lisible si le statut est une erreur
// ou si le serveur a renvoyé autre chose que du JSON (page d'erreur, panne).
async function lireReponse(response) {
  let data = null;
  try {
    data = await response.json();
  } catch {
    // Corps illisible : traité ci-dessous avec le statut HTTP
  }
  if (!response.ok) {
    const err = new Error(data?.error?.message || `Erreur HTTP ${response.status}`);
    err.status = response.status; // pour reconnaître un cas précis (409 « déjà joué ») sans lire le texte
    throw err;
  }
  if (data === null) throw new Error('Réponse illisible du serveur.');
  return data;
}

// Seul point d'appel au serveur : ajoute le code d'accès, envoie le corps en JSON s'il y en a un,
// et renvoie la réponse lue (ou lève une erreur lisible).
async function appelServeur(chemin, accessCode, { methode = 'GET', corps } = {}) {
  const response = await fetch(chemin, {
    method: methode,
    headers: {
      'x-access-code': accessCode,
      ...(corps !== undefined ? { 'content-type': 'application/json' } : {})
    },
    ...(corps !== undefined ? { body: JSON.stringify(corps) } : {})
  });
  return lireReponse(response);
}

// ── Claude (via le proxy) ──

// Envoie des messages à Claude et renvoie le texte de sa réponse.
// messages : [{ role: 'user', content: '...' | [{type:'text',...}, {type:'image',...}] }]
async function callClaude(accessCode, messages, { maxTokens = 1024, system = undefined } = {}) {
  const data = await appelServeur(PROXY_URL, accessCode, {
    methode: 'POST',
    corps: { max_tokens: maxTokens, ...(system ? { system } : {}), messages }
  });
  return data.content.map(block => block.text || '').join('');
}

// Envoie un prompt qui doit renvoyer du JSON, et parse la réponse (en tolérant les ```json ... ``` autour).
async function callClaudeJSON(accessCode, content, { maxTokens = 1500, system } = {}) {
  const text = await callClaude(accessCode, [{ role: 'user', content }], { maxTokens, system });
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  return JSON.parse(cleaned);
}

// ── Notifications et défis ──

// Clé publique du serveur, nécessaire pour abonner ce téléphone aux notifications.
function demanderCleNotifications(accessCode) {
  return appelServeur('/api/notifications', accessCode);
}

// Transmet l'abonnement de ce téléphone (adresse du service de notification et clés).
function envoyerAbonnement(accessCode, abonnement) {
  return appelServeur('/api/notifications', accessCode, { methode: 'POST', corps: abonnement });
}

// Une page des cours de l'enfant (20), éventuellement d'une seule matière ; réservé aux parents.
function chargerCoursParent(accessCode, page = 0, matiere = '') {
  const filtre = matiere ? `&matiere=${encodeURIComponent(matiere)}` : '';
  return appelServeur(`/api/parent/cours?page=${page}${filtre}`, accessCode);
}

// Contenu d'un cours de l'enfant (fiche, carte, explications), chargé au clic ; réservé aux parents.
function chargerContenuCours(accessCode, id) {
  return appelServeur(`/api/parent/cours/${encodeURIComponent(id)}`, accessCode);
}

// Derniers défis de la famille, avec ce que ce joueur a le droit de voir.
function chargerDefis(accessCode) {
  return appelServeur('/api/defis', accessCode);
}

// Un défi : quiz figé et participations visibles.
function chargerDefi(accessCode, id) {
  return appelServeur(`/api/defis/${encodeURIComponent(id)}`, accessCode);
}

// Lance un défi (quiz figé de 10 questions).
function envoyerDefi(accessCode, defi) {
  return appelServeur('/api/defis', accessCode, { methode: 'POST', corps: defi });
}

// Enregistre le résultat de ce joueur à un défi.
function envoyerParticipation(accessCode, id, participation) {
  return appelServeur(`/api/defis/${encodeURIComponent(id)}/participation`, accessCode, { methode: 'POST', corps: participation });
}

// ── Profils, partage et suivi ──

// Demande au serveur le rôle lié à ce code (enfant, parent1, parent2) ; lève une erreur si le code est refusé.
async function demanderRole(accessCode) {
  return (await appelServeur('/api/moi', accessCode)).role;
}

// Envoie un lot de résultats de l'enfant (réponses, cours, profil) ; lève une erreur si le serveur refuse.
function envoyerResultats(accessCode, corps) {
  return appelServeur('/api/sync', accessCode, { methode: 'POST', corps });
}

// Récupère le suivi de l'enfant pour l'espace parent (refusé par le serveur si le code n'est pas un code parent).
function chargerSuivi(accessCode) {
  return appelServeur('/api/parent/suivi', accessCode);
}

// ── Photos ──

// Redimensionne la photo (les photos de téléphone sont souvent énormes) avant de l'envoyer à l'API.
function resizeImageToBase64(file, maxDim = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve({ base64: dataUrl.split(',')[1], mediaType: 'image/jpeg', dataUrl });
    };
    img.onerror = reject;
    img.src = url;
  });
}

// Met une photo au format attendu par l'API Claude (bloc image en base64).
function imageContentBlock(base64, mediaType) {
  return { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };
}
