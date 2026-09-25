let state = loadState();

const app = document.getElementById('app');

function render() {
  if (!state.accessCode || !state.profile.prenom) {
    renderSetup();
  } else {
    renderHome();
  }
}

function renderSetup() {
  app.innerHTML = `
    <div class="card">
      <h1>Bienvenue sur Click&amp;Learn ✨</h1>
      <p>Un petit réglage avant de commencer.</p>
      <form id="setup-form">
        <label>
          Prénom
          <input type="text" id="prenom" required value="${state.profile.prenom}">
        </label>
        <label>
          Niveau
          <select id="niveau">
            ${['6ème', '5ème', '4ème', '3ème'].map(n =>
              `<option value="${n}" ${n === state.profile.niveau ? 'selected' : ''}>${n}</option>`
            ).join('')}
          </select>
        </label>
        <label>
          Code d'accès
          <input type="password" id="accessCode" required placeholder="Code donné par un parent" value="${state.accessCode}">
        </label>
        <button type="submit">Commencer</button>
      </form>
      <p id="setup-error" class="error"></p>
    </div>
  `;

  document.getElementById('setup-form').addEventListener('submit', onSetupSubmit);
}

async function onSetupSubmit(e) {
  e.preventDefault();
  const prenom = document.getElementById('prenom').value.trim();
  const niveau = document.getElementById('niveau').value;
  const accessCode = document.getElementById('accessCode').value.trim();
  const errorEl = document.getElementById('setup-error');
  const submitBtn = e.target.querySelector('button');

  errorEl.textContent = '';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Vérification...';

  try {
    await callClaude(accessCode, [{ role: 'user', content: 'Réponds juste "ok"' }], { maxTokens: 10 });
    state.profile.prenom = prenom;
    state.profile.niveau = niveau;
    state.accessCode = accessCode;
    saveState(state);
    render();
  } catch (err) {
    errorEl.textContent = `Le code d'accès ne fonctionne pas : ${err.message}`;
    submitBtn.disabled = false;
    submitBtn.textContent = 'Commencer';
  }
}

const SUBJECT_ICONS = {
  'Maths': '🔢',
  'Français': '📖',
  'Histoire-Géographie': '🌍',
  'SVT': '🌱',
  'Anglais': '🇬🇧',
  'Physique-Chimie': '⚗️',
  'Technologie': '💻'
};

function chapterMasteryPct(subject, themeKey) {
  const relevant = state.attempts.filter(a => a.subject === subject && a.theme === themeKey);
  if (relevant.length === 0) return null;
  const correct = relevant.filter(a => a.correct).length;
  return Math.round((correct / relevant.length) * 100);
}

function masteryBadge(pct) {
  if (pct === null) return `<span class="mastery-pill neutral">pas encore testé</span>`;
  const hue = Math.round((pct / 100) * 120);
  return `<span class="mastery-pill" style="background:hsl(${hue} 70% 90%); color:hsl(${hue} 70% 28%); border-color:hsl(${hue} 70% 65%)">${pct}%</span>`;
}

function renderHome() {
  const subjectCards = state.subjects.map(s => `
    <button class="subject-card" data-subject="${s}">
      <span class="icon">${SUBJECT_ICONS[s] || '📘'}</span>
      ${s}
    </button>`).join('');

  const points = state.attempts.filter(a => a.correct).length;

  app.innerHTML = `
    <div class="card card-wide">
      <div class="topbar">
        <span class="pill star">⭐ ${points} pts</span>
        <span class="sp"></span>
      </div>
      <div class="hello">
        ${mascotSVG(72)}
        <div>
          <h1>Salut ${state.profile.prenom} 👋</h1>
          <p class="subtitle">Prêt(e) à réviser un peu ? Choisis une matière pour un quiz basé sur ton programme de ${state.profile.niveau}.</p>
        </div>
      </div>
      <div class="subject-grid">${subjectCards}</div>

      <div class="divider">ou pars d'un cours précis</div>
      <div class="actions">
        <button id="capture-btn">📷 Ajouter un cours</button>
        <button id="exercise-btn">📸 Corriger un exercice</button>
        ${state.lessons.length ? `<button id="lessons-btn" class="secondary">📚 Mes cours (${state.lessons.length})</button>` : ''}
      </div>
      <button id="edit-config" class="link">Modifier la configuration</button>

      <div class="foot-parent">
        <button id="parent-link" class="link">👪 Espace parent</button>
      </div>
    </div>
  `;

  document.querySelectorAll('.subject-card').forEach(btn => {
    btn.addEventListener('click', () => renderSubjectProgram(btn.dataset.subject));
  });
  document.getElementById('capture-btn').addEventListener('click', renderCaptureLesson);
  document.getElementById('exercise-btn').addEventListener('click', renderExerciseCapture);
  document.getElementById('edit-config').addEventListener('click', renderSetup);
  document.getElementById('parent-link').addEventListener('click', renderParentGate);
  const lessonsBtn = document.getElementById('lessons-btn');
  if (lessonsBtn) lessonsBtn.addEventListener('click', renderLessonsList);
}

