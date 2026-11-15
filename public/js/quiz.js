let currentQuiz = null;
let currentQuestionIndex = 0;
let sessionResults = [];
let questionRecorded = false;
let attemptCount = 0;
const MAX_ATTEMPTS = 2;

// Démarre un quiz : remet les compteurs à zéro et affiche la première question.
function startQuiz(quiz) {
  currentQuiz = quiz;
  currentQuestionIndex = 0;
  sessionResults = [];
  renderQuizQuestion();
}

// ── Fabrication du HTML (fonctions pures, testées) ──
// Règle dure : tout texte d'une question (écrit par l'IA ou un générateur) est échappé.
// Seule exception : la figure SVG (q.fig), produite uniquement par figures-maths.js, jamais par l'IA.

// Zone de réponse propre à chaque type de question.
function zoneReponseHtml(q) {
  if (q.type === 'qcm') {
    return `<div id="choices" class="choices">
          ${q.choix.map((c, i) => `<button class="choice-btn" data-i="${i}">${echapperHtml(c)}</button>`).join('')}
        </div>`;
  }
  if (q.type === 'qcm-multi') {
    return `<div id="choices" class="choices">
          ${q.choix.map((c, i) => `
            <label class="choice-check">
              <input type="checkbox" value="${i}">
              <span>${echapperHtml(c)}</span>
            </label>`).join('')}
        </div>
        <button id="submit-multi">Valider</button>`;
  }
  if (q.type === 'num') {
    return `<div class="num-answer">
          <button type="button" id="toggle-signe" class="secondary signe-btn" aria-label="Changer le signe">±</button>
          <input type="text" inputmode="decimal" id="num-answer" placeholder="Ta réponse">
          ${q.unit ? `<span class="unit">${echapperHtml(q.unit)}</span>` : ''}
        </div>
        <button id="submit-num">Valider</button>`;
  }
  if (q.type === 'court') {
    return `<input type="text" id="court-answer" placeholder="Ta réponse">
        <button id="submit-court">Valider</button>`;
  }
  return `<textarea id="open-answer" rows="4" placeholder="Ta réponse..."></textarea>
        <button id="submit-open">Valider</button>`;
}

// Écran complet d'une question : barre du haut, énoncé, figure éventuelle, zone de réponse.
function questionHtml(q, progress) {
  return `
      <div class="card card-wide">
        <div class="quiz-topbar">
          <p class="progress">${progress} — ${echapperHtml(q.notion)}</p>
          <button id="quit-quiz" class="link">✕ Quitter</button>
        </div>
        <h2>${echapperHtml(q.enonce)}</h2>
        ${q.fig ? `<div class="fig">${q.fig}</div>` : ''}
        ${zoneReponseHtml(q)}
        <div id="feedback"></div>
      </div>`;
}

// Message après une mauvaise réponse, avec la bonne réponse si les essais sont épuisés.
function indiceHtml(pisteReflexion, bonneReponse = null) {
  const piste = `<p class="hint">Pas tout à fait... 🤔<br>${echapperHtml(pisteReflexion)}</p>`;
  return bonneReponse === null
    ? `${piste}<p class="subtitle">Réessaie !</p>`
    : `${piste}<p class="hint">La bonne réponse était : <strong>${echapperHtml(bonneReponse)}</strong></p><button id="next-q">Suivant</button>`;
}

// ── Affichage d'une question et branchement de ses boutons ──
function renderQuizQuestion() {
  questionRecorded = false;
  attemptCount = 0;
  const q = currentQuiz.questions[currentQuestionIndex];
  const progress = `Question ${currentQuestionIndex + 1}/${currentQuiz.questions.length}`;
  app.innerHTML = questionHtml(q, progress);

  if (q.type === 'qcm') {
    document.querySelectorAll('.choice-btn').forEach(btn => btn.addEventListener('click', onQcmAnswer));
  } else if (q.type === 'qcm-multi') {
    document.getElementById('submit-multi').addEventListener('click', onMultiAnswer);
  } else if (q.type === 'num') {
    document.getElementById('submit-num').addEventListener('click', onNumAnswer);
    // Bouton ± affiché à toutes les questions numériques, pour ne pas trahir le signe de la réponse
    document.getElementById('toggle-signe').addEventListener('click', () => {
      const champ = document.getElementById('num-answer');
      champ.value = basculerSigne(champ.value);
      champ.focus();
    });
  } else if (q.type === 'court') {
    document.getElementById('submit-court').addEventListener('click', onCourtAnswer);
  } else {
    document.getElementById('submit-open').addEventListener('click', onOpenAnswer);
  }

  document.getElementById('quit-quiz').addEventListener('click', renderHome);
}

