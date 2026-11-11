// Partage des résultats de l'enfant avec la base du serveur (/api/sync).
// Seul l'appareil connecté avec le code enfant envoie quelque chose, et seulement après son accord
// pour l'historique déjà présent. Hors ligne, rien n'est perdu : l'envoi est retenté plus tard.

// ── Réglages ──
const TAILLE_LOT_SYNCHRO = 200; // doit rester ≤ TAILLE_MAX_LOT dans worker.js
let synchroEnCours = false;
let synchroARelancer = false; // une réponse est arrivée pendant un envoi : relancer à la fin

// ── Contenu des réponses ──

// Texte de la bonne réponse d'une question, quel que soit son type (null pour une question ouverte).
function texteBonneReponse(q) {
  if (!q) return null;
  if (q.type === 'qcm') return q.choix?.[q.correctIndex] ?? null;
  if (q.type === 'qcm-multi') return (q.correctIndexes || []).map(i => q.choix[i]).join(', ');
  if (q.type === 'num') return fmtNum(q.answer) + (q.unit ? ` ${q.unit}` : ''); // même texte que celui révélé à l'élève
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

// ── Information de l'enfant et choix pour l'historique ──

// Vrai si l'enfant n'a pas encore vu l'écran qui l'informe du partage avec ses parents.
function repriseADemander() {
  return state.role === 'enfant' && state.reprise === null;
}

// Écran d'information : l'enfant apprend que ses résultats sont partagés avec ses parents.
// Il ne choisit que pour l'historique déjà présent sur l'appareil (partager ou garder sur place).
function renderConfirmReprise() {
  const aUnHistorique = state.attempts.length > 0 || state.lessons.length > 0;
  app.innerHTML = `
    <div class="card">
      <h1>👪 Tes parents suivent tes progrès</h1>
      <p>À partir de maintenant, tes résultats aux quiz sont partagés avec tes parents : ils peuvent les voir depuis leur téléphone.
        Tes photos ne sont jamais envoyées.</p>
      ${aUnHistorique ? `
      <p>Il y a déjà <strong>${state.attempts.length}</strong> réponse(s) et <strong>${state.lessons.length}</strong> cours sur cet appareil. Veux-tu les partager aussi ?</p>
      <div class="actions">
        <button id="reprise-oui">Oui, partager aussi mon historique</button>
        <button id="reprise-non" class="secondary">Non, garder mon historique ici</button>
      </div>` : `
      <div class="actions"><button id="reprise-oui">J'ai compris</button></div>`}
    </div>`;

  document.getElementById('reprise-oui').addEventListener('click', () => {
    state.reprise = 'faite';
    saveState(state);
    renderHome();
    synchroniser();
  });
  if (!aUnHistorique) return;
  document.getElementById('reprise-non').addEventListener('click', () => {
    // L'historique existant reste sur cet appareil : on le marque pour qu'il ne parte jamais
    state.attempts.forEach(a => { a.synchro = 'local'; });
    state.lessons.forEach(l => { l.synchro = 'local'; });
    state.reprise = 'faite';
    saveState(state);
    renderHome();
    synchroniser(); // les éventuels résultats suivants partent, l'historique marqué 'local' reste
  });
}

// ── Envoi ──

// Envoie au serveur, par lots, tout ce qui n'a pas encore été partagé. Silencieux en cas d'échec.
// Si un envoi est déjà en cours, on le note et on relance une fois à la fin, pour ne rien laisser en attente.
async function synchroniser() {
  if (state.role !== 'enfant' || state.reprise !== 'faite') return;
  if (synchroEnCours) { synchroARelancer = true; return; }
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
          tentatives: lot.filter(el => el.genre === 'tentative').map(el => enrichirTentative(el.objet)),
          cours: lot.filter(el => el.genre === 'cours').map(el => el.objet)
        })
      });
      if (!reponse.ok) return; // nouvel essai au prochain résultat ou au prochain démarrage
      lot.forEach(el => { el.objet.synchro = true; });
      saveState(state);
    }
  } catch {
    // Hors ligne : nouvel essai plus tard
  } finally {
    synchroEnCours = false;
    if (synchroARelancer) {
      synchroARelancer = false;
      synchroniser();
    }
  }
}
