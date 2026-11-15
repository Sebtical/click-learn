// Défis en famille : lancer un quiz figé de 10 questions, le jouer, comparer les scores et les corrections.
// Le serveur fixe le joueur à partir du code et cache les réponses des autres tant qu'on n'a pas joué.
// Règle dure : tout texte venant du serveur passe par echapperHtml.

// ── Réglages ──
const NB_QUESTIONS_DEFI = 10;
const TYPES_QUESTION_DEFI = ['qcm', 'qcm-multi', 'num', 'court'];

// ── Outils (fonctions pures, testées) ──

// Nom affiché d'un joueur : son surnom (prénom de sa configuration), sinon un libellé par défaut.
function nomJoueurAffiche(role, surnoms, moi) {
  if (role === moi) return 'Toi';
  return (surnoms && surnoms[role]) || { enfant: 'Ton enfant', parent1: 'Parent 1', parent2: 'Parent 2' }[role] || role;
}

// Garde les questions jouables en défi : types connus, sans figure (retirée par le serveur), 10 au plus.
function questionsPourDefi(questions) {
  return (questions || []).filter(q => q && TYPES_QUESTION_DEFI.includes(q.type) && !q.fig).slice(0, NB_QUESTIONS_DEFI)
    .map(({ id, ...q }) => q);
}

// Défis que ce joueur n'a pas encore joués (bandeau et pastille).
function defisEnAttente(defis) {
  return (defis || []).filter(d => !d.a_joue);
}

// Bandeau d'accueil : le défi en attente le plus récent, et combien d'autres.
function bandeauDefisHtml(donnees) {
  const attente = defisEnAttente(donnees?.defis);
  if (!attente.length) return '';
  const d = attente[0];
  const lanceur = nomJoueurAffiche(d.lance_par, donnees.surnoms, donnees.moi);
  const qui = lanceur === 'Toi' ? 'Tu as lancé un défi' : `${echapperHtml(lanceur)} t'a lancé un défi`;
  const autres = attente.length > 1 ? ` <small>(+${attente.length - 1} autre${attente.length > 2 ? 's' : ''})</small>` : '';
  return `<button class="card bandeau-defi" data-defi="${echapperHtml(d.id)}">
        <span class="bandeau-emoji">🏆</span>
        <span><strong>${qui} : ${echapperHtml(d.titre || 'un quiz')}</strong>${autres}<small>Touche pour jouer</small></span>
      </button>`;
}

// Liste des défis : en attente d'abord, puis terminés avec les scores visibles.
function listeDefisHtml(donnees) {
  const ligne = d => {
    const lanceur = nomJoueurAffiche(d.lance_par, donnees.surnoms, donnees.moi);
    const scores = d.participations.map(p => `${echapperHtml(nomJoueurAffiche(p.joueur, donnees.surnoms, donnees.moi))}${Number.isInteger(p.score) ? ` ${p.score}/${p.total}` : ' ✓'}`).join(' · ');
    return `<li><button class="defi-ligne" data-defi="${echapperHtml(d.id)}">
          <span><strong>${echapperHtml(d.titre || 'Quiz')}</strong><small>${echapperHtml(d.matiere || '')} · lancé par ${echapperHtml(lanceur)}</small>
          ${scores ? `<small>${scores}</small>` : ''}</span>
          <span class="tag">${d.a_joue ? 'Résultats' : 'À jouer'}</span>
        </button></li>`;
  };
  const attente = (donnees.defis || []).filter(d => !d.a_joue), joues = (donnees.defis || []).filter(d => d.a_joue);
  return `${attente.length ? `<h2>À jouer</h2><ul class="defi-liste">${attente.map(ligne).join('')}</ul>` : ''}
      ${joues.length ? `<h2>Terminés</h2><ul class="defi-liste">${joues.map(ligne).join('')}</ul>` : ''}
      ${!attente.length && !joues.length ? '<p class="subtitle">Aucun défi pour l\'instant. Lance le premier !</p>' : ''}`;
}