// Enregistre seulement le premier essai d'une question, avec la réponse donnée à ce moment-là.
function recordOnce(question, correct, reponseDonnee) {
  if (questionRecorded) return;
  questionRecorded = true;
  recordAttempt(question, correct, reponseDonnee);
}

// Indice après un premier essai raté : l'élève peut réessayer.
function showRetryHint(pisteReflexion) {
  document.getElementById('feedback').innerHTML = indiceHtml(pisteReflexion);
}

// Essais épuisés : indice, bonne réponse, puis bouton « Suivant ».
function showAnswerReveal(correctText, pisteReflexion) {
  document.getElementById('feedback').innerHTML = indiceHtml(pisteReflexion, correctText ?? '');
  document.getElementById('next-q').addEventListener('click', nextQuestion);
}

// Félicite, avec un conseil facultatif (ex. « Pense à simplifier »), puis propose la question suivante.
function showSuccessAndNext(conseil = '') {
  const feedback = document.getElementById('feedback');
  feedback.innerHTML = `<p class="ok">Bravo, bonne réponse ! 🎉${conseil ? `<br>${echapperHtml(conseil)}` : ''}</p><button id="next-q">Suivant</button>`;
  document.getElementById('next-q').addEventListener('click', nextQuestion);
  fireConfetti();
}

function onQcmAnswer(e) {
  const i = Number(e.target.dataset.i);
  const q = currentQuiz.questions[currentQuestionIndex];
  const correct = i === q.correctIndex;

  recordOnce(q, correct, q.choix[i]);

  if (correct) {
    document.querySelectorAll('.choice-btn').forEach(b => b.disabled = true);
    e.target.classList.add('correct');
    showSuccessAndNext();
  } else {
    attemptCount++;
    e.target.classList.add('incorrect');
    e.target.disabled = true;
    if (attemptCount >= MAX_ATTEMPTS) {
      document.querySelectorAll('.choice-btn').forEach(b => b.disabled = true);
      showAnswerReveal(texteBonneReponse(q), q.pisteReflexion);
    } else {
      showRetryHint(q.pisteReflexion);
    }
  }
}

function onMultiAnswer() {
  const q = currentQuiz.questions[currentQuestionIndex];
  const checked = Array.from(document.querySelectorAll('#choices input:checked'))
    .map(el => Number(el.value))
    .sort((a, b) => a - b);
  if (checked.length === 0) return;

  const correct = JSON.stringify(checked) === JSON.stringify(q.correctIndexes);

  recordOnce(q, correct, checked.map(i => q.choix[i]).join(', '));

  if (correct) {
    document.querySelectorAll('#choices input').forEach(el => el.disabled = true);
    document.getElementById('submit-multi').remove();
    showSuccessAndNext();
  } else {
    attemptCount++;
    if (attemptCount >= MAX_ATTEMPTS) {
      document.querySelectorAll('#choices input').forEach(el => el.disabled = true);
      document.getElementById('submit-multi').remove();
      showAnswerReveal(texteBonneReponse(q), q.pisteReflexion);
    } else {
      showRetryHint(q.pisteReflexion);
    }
  }
}

function onNumAnswer() {
  const input = document.getElementById('num-answer');
  const raw = input.value.trim();
  if (raw === '') return;

  const q = currentQuiz.questions[currentQuestionIndex];
  const correct = estReponseNumJuste(raw, q.answer, q.exacte);

  recordOnce(q, correct, raw);

  if (correct) {
    input.disabled = true;
    document.getElementById('submit-num').remove();
    showSuccessAndNext();
  } else {
    attemptCount++;
    if (attemptCount >= MAX_ATTEMPTS) {
      input.disabled = true;
      document.getElementById('submit-num').remove();
      showAnswerReveal(texteBonneReponse(q), q.pisteReflexion);
    } else {
      showRetryHint(q.pisteReflexion);
      input.select();
    }
  }
}

// Vérifie une réponse courte (texte normalisé, ou toute fraction égale pour une question « fraction »).
function onCourtAnswer() {
  const input = document.getElementById('court-answer');
  const raw = input.value.trim();
  if (raw === '') return;

  const q = currentQuiz.questions[currentQuestionIndex];
  // Fraction : toute fraction égale est juste ; sinon, comparaison du texte normalisé
  const fraction = q.fraction ? comparerFraction(raw, ...q.fraction) : null;
  const correct = fraction ? fraction.juste : q.reponses.some(r => normalizeText(r) === normalizeText(raw));

  recordOnce(q, correct, raw);

  if (correct) {
    input.disabled = true;
    document.getElementById('submit-court').remove();
    const conseil = fraction && !fraction.simplifiee ? `Pense à simplifier : ${texteBonneReponse(q)}` : '';
    showSuccessAndNext(conseil);
  } else {
    attemptCount++;
    if (attemptCount >= MAX_ATTEMPTS) {
      input.disabled = true;
      document.getElementById('submit-court').remove();
      showAnswerReveal(texteBonneReponse(q), q.pisteReflexion);
    } else {
      showRetryHint(q.pisteReflexion);
      input.select();
    }
  }
}

