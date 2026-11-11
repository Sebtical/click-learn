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
  if (!response.ok) throw new Error(data?.error?.message || `Erreur HTTP ${response.status}`);
  if (data === null) throw new Error('Réponse illisible du serveur.');
  return data;
}

// ── Claude (via le proxy) ──

// Envoie des messages à Claude et renvoie le texte de sa réponse.
// messages : [{ role: 'user', content: '...' | [{type:'text',...}, {type:'image',...}] }]
async function callClaude(accessCode, messages, { maxTokens = 1024, system = undefined } = {}) {
  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-access-code': accessCode
    },
    body: JSON.stringify({
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      messages
    })
  });
  const data = await lireReponse(response);
  return data.content.map(block => block.text || '').join('');
}

// Envoie un prompt qui doit renvoyer du JSON, et parse la réponse (en tolérant les ```json ... ``` autour).
async function callClaudeJSON(accessCode, content, { maxTokens = 1500, system } = {}) {
  const text = await callClaude(accessCode, [{ role: 'user', content }], { maxTokens, system });
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  return JSON.parse(cleaned);
}

// ── Profils et suivi ──

// Demande au serveur le rôle lié à ce code (enfant, parent1, parent2) ; lève une erreur si le code est refusé.
async function demanderRole(accessCode) {
  const response = await fetch('/api/moi', { headers: { 'x-access-code': accessCode } });
  return (await lireReponse(response)).role;
}

// Récupère le suivi de l'enfant pour l'espace parent (refusé par le serveur si le code n'est pas un code parent).
async function chargerSuivi(accessCode) {
  const response = await fetch('/api/parent/suivi', { headers: { 'x-access-code': accessCode } });
  return lireReponse(response);
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
