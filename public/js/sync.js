// Partage des résultats de l'enfant avec la base du serveur (/api/sync).
// Seul l'appareil connecté avec le code enfant envoie quelque chose, et seulement après son accord
// pour l'historique déjà présent. Hors ligne, rien n'est perdu : l'envoi est retenté plus tard.

// ── Réglages ──
const TAILLE_LOT_SYNCHRO = 200; // ≤ TAILLE_MAX_LOT dans worker.js (vérifié par tests/client.test.mjs)
const TAILLE_LOT_COURS = 20; // un cours peut porter une fiche de plusieurs pages : lots plus petits
let synchroEnCours = false;
let synchroARelancer = false; // une réponse est arrivée pendant un envoi : relancer à la fin

// ── Contenu des réponses ──

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

// Sauvegarde l'état puis partage ce qui est nouveau : à appeler après tout ajout de réponse ou de cours.
function enregistrerEtPartager() {
  saveState(state);
  synchroniser();
}

// Champs d'un cours partagés avec l'espace parent : texte, fiche détaillée, carte mentale, explications
// d'un cours sur mesure. Jamais les photos, ni les questions du mini-quiz.
function coursPourPartage(cours) {
  const { id, matiere, titre, resume, notions, date, type, fiche, explications } = cours;
  const carte = cours.carte ? { centre: cours.carte.centre, branches: cours.carte.branches } : undefined;
  return { id, matiere, titre, resume, notions, date, type, fiche, carte, explications };
}

// Marque un cours à renvoyer (fiche ou carte ajoutée après coup), sauf si l'enfant a refusé de le partager.
function aRepartager(cours) {
  if (cours.synchro !== 'local') cours.synchro = false;
}

// Une seule fois : renvoie les cours déjà partagés qui ont une fiche, une carte ou des explications
// créées avant que ce contenu soit partagé (2026-11).
function repartagerContenuExistant() {
  if (state.contenuPartage) return;
  state.lessons.filter(l => l.fiche || l.carte || l.explications).forEach(aRepartager);
  state.contenuPartage = true;
}

// Envoie une liste (réponses ou cours) par lots ; chaque lot accepté est marqué comme partagé.
// Lève une erreur au premier lot refusé : le reste attendra le prochain envoi.
async function envoyerParLots(liste, champ, taille = TAILLE_LOT_SYNCHRO) {
  for (let i = 0; i < liste.length; i += taille) {
    const lot = liste.slice(i, i + taille);
    await envoyerResultats(state.accessCode, {
      profil: { prenom: state.profile.prenom, niveau: state.profile.niveau },
      [champ]: champ === 'tentatives' ? lot.map(enrichirTentative) : lot.map(coursPourPartage)
    });
    lot.forEach(objet => { objet.synchro = true; });
    saveState(state);
  }
}

// Envoie au serveur, par lots, tout ce qui n'a pas encore été partagé. Silencieux en cas d'échec.
// Si un envoi est déjà en cours, on le note et on relance une fois à la fin, pour ne rien laisser en attente.
async function synchroniser() {
  if (state.role !== 'enfant' || state.reprise !== 'faite') return;
  if (synchroEnCours) { synchroARelancer = true; return; }
  synchroEnCours = true;
  try {
    await envoyerParLots(state.attempts.filter(a => !a.synchro), 'tentatives');
    repartagerContenuExistant();
    await envoyerParLots(state.lessons.filter(l => !l.synchro), 'cours', TAILLE_LOT_COURS);
  } catch {
    // Hors ligne ou refus du serveur : nouvel essai au prochain résultat ou au prochain démarrage
  } finally {
    synchroEnCours = false;
    if (synchroARelancer) {
      synchroARelancer = false;
      synchroniser();
    }
  }
}