function renderSubjectQuizSetup(subject) {
  app.innerHTML = `
    <div class="card card-wide">
      <h1>${SUBJECT_ICONS[subject] || '📘'} ${subject}</h1>
      <p>Quiz surprise basé sur le programme de ${state.profile.niveau}, choisis ton niveau :</p>
      <div class="actions" id="difficulty-choice">
        ${DIFFICULTIES.map(d => `<button class="difficulty-btn" data-id="${d.id}" data-label="${d.label}">${d.label}</button>`).join('')}
      </div>
      <p id="quiz-error" class="error"></p>
      <button id="back-home" class="secondary">Retour</button>
    </div>
  `;

  document.querySelectorAll('.difficulty-btn').forEach(btn => {
    btn.addEventListener('click', () => onGenerateProgramQuiz(subject, btn.dataset.id, btn.dataset.label, btn));
  });
  document.getElementById('back-home').addEventListener('click', () => renderSubjectProgram(subject));
}

async function onGenerateProgramQuiz(subject, difficultyId, difficultyLabel, btn) {
  const errorEl = document.getElementById('quiz-error');
  errorEl.textContent = '';
  document.querySelectorAll('.difficulty-btn').forEach(b => b.disabled = true);
  btn.textContent = 'Génération...';

  const dateStr = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  try {
    const parsed = await callClaudeJSON(
      state.accessCode,
      programQuizPrompt(state.profile.niveau, subject, difficultyId, dateStr),
      { system: 'Tu réponds uniquement en JSON valide, sans texte ni markdown autour.', maxTokens: 5000 }
    );
    const quiz = {
      id: uid(),
      lessonId: null,
      theme: null,
      subject,
      difficulty: difficultyId,
      createdAt: new Date().toISOString(),
      questions: parsed.questions.map(q => ({ id: uid(), ...q }))
    };
    state.quizzes.push(quiz);
    saveState(state);
    startQuiz(quiz);
  } catch (err) {
    errorEl.textContent = `Erreur de génération : ${err.message}`;
    document.querySelectorAll('.difficulty-btn').forEach(b => b.disabled = false);
    btn.textContent = difficultyLabel;
  }
}

async function renderSubjectProgram(subject) {
  if (isLocalSubject(subject)) {
    renderLocalSubjectProgram(subject);
    return;
  }

  if (!state.curriculum[subject]) {
    app.innerHTML = `
      <div class="card card-wide">
        <h1>${SUBJECT_ICONS[subject] || '📘'} ${subject}</h1>
        <div class="busy">
          <p>Je prépare le programme de ${state.profile.niveau}...</p>
        </div>
      </div>
    `;
    try {
      const dateStr = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
      const parsed = await callClaudeJSON(
        state.accessCode,
        curriculumPrompt(state.profile.niveau, subject, dateStr),
        { system: 'Tu réponds uniquement en JSON valide, sans texte ni markdown autour.', maxTokens: 3000 }
      );
      state.curriculum[subject] = parsed.chapitres;
      saveState(state);
    } catch (err) {
      app.innerHTML = `
        <div class="card card-wide">
          <h1>${SUBJECT_ICONS[subject] || '📘'} ${subject}</h1>
          <p class="error">Erreur : ${err.message}</p>
          <button id="back-home" class="secondary">Retour à l'accueil</button>
        </div>
      `;
      document.getElementById('back-home').addEventListener('click', renderHome);
      return;
    }
  }

  const chapters = state.curriculum[subject];
  const items = chapters.map((c, i) => `
    <li data-i="${i}">
      <strong>${c.titre}</strong>
      ${masteryBadge(chapterMasteryPct(subject, c.titre))}
      <span class="date">Chapitre ${i + 1}</span>
    </li>`).join('');

  app.innerHTML = `
    <div class="card card-wide">
      <h1>${SUBJECT_ICONS[subject] || '📘'} ${subject}</h1>
      <p class="subtitle">Programme de ${state.profile.niveau}, chapitre par chapitre.</p>
      <div class="actions">
        <button id="surprise-btn" class="secondary">🎲 Quiz surprise</button>
      </div>
      <ul class="lesson-list">${items}</ul>
      <button id="back-home" class="secondary">Retour à l'accueil</button>
    </div>
  `;

  document.querySelectorAll('.lesson-list li').forEach(li => {
    li.addEventListener('click', () => renderChapterQuizSetup(subject, chapters[Number(li.dataset.i)]));
  });
  document.getElementById('surprise-btn').addEventListener('click', () => renderSubjectQuizSetup(subject));
  document.getElementById('back-home').addEventListener('click', renderHome);
}