// Résultats d'un défi : scores, puis chaque question avec la bonne réponse et la réponse de chacun.
function resultatsDefiHtml(donnees) {
  const { defi, participations, surnoms, moi } = donnees;
  const nom = role => echapperHtml(nomJoueurAffiche(role, surnoms, moi));
  const classement = participations.filter(p => Number.isInteger(p.score)).sort((a, b) => b.score - a.score);
  const meilleur = classement[0]?.score;
  const scores = classement.map(p => `<li><span>${p.score === meilleur ? '🏆 ' : ''}${nom(p.joueur)}</span><span>${p.score}/${p.total}</span></li>`).join('');
  const enAttente = ['enfant', 'parent1', 'parent2'].filter(r => !participations.some(p => p.joueur === r))
    .map(r => `<li><span>${nom(r)}</span><span class="subtitle">pas encore joué</span></li>`).join('');
  const questions = defi.questions.map((q, i) => {
    const reponses = classement.map(p => {
      const r = p.reponses?.[i];
      return r ? `<li>${r.correct ? '✅' : '❌'} ${nom(p.joueur)} : ${echapperHtml(r.reponse || '—')}</li>` : '';
    }).join('');
    return `<li class="exercise-item">
          <p class="ex-statement">${i + 1}. ${echapperHtml(q.enonce)}</p>
          <p class="hint">Bonne réponse : <strong>${echapperHtml(texteBonneReponse(q) ?? '—')}</strong></p>
          <ul class="defi-reponses">${reponses}</ul>
        </li>`;
  }).join('');
  return `<div class="card card-wide">
      ${enTete(`🏆 ${echapperHtml(defi.titre || 'Défi')}`, `<span class="tag">${echapperHtml(defi.matiere || '')}</span>`, defi.matiere)}
      <h2>Scores</h2>
      <ul class="notion-list">${scores}${enAttente}</ul>
      <h2>Corrections</h2>
      <ul class="exercise-list">${questions}</ul>
      <div class="actions"><button id="defis-retour">Tous les défis</button><button id="defis-accueil" class="secondary">Accueil</button></div>
    </div>`;
}

// ── Écrans ──

// Liste des défis de la famille, avec le bouton pour en lancer un.
async function renderDefis() {
  app.innerHTML = `<div class="card card-wide"><h1>🏆 Défis</h1><div class="busy"><p>Chargement des défis...</p></div></div>`;
  let donnees;
  try {
    donnees = await chargerDefis(state.accessCode);
  } catch (err) {
    app.innerHTML = `<div class="card card-wide"><h1>🏆 Défis</h1><p class="error">Impossible de charger les défis : ${echapperHtml(err.message)}</p>
      <button id="defis-accueil" class="secondary">Accueil</button></div>`;
    document.getElementById('defis-accueil').addEventListener('click', renderHome);
    return;
  }
  mettreAJourPastille(defisEnAttente(donnees.defis).length);
  app.innerHTML = `<div class="card card-wide">
      <h1>🏆 Défis</h1>
      <p class="subtitle">Un même quiz pour toute la famille : chacun joue quand il veut, puis on compare.</p>
      <button id="defi-nouveau">➕ Lancer un défi</button>
      ${listeDefisHtml(donnees)}
      <button id="defis-accueil" class="secondary">Accueil</button>
    </div>`;
  document.getElementById('defi-nouveau').addEventListener('click', renderNouveauDefi);
  document.getElementById('defis-accueil').addEventListener('click', renderHome);
  document.querySelectorAll('[data-defi]').forEach(b => b.addEventListener('click', () => ouvrirDefi(b.dataset.defi)));
}