async function onOpenAnswer() {
  const textarea = document.getElementById('open-answer');
  const reponse = textarea.value.trim();
  if (!reponse) return;

  const btn = document.getElementById('submit-open');
  btn.disabled = true;
  btn.textContent = 'Correction en cours...';

  const q = currentQuiz.questions[currentQuestionIndex];
  const lesson = state.lessons.find(l => l.id === currentQuiz.lessonId);

  try {
    const result = await callClaudeJSON(
      state.accessCode,
      gradingPrompt(state.profile.niveau, currentQuiz.subject, lesson, q, reponse),
      { maxTokens: 400 }
    );
    const correct = result.statut === 'correct';

    textarea.disabled = true;
    btn.remove();
    const feedback = document.getElementById('feedback');
    feedback.innerHTML = correct
      ? `<p class="ok">Bravo, bonne réponse ! 🎉<br>${echapperHtml(result.feedback)}</p>`
      : `<p class="hint">${result.statut === 'partiel' ? 'Presque ! 🤔' : 'Pas tout à fait... 🤔'}<br>${echapperHtml(result.feedback)}</p>`;
    feedback.innerHTML += `<button id="next-q">Suivant</button>`;
    document.getElementById('next-q').addEventListener('click', nextQuestion);

    if (correct) fireConfetti();
    recordOnce(q, correct, reponse);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Valider';
    document.getElementById('feedback').innerHTML = `<p class="error">Erreur : ${echapperHtml(err.message)}</p>`;
  }
}

// Ajoute la réponse à l'historique local, avec énoncé et bonne réponse pour l'espace parent, puis la partage.
function recordAttempt(question, correct, reponseDonnee = null) {
  const attempt = {
    id: uid(),
    quizId: currentQuiz.id,
    questionId: question.id,
    subject: currentQuiz.subject,
    theme: question.theme || currentQuiz.theme || null,
    notion: question.notion,
    type: question.type,
    correct,
    date: new Date().toISOString(),
    enonce: question.enonce,
    reponseDonnee,
    bonneReponse: texteBonneReponse(question)
  };
  state.attempts.push(attempt);
  sessionResults.push(attempt);
  enregistrerEtPartager();
}

// Passe à la question suivante, ou au résultat après la dernière.
function nextQuestion() {
  currentQuestionIndex++;
  if (currentQuestionIndex < currentQuiz.questions.length) {
    renderQuizQuestion();
  } else {
    renderQuizResult();
  }
}

// Écran de résultat : score, notions à retravailler et, s'il y a eu des erreurs, le cours sur mesure.
function renderQuizResult() {
  if (currentQuiz.defiId) return terminerDefi(currentQuiz, sessionResults); // défi en famille (defis.js)
  const total = sessionResults.length;
  const correctCount = sessionResults.filter(r => r.correct).length;
  const weakNotions = [...new Set(sessionResults.filter(r => !r.correct).map(r => r.notion))];
  const goodScore = total > 0 && correctCount / total >= 0.8;

  app.innerHTML = `
    <div class="card card-wide">
      <div class="hello">
        ${goodScore ? `<span class="result-art">${illustration('trophee', mascotSVG(64))}</span>` : mascotSVG(64)}
        <div>
          <h1>Résultat</h1>
          <p class="score">${correctCount} / ${total} bonnes réponses</p>
        </div>
      </div>
      ${weakNotions.length
        ? `<p><strong>À retravailler :</strong> ${echapperHtml(weakNotions.join(', '))}</p>`
        : `<p>Tout est acquis, bravo ! 🌟</p>`}
      ${weakNotions.length ? `<button id="sur-mesure-btn">✨ Mon cours sur mesure</button><p id="sur-mesure-error" class="error"></p>` : ''}
      <button id="back-home" class="${weakNotions.length ? 'secondary' : ''}">Retour à l'accueil</button>
    </div>`;

  document.getElementById('back-home').addEventListener('click', renderHome);
  // Cours sur mesure : construit à partir des erreurs de ce quiz (app.js)
  const quizTermine = currentQuiz;
  const erreurs = erreursDuQuiz(sessionResults);
  document.getElementById('sur-mesure-btn')?.addEventListener('click', e => onCoursSurMesure(quizTermine, erreurs, e.currentTarget));
  if (goodScore) fireConfetti();
}