function renderChapterQuizSetup(subject, chapter) {
  app.innerHTML = `
    <div class="card card-wide">
      <h1>${chapter.titre}</h1>
      <p class="tag">${subject}</p>
      <p>${chapter.resume}</p>
      <p><strong>Notions :</strong> ${chapter.notions.join(', ')}</p>
      <h2>Générer un parcours de révision</h2>
      <div class="actions" id="difficulty-choice">
        ${DIFFICULTIES.map(d => `<button class="difficulty-btn" data-id="${d.id}" data-label="${d.label}">${d.label}</button>`).join('')}
      </div>
      <p id="quiz-error" class="error"></p>
      <button id="back-home" class="secondary">Retour</button>
    </div>
  `;

  document.querySelectorAll('.difficulty-btn').forEach(btn => {
    btn.addEventListener('click', () => onGenerateChapterQuiz(subject, chapter, btn.dataset.id, btn.dataset.label, btn));
  });
  document.getElementById('back-home').addEventListener('click', () => renderSubjectProgram(subject));
}

async function onGenerateChapterQuiz(subject, chapter, difficultyId, difficultyLabel, btn) {
  const errorEl = document.getElementById('quiz-error');
  errorEl.textContent = '';
  document.querySelectorAll('.difficulty-btn').forEach(b => b.disabled = true);
  btn.textContent = 'Génération...';

  try {
    const parsed = await callClaudeJSON(
      state.accessCode,
      quizGenerationPrompt(state.profile.niveau, subject, difficultyId, chapter),
      { system: 'Tu réponds uniquement en JSON valide, sans texte ni markdown autour.', maxTokens: 5000 }
    );
    const quiz = {
      id: uid(),
      lessonId: null,
      theme: chapter.titre,
      subject,
      difficulty: difficultyId,
      createdAt: new Date().toISOString(),
      questions: parsed.questions.map(q => ({ id: uid(), ...q }))
    };
    state.quizzes.push(quiz);
    saveState(state);
    startQuiz(quiz);
  } catch (err) {
    errorEl.textContent = `Erreur de génération : ${err.message}`;
    document.querySelectorAll('.difficulty-btn').forEach(b => b.disabled = false);
    btn.textContent = difficultyLabel;
  }
}

function renderLocalSubjectProgram(subject) {
  const themes = localThemes(subject);
  const items = themes.map((c, i) => `
    <li data-i="${i}">
      <strong>${c.titre}</strong>
      ${masteryBadge(chapterMasteryPct(subject, c.id))}
      <span class="date">Chapitre ${i + 1}</span>
    </li>`).join('');

  app.innerHTML = `
    <div class="card card-wide">
      <h1>${SUBJECT_ICONS[subject] || '📘'} ${subject}</h1>
      <p class="subtitle">Programme de ${state.profile.niveau}, chapitre par chapitre.</p>
      <div class="actions">
        <button id="surprise-btn" class="secondary">🎲 Quiz surprise</button>
      </div>
      <ul class="lesson-list">${items}</ul>
      <button id="back-home" class="secondary">Retour à l'accueil</button>
    </div>
  `;

  document.querySelectorAll('.lesson-list li').forEach(li => {
    li.addEventListener('click', () => renderLocalChapterQuizSetup(subject, themes[Number(li.dataset.i)]));
  });
  document.getElementById('surprise-btn').addEventListener('click', () => renderLocalQuizSetup(subject, null));
  document.getElementById('back-home').addEventListener('click', renderHome);
}