// Choix de la source d'un nouveau défi : un chapitre de Maths/Français ou un cours de l'enfant.
async function renderNouveauDefi() {
  app.innerHTML = `<div class="card card-wide"><h1>➕ Nouveau défi</h1><div class="busy"><p>Chargement...</p></div></div>`;
  // Cours de l'enfant : sur son téléphone pour l'enfant, depuis le serveur pour un parent
  let cours = state.role === 'enfant' ? state.lessons : [];
  if (estParent()) {
    try {
      cours = (await chargerSuivi(state.accessCode)).cours || [];
    } catch {
      cours = [];
    }
  }
  const chapitres = chapitresPourDefi();
  app.innerHTML = `<div class="card card-wide">
      <h1>➕ Nouveau défi</h1>
      <p class="subtitle">10 questions, les mêmes pour tous.</p>
      <h2>Un chapitre</h2>
      <ul class="chapter-list">${chapitres.map((c, i) => `<li><button class="defi-source" data-chapitre="${i}">
        <span class="chap-text"><strong>${echapperHtml(c.theme.titre)}</strong><small>${c.matiere}</small></span></button></li>`).join('')}</ul>
      ${cours.length ? `<h2>Un de ses cours</h2><ul class="chapter-list">${cours.map((c, i) => `<li><button class="defi-source" data-cours="${i}">
        <span class="chap-text"><strong>${echapperHtml(c.titre || 'Cours')}</strong><small>${echapperHtml(c.matiere || '')} · quiz préparé par l'IA</small></span></button></li>`).join('')}</ul>` : ''}
      <p id="defi-erreur" class="error"></p>
      <button id="defis-retour" class="secondary">Retour</button>
    </div>`;
  document.getElementById('defis-retour').addEventListener('click', renderDefis);
  document.querySelectorAll('[data-chapitre]').forEach(b => b.addEventListener('click', () => {
    const c = chapitres[Number(b.dataset.chapitre)];
    lancerDefi({ matiere: c.matiere, titre: c.theme.titre }, () => questionsChapitre(c.matiere, c.theme.id), b);
  }));
  document.querySelectorAll('[data-cours]').forEach(b => b.addEventListener('click', () => {
    const c = cours[Number(b.dataset.cours)];
    lancerDefi({ matiere: c.matiere, titre: c.titre }, () => questionsCours(c), b);
  }));
}

// Chapitres de Maths et de Français jouables en défi : ceux qui fournissent assez de questions sans figure
// (les chapitres de géométrie qui ne posent que des questions dessinées sont écartés).
function chapitresPourDefi() {
  return ['Maths', 'Français'].flatMap(m => localThemes(m).map(t => ({ matiere: m, theme: t })))
    .filter(c => questionsChapitre(c.matiere, c.theme.id).length >= 5);
}

// 10 questions d'un chapitre, sans figure (tirées en plusieurs fois si besoin).
function questionsChapitre(matiere, themeId) {
  let questions = [];
  for (let essai = 0; essai < 5 && questions.length < NB_QUESTIONS_DEFI; essai++) {
    questions = questions.concat(questionsPourDefi(generateLocalQuiz(matiere, themeId, 'entrainement', NB_QUESTIONS_DEFI)));
  }
  return questions.slice(0, NB_QUESTIONS_DEFI);
}

// 10 questions préparées par l'IA à partir d'un cours de l'enfant (résumé et notions).
async function questionsCours(cours) {
  const reponse = await callClaudeJSON(state.accessCode,
    quizGenerationPrompt(state.profile.niveau, cours.matiere, 'entrainement', cours),
    { system: SYSTEME_JSON, maxTokens: 5000 });
  return questionsPourDefi(questionsDepuisIA(reponse?.questions));
}

