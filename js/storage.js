const STORAGE_KEY = 'clicklearn:state';

const DEFAULT_STATE = {
  profile: { prenom: '', niveau: '5ème' },
  apiKey: '',
  subjects: ['Maths', 'Français', 'Histoire-Géographie', 'SVT', 'Anglais', 'Physique-Chimie', 'Technologie'],
  lessons: [],
  quizzes: [],
  attempts: [],
  progress: {},
  curriculum: {},
  parentAuth: { code: null }
};

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return structuredClone(DEFAULT_STATE);
  try {
    return { ...structuredClone(DEFAULT_STATE), ...JSON.parse(raw) };
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