function renderLocalChapterQuizSetup(subject, theme) {
  app.innerHTML = `
    <div class="card card-wide">
      <h1>${theme.titre}</h1>
      <p class="tag">${subject}</p>
      <p>${theme.resume}</p>
      <p><strong>Notions :</strong> ${theme.notions.join(', ')}</p>
      <div class="actions">
        <button id="cours-btn" class="secondary">📖 Voir le cours</button>
      </div>
      <h2>Générer un parcours de révision</h2>
      <div class="actions" id="difficulty-choice">
        ${DIFFICULTIES.map(d => `<button class="difficulty-btn" data-id="${d.id}">${d.label}</button>`).join('')}
      </div>
      <button id="back-home" class="secondary">Retour</button>
    </div>
  `;

  document.querySelectorAll('.difficulty-btn').forEach(btn => {
    btn.addEventListener('click', () => startLocalQuiz(subject, theme.id, btn.dataset.id));
  });
  document.getElementById('cours-btn').addEventListener('click', () => renderLessonContent(subject, theme));
  document.getElementById('back-home').addEventListener('click', () => renderSubjectProgram(subject));
}

function renderLessonContent(subject, theme) {
  const paragraphs = theme.cours.split('\n\n').map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');

  app.innerHTML = `
    <div class="card card-wide">
      <h1>📖 ${theme.titre}</h1>
      <p class="tag">${subject}</p>
      <div class="cours-content">${paragraphs}</div>
      <div class="actions">
        <button id="quiz-btn">Faire un quiz sur ce chapitre</button>
        <button id="back-home" class="secondary">Retour</button>
      </div>
    </div>
  `;

  document.getElementById('quiz-btn').addEventListener('click', () => renderLocalChapterQuizSetup(subject, theme));
  document.getElementById('back-home').addEventListener('click', () => renderSubjectProgram(subject));
}

function renderLocalQuizSetup(subject, themeId) {
  app.innerHTML = `
    <div class="card card-wide">
      <h1>${SUBJECT_ICONS[subject] || '📘'} ${subject}</h1>
      <p>Quiz surprise sur tout le programme vu, choisis ton niveau :</p>
      <div class="actions" id="difficulty-choice">
        ${DIFFICULTIES.map(d => `<button class="difficulty-btn" data-id="${d.id}">${d.label}</button>`).join('')}
      </div>
      <button id="back-home" class="secondary">Retour</button>
    </div>
  `;

  document.querySelectorAll('.difficulty-btn').forEach(btn => {
    btn.addEventListener('click', () => startLocalQuiz(subject, themeId, btn.dataset.id));
  });
  document.getElementById('back-home').addEventListener('click', () => renderSubjectProgram(subject));
}

function startLocalQuiz(subject, themeId, difficultyId) {
  const questions = generateLocalQuiz(subject, themeId, difficultyId, QUIZ_LENGTH);
  const quiz = {
    id: uid(),
    lessonId: null,
    theme: themeId,
    subject,
    difficulty: difficultyId,
    createdAt: new Date().toISOString(),
    questions
  };
  state.quizzes.push(quiz);
  saveState(state);
  startQuiz(quiz);
}

let selectedLessonFiles = [];
let lessonPreviewUrls = [];

function revokePreviewUrls(urls) {
  urls.forEach(u => URL.revokeObjectURL(u));
}

// Affiche les miniatures d'un tableau de photos accumulées, avec un bouton pour en retirer une.
// (capture="environment" ne renvoie qu'une photo par déclenchement sur mobile — on cumule
// les captures successives côté app plutôt que de compter sur un multi-select natif.)
function renderPhotoThumbs(previewElId, onRemove, urls) {
  document.getElementById(previewElId).innerHTML = urls.map((u, i) => `
    <div class="thumb-wrap">
      <img class="thumb" src="${u}">
      <button type="button" class="thumb-remove" data-i="${i}" aria-label="Retirer cette photo">✕</button>
    </div>`).join('');
  document.querySelectorAll(`#${previewElId} .thumb-remove`).forEach(btn => {
    btn.addEventListener('click', () => onRemove(Number(btn.dataset.i)));
  });
}

