const STORAGE_KEY = 'clicklearn:state';

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
  reprise: null // null = pas encore demandé, 'faite' = accord donné ou refusé (voir sync.js)
};

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

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uid() {
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}
