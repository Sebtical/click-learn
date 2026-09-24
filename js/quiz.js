let currentQuiz = null;
let currentQuestionIndex = 0;
let sessionResults = [];
let questionRecorded = false;

function startQuiz(quiz) {
  currentQuiz = quiz;
  currentQuestionIndex = 0;
  sessionResults = [];
  renderQuizQuestion();
}

function renderQuizQuestion() {
  questionRecorded = false;
  const q = currentQuiz.questions[currentQuestionIndex];
  const progress = `Question ${currentQuestionIndex + 1}/${currentQuiz.questions.length}`;
  const figHtml = q.fig ? `<div class="fig">${q.fig}</div>` : '';

  if (q.type === 'qcm') {
    app.innerHTML = `
      <div class="card card-wide">
        <div class="quiz-topbar">
          <p class="progress">${progress} — ${q.notion}</p>
          <button id="quit-quiz" class="link">✕ Quitter</button>
        </div>
        <h2>${q.enonce}</h2>
        ${figHtml}
        <div id="choices" class="choices">
          ${q.choix.map((c, i) => `<button class="choice-btn" data-i="${i}">${c}</button>`).join('')}
        </div>
        <div id="feedback"></div>
      </div>`;
    document.querySelectorAll('.choice-btn').forEach(btn => btn.addEventListener('click', onQcmAnswer));
  } else if (q.type === 'qcm-multi') {
    app.innerHTML = `
      <div class="card card-wide">
        <div class="quiz-topbar">
          <p class="progress">${progress} — ${q.notion}</p>
          <button id="quit-quiz" class="link">✕ Quitter</button>
        </div>
        <h2>${q.enonce}</h2>
        ${figHtml}
        <div id="choices" class="choices">
          ${q.choix.map((c, i) => `
            <label class="choice-check">
              <input type="checkbox" value="${i}">
              <span>${c}</span>
            </label>`).join('')}
        </div>
        <button id="submit-multi">Valider</button>
        <div id="feedback"></div>
      </div>`;
    document.getElementById('submit-multi').addEventListener('click', onMultiAnswer);
  } else if (q.type === 'num') {
    app.innerHTML = `
      <div class="card card-wide">
        <div class="quiz-topbar">
          <p class="progress">${progress} — ${q.notion}</p>
          <button id="quit-quiz" class="link">✕ Quitter</button>
        </div>
        <h2>${q.enonce}</h2>
        ${figHtml}
        <div class="num-answer">
          <input type="text" inputmode="decimal" id="num-answer" placeholder="Ta réponse">
          ${q.unit ? `<span class="unit">${q.unit}</span>` : ''}
        </div>
        <button id="submit-num">Valider</button>
        <div id="feedback"></div>
      </div>`;
    document.getElementById('submit-num').addEventListener('click', onNumAnswer);
  } else if (q.type === 'court') {
    app.innerHTML = `
      <div class="card card-wide">
        <div class="quiz-topbar">
          <p class="progress">${progress} — ${q.notion}</p>
          <button id="quit-quiz" class="link">✕ Quitter</button>
        </div>
        <h2>${q.enonce}</h2>
        ${figHtml}
        <input type="text" id="court-answer" placeholder="Ta réponse">
        <button id="submit-court">Valider</button>
        <div id="feedback"></div>
      </div>`;
    document.getElementById('submit-court').addEventListener('click', onCourtAnswer);
  } else {
    app.innerHTML = `
      <div class="card card-wide">
        <div class="quiz-topbar">
          <p class="progress">${progress} — ${q.notion}</p>
          <button id="quit-quiz" class="link">✕ Quitter</button>
        </div>
        <h2>${q.enonce}</h2>
        ${figHtml}
        <textarea id="open-answer" rows="4" placeholder="Ta réponse..."></textarea>
        <button id="submit-open">Valider</button>
        <div id="feedback"></div>
      </div>`;
    document.getElementById('submit-open').addEventListener('click', onOpenAnswer);
  }

  document.getElementById('quit-quiz').addEventListener('click', renderHome);
}

function recordOnce(question, correct) {
  if (questionRecorded) return;
  questionRecorded = true;
  recordAttempt(question, correct);
}

function showRetryHint(pisteReflexion) {
  document.getElementById('feedback').innerHTML =
    `<p class="hint">Pas tout à fait... 🤔<br>${pisteReflexion}</p><p class="subtitle">Réessaie !</p>`;
}

function showSuccessAndNext() {
  const feedback = document.getElementById('feedback');
  feedback.innerHTML = `<p class="ok">Bravo, bonne réponse ! 🎉</p><button id="next-q">Suivant</button>`;
  document.getElementById('next-q').addEventListener('click', nextQuestion);
  fireConfetti();
}