// Empêche de retirer une photo ou d'en ajouter une autre pendant qu'une analyse est en cours
// (sinon la photo "retirée" a déjà été envoyée à l'API sans que le résultat en tienne compte).
function setCaptureControlsDisabled(photoInputId, disabled) {
  document.getElementById(photoInputId).disabled = disabled;
  document.querySelectorAll('.thumb-remove').forEach(b => b.disabled = disabled);
}

// files/urls : les tableaux (selectedLessonFiles/lessonPreviewUrls ou leur équivalent exercice)
// à tenir synchronisés quand l'élève retire une photo de l'aperçu.
function updatePhotoPreview(files, urls) {
  renderPhotoThumbs('preview', (i) => {
    URL.revokeObjectURL(urls[i]);
    urls.splice(i, 1);
    files.splice(i, 1);
    document.getElementById('analyze-btn').disabled = files.length === 0;
    updatePhotoPreview(files, urls);
  }, urls);
}

function renderCaptureLesson() {
  selectedLessonFiles = [];
  revokePreviewUrls(lessonPreviewUrls);
  lessonPreviewUrls = [];
  app.innerHTML = `
    <div class="card card-wide">
      <h1>Photographier un cours</h1>
      <p>Prends une photo, puis retape sur le bouton pour en ajouter d'autres si besoin (une page à la fois).</p>
      <input type="file" accept="image/*" capture="environment" multiple id="lesson-photo">
      <div id="preview" class="thumb-row"></div>
      <div class="actions">
        <button id="analyze-btn" disabled>Analyser</button>
        <button id="cancel-btn" class="secondary">Annuler</button>
      </div>
      <p id="capture-error" class="error"></p>
    </div>
  `;

  document.getElementById('lesson-photo').addEventListener('change', (e) => {
    const newFiles = Array.from(e.target.files || []);
    e.target.value = ''; // permet de reprendre le même input pour la photo suivante
    if (newFiles.length === 0) return;
    selectedLessonFiles.push(...newFiles);
    lessonPreviewUrls.push(...newFiles.map(f => URL.createObjectURL(f)));
    document.getElementById('analyze-btn').disabled = false;
    updatePhotoPreview(selectedLessonFiles, lessonPreviewUrls);
  });
  document.getElementById('analyze-btn').addEventListener('click', onAnalyzeLesson);
  document.getElementById('cancel-btn').addEventListener('click', () => {
    revokePreviewUrls(lessonPreviewUrls);
    lessonPreviewUrls = [];
    renderHome();
  });
}

async function onAnalyzeLesson() {
  const errorEl = document.getElementById('capture-error');
  const analyzeBtn = document.getElementById('analyze-btn');
  errorEl.textContent = '';
  analyzeBtn.disabled = true;
  analyzeBtn.textContent = 'Analyse en cours...';
  setCaptureControlsDisabled('lesson-photo', true);

  try {
    const images = await Promise.all(selectedLessonFiles.map(f => resizeImageToBase64(f)));
    const content = [
      { type: 'text', text: images.length > 1 ? 'Voici les photos du cours (plusieurs pages).' : 'Voici la photo du cours.' },
      ...images.map(img => imageContentBlock(img.base64, img.mediaType))
    ];
    const extracted = await callClaudeJSON(state.accessCode, content, {
      system: lessonAnalysisPrompt(state.profile.niveau, state.subjects)
    });
    // On ne révoque les URLs d'aperçu qu'une fois l'appel réussi : en cas d'erreur, l'écran
    // de capture reste affiché et doit garder des miniatures valides pour la nouvelle tentative.
    revokePreviewUrls(lessonPreviewUrls);
    lessonPreviewUrls = [];
    renderLessonPreview(extracted, images.map(img => img.dataUrl));
  } catch (err) {
    errorEl.textContent = `Erreur d'analyse : ${err.message}`;
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = 'Analyser';
    setCaptureControlsDisabled('lesson-photo', false);
  }
}