// Fabrique les questions, envoie le défi au serveur (les autres sont notifiés), puis propose de jouer.
async function lancerDefi({ matiere, titre }, fabriquerQuestions, bouton) {
  const erreurEl = document.getElementById('defi-erreur');
  document.querySelectorAll('.defi-source').forEach(b => { b.disabled = true; });
  bouton.querySelector('small').textContent = 'Préparation du défi...';
  try {
    const questions = await fabriquerQuestions();
    if (questions.length < 3) throw new Error('pas assez de questions, essaie une autre source');
    const id = uid();
    await envoyerDefi(state.accessCode, { id, matiere, titre, questions, surnom: state.profile.prenom });
    await ouvrirDefi(id);
  } catch (err) {
    erreurEl.textContent = `Impossible de lancer le défi : ${err.message}`;
    document.querySelectorAll('.defi-source').forEach(b => { b.disabled = false; });
  }
}

// Ouvre un défi : le quiz si ce joueur n'a pas encore joué, sinon les résultats.
async function ouvrirDefi(id) {
  app.innerHTML = `<div class="card card-wide"><h1>🏆 Défi</h1><div class="busy"><p>Chargement du défi...</p></div></div>`;
  let donnees;
  try {
    donnees = await chargerDefi(state.accessCode, id);
  } catch (err) {
    app.innerHTML = `<div class="card card-wide"><p class="error">Impossible d'ouvrir le défi : ${echapperHtml(err.message)}</p><button id="defis-retour">Tous les défis</button></div>`;
    document.getElementById('defis-retour').addEventListener('click', renderDefis);
    return;
  }
  if (donnees.participations.some(p => p.joueur === donnees.moi)) return afficherResultatsDefi(donnees);
  const { defi } = donnees;
  startQuiz({
    id: uid(), defiId: defi.id, lessonId: null, subject: defi.matiere, difficulty: 'defi-famille',
    theme: defi.questions[0]?.theme || null, createdAt: new Date().toISOString(),
    questions: defi.questions.map(q => ({ ...q, id: uid() }))
  });
}

// Fin d'un quiz de défi : envoie le score (premiers essais) et les réponses, puis montre les résultats.
async function terminerDefi(quiz, resultats) {
  app.innerHTML = `<div class="card card-wide"><h1>🏆 Défi terminé !</h1><div class="busy"><p>Envoi de ton score...</p></div></div>`;
  const participation = {
    score: resultats.filter(r => r.correct).length,
    reponses: resultats.map(r => ({ reponse: r.reponseDonnee ?? '', correct: r.correct })),
    surnom: state.profile.prenom
  };
  try {
    await envoyerParticipation(state.accessCode, quiz.defiId, participation);
  } catch (err) {
    if (!/déjà joué/.test(err.message)) {
      app.innerHTML = `<div class="card card-wide"><p class="error">Score non envoyé : ${echapperHtml(err.message)}</p>
        <button id="defi-renvoyer">Réessayer</button></div>`;
      document.getElementById('defi-renvoyer').addEventListener('click', () => terminerDefi(quiz, resultats));
      return;
    }
  }
  fireConfetti();
  await ouvrirDefi(quiz.defiId);
}

// Affiche les résultats d'un défi déjà joué.
function afficherResultatsDefi(donnees) {
  app.innerHTML = resultatsDefiHtml(donnees);
  document.getElementById('defis-retour').addEventListener('click', renderDefis);
  document.getElementById('defis-accueil').addEventListener('click', renderHome);
}

// Accueil : remplit le bandeau des défis en attente et met à jour la pastille (sans bloquer l'affichage).
async function actualiserBandeauDefis() {
  try {
    const donnees = await chargerDefis(state.accessCode);
    mettreAJourPastille(defisEnAttente(donnees.defis).length);
    const zone = document.getElementById('bandeau-defis');
    if (!zone) return; // l'enfant a quitté l'accueil entre-temps
    zone.innerHTML = bandeauDefisHtml(donnees);
    zone.querySelector('[data-defi]')?.addEventListener('click', e => ouvrirDefi(e.currentTarget.dataset.defi));
  } catch {
    // Hors ligne : pas de bandeau, rien de grave
  }
}