function onQcmAnswer(e) {
  const i = Number(e.target.dataset.i);
  const q = currentQuiz.questions[currentQuestionIndex];
  const correct = i === q.correctIndex;

  recordOnce(q, correct);

  if (correct) {
    document.querySelectorAll('.choice-btn').forEach(b => b.disabled = true);
    e.target.classList.add('correct');
    showSuccessAndNext();
  } else {
    e.target.classList.add('incorrect');
    e.target.disabled = true;
    showRetryHint(q.pisteReflexion);
  }
}

function onMultiAnswer() {
  const q = currentQuiz.questions[currentQuestionIndex];
  const checked = Array.from(document.querySelectorAll('#choices input:checked'))
    .map(el => Number(el.value))
    .sort((a, b) => a - b);
  if (checked.length === 0) return;

  const correct = JSON.stringify(checked) === JSON.stringify(q.correctIndexes);

  recordOnce(q, correct);

  if (correct) {
    document.querySelectorAll('#choices input').forEach(el => el.disabled = true);
    document.getElementById('submit-multi').remove();
    showSuccessAndNext();
  } else {
    showRetryHint(q.pisteReflexion);
  }
}

function onNumAnswer() {
  const input = document.getElementById('num-answer');
  const raw = input.value.trim().replace(',', '.');
  if (raw === '') return;

  const q = currentQuiz.questions[currentQuestionIndex];
  const userNum = parseFloat(raw);
  const correct = !isNaN(userNum) && Math.abs(userNum - q.answer) < 0.01;

  recordOnce(q, correct);

  if (correct) {
    input.disabled = true;
    document.getElementById('submit-num').remove();
    showSuccessAndNext();
  } else {
    showRetryHint(q.pisteReflexion);
    input.select();
  }
}

function onCourtAnswer() {
  const input = document.getElementById('court-answer');
  const raw = input.value.trim();
  if (raw === '') return;

  const q = currentQuiz.questions[currentQuestionIndex];
  const norm = normalizeText(raw);
  const correct = q.reponses.some(r => normalizeText(r) === norm);

  recordOnce(q, correct);

  if (correct) {
    input.disabled = true;
    document.getElementById('submit-court').remove();
    showSuccessAndNext();
  } else {
    showRetryHint(q.pisteReflexion);
    input.select();
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
      state.apiKey,
      gradingPrompt(state.profile.niveau, currentQuiz.subject, lesson, q, reponse),
      { maxTokens: 400 }
    );
    const correct = result.statut === 'correct';

    textarea.disabled = true;
    btn.remove();
    const feedback = document.getElementById('feedback');
    feedback.innerHTML = correct
      ? `<p class="ok">Bravo, bonne réponse ! 🎉<br>${result.feedback}</p>`
      : `<p class="hint">${result.statut === 'partiel' ? 'Presque ! 🤔' : 'Pas tout à fait... 🤔'}<br>${result.feedback}</p>`;
    feedback.innerHTML += `<button id="next-q">Suivant</button>`;
    document.getElementById('next-q').addEventListener('click', nextQuestion);

    if (correct) fireConfetti();
    recordOnce(q, correct);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Valider';
    document.getElementById('feedback').innerHTML = `<p class="error">Erreur : ${err.message}</p>`;
  }
}

function recordAttempt(question, correct) {
  const attempt = {
    id: uid(),
    quizId: currentQuiz.id,
    questionId: question.id,
    subject: currentQuiz.subject,
    theme: currentQuiz.theme || null,
    notion: question.notion,
    type: question.type,
    correct,
    date: new Date().toISOString()
  };
  state.attempts.push(attempt);
  saveState(state);
  sessionResults.push(attempt);
}

function nextQuestion() {
  currentQuestionIndex++;
  if (currentQuestionIndex < currentQuiz.questions.length) {
    renderQuizQuestion();
  } else {
    renderQuizResult();
  }
}

function renderQuizResult() {
  const total = sessionResults.length;
  const correctCount = sessionResults.filter(r => r.correct).length;
  const weakNotions = [...new Set(sessionResults.filter(r => !r.correct).map(r => r.notion))];
  const goodScore = total > 0 && correctCount / total >= 0.8;

  app.innerHTML = `
    <div class="card card-wide">
      <div class="hello">
        ${mascotSVG(64)}
        <div>
          <h1>Résultat</h1>
          <p class="score">${correctCount} / ${total} bonnes réponses</p>
        </div>
      </div>
      ${weakNotions.length
        ? `<p><strong>À retravailler :</strong> ${weakNotions.join(', ')}</p>`
        : `<p>Tout est acquis, bravo ! 🌟</p>`}
      <button id="back-home">Retour à l'accueil</button>
    </div>`;

  document.getElementById('back-home').addEventListener('click', renderHome);
  if (goodScore) fireConfetti();
}