function renderLessonPreview(extracted, imageDataUrls) {
  app.innerHTML = `
    <div class="card card-wide">
      <h1>Vérifie les infos</h1>
      <div class="thumb-row">${imageDataUrls.map(u => `<img class="thumb" src="${u}">`).join('')}</div>
      <label>
        Matière
        <select id="matiere">
          ${state.subjects.map(s => `<option ${s === extracted.matiere ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </label>
      <label>
        Titre
        <input id="titre" value="${extracted.titre}">
      </label>
      <p><strong>Résumé :</strong> ${extracted.resume}</p>
      <p><strong>Notions :</strong> ${extracted.notions.join(', ')}</p>
      <div class="actions">
        <button id="save-lesson-btn">Enregistrer</button>
        <button id="cancel-btn" class="secondary">Annuler</button>
      </div>
    </div>
  `;

  document.getElementById('save-lesson-btn').addEventListener('click', () => {
    const lesson = {
      id: uid(),
      matiere: document.getElementById('matiere').value,
      titre: document.getElementById('titre').value,
      resume: extracted.resume,
      notions: extracted.notions,
      date: new Date().toISOString()
    };
    state.lessons.push(lesson);
    saveState(state);
    renderLessonDetail(lesson);
  });
  document.getElementById('cancel-btn').addEventListener('click', renderHome);
}

function renderLessonsList() {
  const items = [...state.lessons].reverse().map(l => `
    <li data-id="${l.id}">
      <strong>${l.titre}</strong>
      <span class="tag">${l.matiere}</span>
      <span class="date">${new Date(l.date).toLocaleDateString('fr-FR')}</span>
    </li>`).join('');

  app.innerHTML = `
    <div class="card card-wide">
      <h1>Mes cours</h1>
      <ul class="lesson-list">${items}</ul>
      <button id="back-home" class="secondary">Retour à l'accueil</button>
    </div>
  `;

  document.querySelectorAll('.lesson-list li').forEach(li => {
    li.addEventListener('click', () => {
      const lesson = state.lessons.find(l => l.id === li.dataset.id);
      renderLessonDetail(lesson);
    });
  });
  document.getElementById('back-home').addEventListener('click', renderHome);
}

function renderLessonDetail(lesson) {
  app.innerHTML = `
    <div class="card card-wide">
      <h1>${lesson.titre}</h1>
      <p class="tag">${lesson.matiere}</p>
      <p>${lesson.resume}</p>
      <p><strong>Notions :</strong> ${lesson.notions.join(', ')}</p>
      <h2>Générer un parcours de révision</h2>
      <div class="actions" id="difficulty-choice">
        ${DIFFICULTIES.map(d => `<button class="difficulty-btn" data-id="${d.id}" data-label="${d.label}">${d.label}</button>`).join('')}
      </div>
      <p id="quiz-error" class="error"></p>
      <button id="back-home" class="secondary">Retour à l'accueil</button>
    </div>
  `;

  document.querySelectorAll('.difficulty-btn').forEach(btn => {
    btn.addEventListener('click', () => onGenerateQuiz(lesson, btn.dataset.id, btn.dataset.label, btn));
  });
  document.getElementById('back-home').addEventListener('click', renderHome);
}

async function onGenerateQuiz(lesson, difficultyId, difficultyLabel, btn) {
  const errorEl = document.getElementById('quiz-error');
  errorEl.textContent = '';
  document.querySelectorAll('.difficulty-btn').forEach(b => b.disabled = true);
  btn.textContent = 'Génération...';

  try {
    const parsed = await callClaudeJSON(
      state.accessCode,
      quizGenerationPrompt(state.profile.niveau, lesson.matiere, difficultyId, lesson),
      { system: 'Tu réponds uniquement en JSON valide, sans texte ni markdown autour.', maxTokens: 5000 }
    );
    const quiz = {
      id: uid(),
      lessonId: lesson.id,
      theme: null,
      subject: lesson.matiere,
      difficulty: difficultyId,
      createdAt: new Date().toISOString(),
      questions: parsed.questions.map(q => ({ id: uid(), ...q }))
    };
    state.quizzes.push(quiz);
    saveState(state);
    startQuiz(quiz);
  } catch (err) {
    errorEl.textContent = `Erreur de génération : ${err.message}`;
    document.querySelectorAll('.difficulty-btn').forEach(b => b.disabled = false);
    btn.textContent = difficultyLabel;
  }
}

let selectedExerciseFiles = [];
let exercisePreviewUrls = [];

function renderExerciseCapture() {
  selectedExerciseFiles = [];
  revokePreviewUrls(exercisePreviewUrls);
  exercisePreviewUrls = [];
  app.innerHTML = `
    <div class="card card-wide">
      <h1>Corriger un exercice</h1>
      <p>Prends une photo, puis retape sur le bouton pour en ajouter d'autres si besoin (une page à la fois).</p>
      <input type="file" accept="image/*" capture="environment" multiple id="exercise-photo">
      <div id="preview" class="thumb-row"></div>
      <div class="actions">
        <button id="analyze-btn" disabled>Corriger</button>
        <button id="cancel-btn" class="secondary">Annuler</button>
      </div>
      <p id="capture-error" class="error"></p>
    </div>
  `;

  document.getElementById('exercise-photo').addEventListener('change', (e) => {
    const newFiles = Array.from(e.target.files || []);
    e.target.value = ''; // permet de reprendre le même input pour la photo suivante
    if (newFiles.length === 0) return;
    selectedExerciseFiles.push(...newFiles);
    exercisePreviewUrls.push(...newFiles.map(f => URL.createObjectURL(f)));
    document.getElementById('analyze-btn').disabled = false;
    updatePhotoPreview(selectedExerciseFiles, exercisePreviewUrls);
  });
  document.getElementById('analyze-btn').addEventListener('click', onAnalyzeExercise);
  document.getElementById('cancel-btn').addEventListener('click', () => {
    revokePreviewUrls(exercisePreviewUrls);
    exercisePreviewUrls = [];
    renderHome();
  });
}

async function onAnalyzeExercise() {
  const errorEl = document.getElementById('capture-error');
  const analyzeBtn = document.getElementById('analyze-btn');
  errorEl.textContent = '';
  analyzeBtn.disabled = true;
  analyzeBtn.textContent = 'Correction en cours...';
  setCaptureControlsDisabled('exercise-photo', true);

  try {
    const images = await Promise.all(selectedExerciseFiles.map(f => resizeImageToBase64(f)));
    const content = [
      { type: 'text', text: images.length > 1 ? "Voici les photos de l'exercice déjà réalisé (plusieurs pages)." : "Voici la photo de l'exercice déjà réalisé." },
      ...images.map(img => imageContentBlock(img.base64, img.mediaType))
    ];
    const result = await callClaudeJSON(state.accessCode, content, {
      system: exerciseGradingPrompt(state.profile.niveau, state.subjects),
      maxTokens: 3000
    });
    // On ne révoque les URLs d'aperçu qu'une fois l'appel réussi : en cas d'erreur, l'écran
    // de capture reste affiché et doit garder des miniatures valides pour la nouvelle tentative.
    revokePreviewUrls(exercisePreviewUrls);
    exercisePreviewUrls = [];
    renderExerciseResult(result, images.map(img => img.dataUrl));
  } catch (err) {
    errorEl.textContent = `Erreur de correction : ${err.message}`;
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = 'Corriger';
    setCaptureControlsDisabled('exercise-photo', false);
  }
}

function renderExerciseResult(result, imageDataUrls) {
  const sessionId = uid();
  const now = new Date().toISOString();

  result.exercices.forEach(ex => {
    state.attempts.push({
      id: uid(),
      quizId: sessionId,
      questionId: null,
      subject: result.matiere,
      notion: ex.notion,
      type: 'exercice',
      correct: ex.statut === 'correct',
      date: now
    });
  });
  saveState(state);

  const allCorrect = result.exercices.every(ex => ex.statut === 'correct');

  const items = result.exercices.map(ex => `
    <li class="exercise-item">
      <p class="ex-statement">${ex.statut === 'correct' ? '✅' : ex.statut === 'partiel' ? '🟡' : '🔴'} ${ex.enonce}</p>
      <p class="subtitle">Ta réponse : ${ex.reponseEleve}</p>
      ${ex.statut !== 'correct' ? `<p class="hint">${ex.feedback}</p>` : `<p class="ok">${ex.feedback}</p>`}
    </li>`).join('');

  app.innerHTML = `
    <div class="card card-wide">
      <div class="hello">
        ${mascotSVG(64)}
        <div>
          <h1>Correction</h1>
          <p class="tag">${result.matiere}</p>
        </div>
      </div>
      <div class="thumb-row">${imageDataUrls.map(u => `<img class="thumb" src="${u}">`).join('')}</div>
      <ul class="exercise-list">${items}</ul>
      <button id="back-home">Retour à l'accueil</button>
    </div>
  `;

  document.getElementById('back-home').addEventListener('click', renderHome);
  if (allCorrect) fireConfetti();
}

render();
