// Partage des résultats de l'enfant avec la base du serveur (/api/sync).
// Seul l'appareil connecté avec le code enfant envoie quelque chose, et seulement après son accord
// pour l'historique déjà présent. Hors ligne, rien n'est perdu : l'envoi est retenté plus tard.

// ── Réglages ──
const TAILLE_LOT_SYNCHRO = 200; // doit rester ≤ TAILLE_MAX_LOT dans worker.js
let synchroEnCours = false;

// ── Contenu des réponses ──

// Texte de la bonne réponse d'une question, quel que soit son type (null pour une question ouverte).
function texteBonneReponse(q) {
  if (!q) return null;
  if (q.type === 'qcm') return q.choix?.[q.correctIndex] ?? null;
  if (q.type === 'qcm-multi') return (q.correctIndexes || []).map(i => q.choix[i]).join(', ');
  if (q.type === 'num') return `${q.answer}${q.unit ? ' ' + q.unit : ''}`;
  if (q.type === 'court') return q.reponses?.[q.reponses.length - 1] ?? null;
  return null;
}

// Complète une ancienne réponse (sans énoncé) en retrouvant sa question dans les quiz sauvegardés.
function enrichirTentative(a) {
  if (a.enonce || !a.questionId) return a;
  const quiz = state.quizzes.find(qz => qz.id === a.quizId);
  const q = quiz?.questions.find(qq => qq.id === a.questionId);
  return q ? { ...a, enonce: q.enonce, bonneReponse: texteBonneReponse(q) } : a;
}

// ── Accord pour l'historique ──

// Vrai si l'enfant doit d'abord dire s'il partage l'historique déjà présent sur cet appareil.
function repriseADemander() {
  if (state.role !== 'enfant' || state.reprise !== null) return false;
  if (state.attempts.length || state.lessons.length) return true;
  state.reprise = 'faite'; // rien d'ancien : on partage directement les prochains résultats
  saveState(state);
  return false;
}

// Écran d'accord : l'enfant voit ce qui sera partagé avec ses parents et peut refuser.
function renderConfirmReprise() {
  app.innerHTML = `
    <div class="card">
      <h1>👪 Partager tes résultats ?</h1>
      <p>Tes parents vont pouvoir suivre tes progrès depuis leur téléphone.</p>
      <p>Il y a déjà <strong>${state.attempts.length}</strong> réponse(s) et <strong>${state.lessons.length}</strong> cours sur cet appareil.
        Tes photos ne sont jamais envoyées.</p>
      <div class="actions">
        <button id="reprise-oui">Oui, partager mon historique</button>
        <button id="reprise-non" class="secondary">Non, seulement à partir de maintenant</button>
      </div>
    </div>`;

  document.getElementById('reprise-oui').addEventListener('click', () => {
    state.reprise = 'faite';
    saveState(state);
    renderHome();
    synchroniser();
  });
  document.getElementById('reprise-non').addEventListener('click', () => {
    // L'historique existant reste sur cet appareil : on le marque pour qu'il ne parte jamais
    state.attempts.forEach(a => { a.synchro = 'local'; });
    state.lessons.forEach(l => { l.synchro = 'local'; });
    state.reprise = 'faite';
    saveState(state);
    renderHome();
  });
}

// ── Envoi ──

// Envoie au serveur, par lots, tout ce qui n'a pas encore été partagé. Silencieux en cas d'échec.
async function synchroniser() {
  if (state.role !== 'enfant' || state.reprise !== 'faite' || synchroEnCours) return;
  synchroEnCours = true;
  try {
    // Rassemble ce qui reste à envoyer
    const elements = [
      ...state.attempts.filter(a => !a.synchro).map(a => ({ genre: 'tentative', objet: a })),
      ...state.lessons.filter(l => !l.synchro).map(l => ({ genre: 'cours', objet: l }))
    ];

    // Envoie lot par lot ; chaque lot accepté est marqué comme partagé
    for (let i = 0; i < elements.length; i += TAILLE_LOT_SYNCHRO) {
      const lot = elements.slice(i, i + TAILLE_LOT_SYNCHRO);
      const reponse = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-access-code': state.accessCode },
        body: JSON.stringify({
          profil: { prenom: state.profile.prenom, niveau: state.profile.niveau },
          tentatives: lot.filter(e => e.genre === 'tentative').map(e => enrichirTentative(e.objet)),
          cours: lot.filter(e => e.genre === 'cours').map(e => e.objet)
        })
      });
      if (!reponse.ok) return; // nouvel essai au prochain résultat ou au prochain démarrage
      lot.forEach(e => { e.objet.synchro = true; });
      saveState(state);
    }
  } catch {
    // Hors ligne : nouvel essai plus tard
  } finally {
    synchroEnCours = false;
  }
}
