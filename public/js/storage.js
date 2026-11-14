// État de l'appli, sauvegardé dans le navigateur (localStorage), et petits outils communs.

// ── État ──
const STORAGE_KEY = 'clicklearn:state';
// Avatar personnel : clé à part, pour ne pas le réécrire à chaque réponse ni le mêler aux données synchronisées.
const CLE_AVATAR = 'clicklearn:avatar';

// Forme de l'état. Ajouter un champ ici suffit à mettre à jour les appareils existants (voir loadState).
// Chaque réponse (attempts) et chaque cours (lessons) peut porter un champ synchro (voir sync.js) :
// absent = pas encore partagé, true = partagé avec le serveur, 'local' = à garder sur l'appareil.
const DEFAULT_STATE = {
  profile: { prenom: '', niveau: '5ème' },
  accessCode: '',
  subjects: ['Maths', 'Français', 'Histoire-Géographie', 'SVT', 'Anglais', 'Physique-Chimie', 'Technologie'],
  lessons: [],
  quizzes: [],
  attempts: [],
  progress: {},
  curriculum: {},
  role: null,
  infoContenuVue: false, // message « tes fiches et cartes sont visibles par tes parents » déjà vu
  reprise: null // null = l'enfant n'a pas encore vu l'écran de partage, 'faite' = vu (voir sync.js)
};

// Charge l'état sauvegardé en le complétant avec les valeurs par défaut des champs récents.
function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return structuredClone(DEFAULT_STATE);
  try {
    const merged = { ...structuredClone(DEFAULT_STATE), ...JSON.parse(raw) };
    delete merged.apiKey; // ancien champ (avant le passage au proxy) : jamais reconduit, même s'il traîne dans un state sauvegardé.
    delete merged.parentAuth; // ancien PIN parent : remplacé par le rôle vérifié côté serveur.
    return merged;
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

// Sauvegarde l'état complet dans le navigateur.
function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// Lit l'avatar gardé sur cet appareil (ou null si absent ou stockage indisponible).
function lireAvatar() {
  try { return localStorage.getItem(CLE_AVATAR); } catch { return null; }
}

// Enregistre l'avatar sur cet appareil, ou l'efface si valeur vaut null. Lève une erreur si le stockage est plein.
function ecrireAvatar(valeur) {
  if (valeur === null) localStorage.removeItem(CLE_AVATAR);
  else localStorage.setItem(CLE_AVATAR, valeur);
}

// ── Outils ──

// Neutralise les caractères spéciaux HTML : à utiliser pour tout texte venant de la base ou de l'IA
// avant de l'insérer dans la page, sinon un texte piégé pourrait exécuter du code sur un autre appareil.
function echapperHtml(valeur) {
  const remplacements = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(valeur ?? '').replace(/[&<>"']/g, c => remplacements[c]);
}

// Fabrique un identifiant unique (date + hasard), utilisé pour les quiz, questions et réponses.
function uid() {
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}
