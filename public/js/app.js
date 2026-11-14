let state = loadState();

const app = document.getElementById('app');

// Point d'entrée : configuration au premier lancement, sinon accueil puis vérification du rôle en arrière-plan.
function render() {
  if (!state.accessCode || !state.profile.prenom) {
    renderSetup();
  } else {
    renderHome();
    actualiserRole().then(apresRole);
  }
}

// Une fois le rôle connu : montre l'écran de partage si besoin (depuis l'accueil seulement), sinon synchronise.
function apresRole() {
  if (repriseADemander()) {
    if (document.getElementById('edit-config')) renderConfirmReprise();
  } else {
    synchroniser();
  }
}

// Vrai si le serveur a reconnu un code parent (sert seulement à l'affichage : le serveur reste seul juge).
function estParent() {
  return state.role === 'parent1' || state.role === 'parent2';
}

// Met à jour le rôle en arrière-plan, pour les appareils déjà configurés avant l'arrivée des profils.
async function actualiserRole() {
  try {
    const role = await demanderRole(state.accessCode);
    if (role === state.role) return;
    state.role = role;
    saveState(state);
    // On ne redessine que si l'accueil est encore affiché, pour ne pas interrompre un quiz.
    if (document.getElementById('edit-config')) renderHome();
  } catch {
    // Hors ligne ou code refusé : on garde l'affichage actuel, les routes serveur restent protégées.
  }
}

// Écran de configuration : prénom, niveau et code d'accès.
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
          <input type="password" id="accessCode" required placeholder="Code donné par un parent" value="${echapperHtml(state.accessCode)}">
        </label>
        <button type="submit">Commencer</button>
      </form>
      <p id="setup-error" class="error"></p>
    </div>
  `;

  document.getElementById('setup-form').addEventListener('submit', onSetupSubmit);
}

// Vérifie le code auprès du serveur (sans appel payant), enregistre la configuration puis ouvre l'accueil.
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
    const role = await demanderRole(accessCode);
    state.profile.prenom = prenom;
    state.profile.niveau = niveau;
    state.accessCode = accessCode;
    state.role = role;
    saveState(state);
    renderHome(); // et non render(), qui redemanderait le rôle qu'on vient d'obtenir
    apresRole();
  } catch (err) {
    errorEl.textContent = `Le code d'accès ne fonctionne pas : ${err.message}`;
    submitBtn.disabled = false;
    submitBtn.textContent = 'Commencer';
  }
}

// ── Avatar ──

// Écran de choix de l'avatar : photo prise dans la galerie, recadrée, réduite et gardée sur l'appareil.
function renderAvatar() {
  const avatar = lireAvatar();
  app.innerHTML = `
    <div class="card">
      <h1>Mon avatar</h1>
      <div class="avatar avatar-grand">${avatarHtml(avatar, mascotSVG(110))}</div>
      <p class="subtitle">Choisis une image dans ta galerie. Elle reste sur ce téléphone : elle n'est jamais envoyée.</p>
      <label class="file-btn">
        <input type="file" id="avatar-file" accept="image/*">
        <span>🖼️ Choisir une image</span>
      </label>
      <p id="avatar-error" class="error"></p>
      <div class="actions">
        ${estAvatarValide(avatar) ? '<button id="avatar-remove" class="secondary">Retirer mon avatar</button>' : ''}
        <button id="back-home" class="secondary">Retour à l'accueil</button>
      </div>
    </div>
  `;

  // Nouvelle image : réduction puis sauvegarde ; en cas d'échec, on garde l'ancien avatar
  document.getElementById('avatar-file').addEventListener('change', async e => {
    const champ = e.target;
    const fichier = champ.files[0];
    if (!fichier) return;
    try {
      const image = await reduireImageCarree(fichier);
      ecrireAvatar(image);
      // L'enfant a pu quitter l'écran pendant la réduction : on ne le ramène pas ici de force
      if (document.getElementById('avatar-file')) renderAvatar();
    } catch {
      champ.value = ''; // permet de réessayer avec le même fichier
      const errorEl = document.getElementById('avatar-error');
      if (errorEl) errorEl.textContent = "Impossible d'utiliser cette image. Essaie avec une autre photo (JPEG ou PNG).";
    }
  });

  // Retrait de l'avatar : retour à la mascotte
  const retirer = document.getElementById('avatar-remove');
  if (retirer) retirer.addEventListener('click', () => {
    ecrireAvatar(null);
    renderAvatar();
  });
  document.getElementById('back-home').addEventListener('click', renderHome);
}

// Lit une image, la recadre en carré centré et la réduit à TAILLE_AVATAR px ; renvoie un JPEG encodé.
function reduireImageCarree(fichier) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(fichier);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      // try/catch : une erreur ici (dessin refusé par le navigateur) doit aboutir à un message, pas à une attente sans fin
      try {
        const { sx, sy, cote } = cadrageCarre(img.naturalWidth, img.naturalHeight);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = TAILLE_AVATAR;
        canvas.getContext('2d').drawImage(img, sx, sy, cote, cote, 0, 0, TAILLE_AVATAR, TAILLE_AVATAR);
        const resultat = canvas.toDataURL('image/jpeg', 0.85);
        if (estAvatarValide(resultat)) resolve(resultat);
        else reject(new Error('image trop lourde ou illisible'));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image illisible')); };
    img.src = url;
  });
}

function chapterMasteryPct(subject, themeKey) {
  const relevant = state.attempts.filter(a => a.subject === subject && a.theme === themeKey);
  if (relevant.length === 0) return null;
  const correct = relevant.filter(a => a.correct).length;
  return pourcentage(correct, relevant.length);
}

// Pastille de maîtrise en % (espace parent), colorée avec la même échelle que les anneaux.
function masteryBadge(pct) {
  if (pct === null) return `<span class="mastery-pill neutral">pas encore testé</span>`;
  const hue = teinteMaitrise(pct);
  return `<span class="mastery-pill" style="background:hsl(${hue} 70% 90%); color:hsl(${hue} 70% 28%); border-color:hsl(${hue} 70% 65%)">${pct}%</span>`;
}

// Accueil : salutation, carte de niveau, matières en cartes illustrées, puis les actions photo.
function renderHome() {
  const points = state.attempts.filter(a => a.correct).length;
  const n = niveauDepuisPoints(points);

  // Une carte par matière, avec son illustration (ou son emoji tant que l'image n'est pas fournie)
  const subjectCards = state.subjects.map(s => `
    <button class="subject-card" data-subject="${echapperHtml(s)}">
      <span class="subject-art">${illustration(s, `<span class="emoji">${iconeMatiere(s)}</span>`)}</span>
      <span class="subject-name">${echapperHtml(s)}</span>
      <span class="go" aria-hidden="true">↗</span>
    </button>`).join('');

  app.innerHTML = `
    <div class="card card-wide home">
      <header class="home-head">
        <button id="avatar-btn" class="avatar" aria-label="Changer mon avatar">${avatarHtml(lireAvatar(), illustration('avatar', mascotSVG(56)))}</button>
        <div>
          <h1>Salut ${echapperHtml(state.profile.prenom)} 👋</h1>
          <p class="subtitle">⭐ ${points} point${points > 1 ? 's' : ''} · ${echapperHtml(state.profile.niveau)}</p>
        </div>
      </header>

      ${infoContenuHtml()}
      <section class="level-card${ILLUSTRATIONS.banniere ? ' avec-banniere' : ''}">
        ${banniereHtml()}
        <div class="level-text">
          <h2>Niveau ${n.niveau}</h2>
          <p>Encore ${n.reste} bonne${n.reste > 1 ? 's' : ''} réponse${n.reste > 1 ? 's' : ''} pour le niveau ${n.niveau + 1}</p>
        </div>
        <div class="level-art">${illustration('trophee', '<span class="emoji">🏆</span>')}</div>
        <div class="level-bar" role="progressbar" aria-label="Progression vers le niveau suivant" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${n.pct}">
          <span style="width:${n.pct}%"></span>
        </div>
      </section>

      <h2 class="section-title">Tes matières</h2>
      <div class="subject-grid">${subjectCards}</div>

      <h2 class="section-title">Pars d'un cours précis</h2>
      <div class="action-cards">
        <button id="capture-btn" class="action-card">
          <span class="action-art">${illustration('photo', '<span class="emoji">📷</span>')}</span>
          <span><strong>Ajouter un cours</strong><small>Prends ta leçon en photo, je prépare un quiz.</small></span>
        </button>
        <button id="exercise-btn" class="action-card">
          <span class="action-art">${illustration('exercice', '<span class="emoji">📸</span>')}</span>
          <span><strong>Corriger un exercice</strong><small>Photo de ton exercice, je t'explique tes erreurs.</small></span>
        </button>
        ${state.lessons.length ? `<button id="lessons-btn" class="action-card">
          <span class="action-art"><span class="emoji">📚</span></span>
          <span><strong>Mes cours (${state.lessons.length})</strong><small>Retrouve les cours que tu as ajoutés.</small></span>
        </button>` : ''}
      </div>

      <div class="home-foot">
        <button id="edit-config" class="link">Modifier la configuration</button>
        ${estParent() ? '<button id="parent-link" class="link">👪 Espace parent</button>' : ''}
      </div>
    </div>
  `;

  // Branchement des boutons
  document.getElementById('info-contenu-ok')?.addEventListener('click', () => {
    state.infoContenuVue = true;
    saveState(state);
    renderHome();
  });
  document.getElementById('avatar-btn').addEventListener('click', renderAvatar);
  document.querySelectorAll('.subject-card').forEach(btn => {
    btn.addEventListener('click', () => renderSubjectProgram(btn.dataset.subject));
  });
  document.getElementById('capture-btn').addEventListener('click', renderCaptureLesson);
  document.getElementById('exercise-btn').addEventListener('click', renderExerciseCapture);
  document.getElementById('edit-config').addEventListener('click', renderSetup);
  const parentLink = document.getElementById('parent-link');
  if (parentLink) parentLink.addEventListener('click', renderParentDashboard);
  const lessonsBtn = document.getElementById('lessons-btn');
  if (lessonsBtn) lessonsBtn.addEventListener('click', renderLessonsList);
}

function renderSubjectQuizSetup(subject) {
  app.innerHTML = `
    <div class="card card-wide">
      ${enTete(titreMatiere(subject), '', subject)}
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
      questions: questionsDepuisIA(parsed.questions)
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
        ${enTete(titreMatiere(subject), '', subject)}
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
          ${enTete(titreMatiere(subject), '', subject)}
          <p class="error">Erreur : ${echapperHtml(err.message)}</p>
          <button id="back-home" class="secondary">Retour à l'accueil</button>
        </div>
      `;
      document.getElementById('back-home').addEventListener('click', renderHome);
      return;
    }
  }

  const chapters = state.curriculum[subject];
  const items = chapters.map((c, i) => chapitreLi(i, c.titre, chapterMasteryPct(subject, c.titre))).join('');

  app.innerHTML = `
    <div class="card card-wide">
      ${enTete(titreMatiere(subject), `Programme de ${echapperHtml(state.profile.niveau)}, chapitre par chapitre.`, subject)}
      <div class="actions">
        <button id="surprise-btn" class="secondary">🎲 Quiz surprise</button>
      </div>
      <ul class="lesson-list chapter-list">${items}</ul>
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
      ${enTete(echapperHtml(chapter.titre), `<span class="tag">${echapperHtml(subject)}</span>`, subject)}
      <p>${echapperHtml(chapter.resume)}</p>
      <p><strong>Notions :</strong> ${echapperHtml(chapter.notions.join(', '))}</p>
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
      questions: questionsDepuisIA(parsed.questions)
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
  const items = themes.map((c, i) => chapitreLi(i, c.titre, chapterMasteryPct(subject, c.id))).join('');

  app.innerHTML = `
    <div class="card card-wide">
      ${enTete(titreMatiere(subject), `Programme de ${echapperHtml(state.profile.niveau)}, chapitre par chapitre.`, subject)}
      <div class="actions">
        <button id="surprise-btn" class="secondary">🎲 Quiz surprise</button>
      </div>
      <ul class="lesson-list chapter-list">${items}</ul>
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
      ${enTete(echapperHtml(theme.titre), `<span class="tag">${echapperHtml(subject)}</span>`, subject)}
      <p>${echapperHtml(theme.resume)}</p>
      <p><strong>Notions :</strong> ${echapperHtml(theme.notions.join(', '))}</p>
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
      ${enTete(titreMatiere(subject), '', subject)}
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
      ${enTete('Photographier un cours', '', 'photo')}
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
      system: lessonAnalysisPrompt(state.profile.niveau, state.subjects),
      maxTokens: 6000 // résumé + fiche détaillée fidèle à la photo
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
  app.innerHTML = apercuCoursHtml(extracted, imageDataUrls, state.subjects);

  document.getElementById('save-lesson-btn').addEventListener('click', () => {
    const lesson = {
      id: uid(),
      matiere: document.getElementById('matiere').value,
      titre: document.getElementById('titre').value,
      resume: extracted.resume,
      notions: extracted.notions,
      fiche: lireFiche(extracted.fiche),
      ficheSource: lireFiche(extracted.fiche) ? 'photo' : null,
      date: new Date().toISOString()
    };
    state.lessons.push(lesson);
    enregistrerEtPartager();
    renderLessonDetail(lesson);
  });
  document.getElementById('cancel-btn').addEventListener('click', renderHome);
}

function renderLessonsList() {
  const items = [...state.lessons].reverse().map(l => `
    <li data-id="${l.id}">
      <strong>${echapperHtml(l.titre)}</strong>
      <span class="tag">${echapperHtml(l.matiere)}</span>
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

// Message affiché une fois à l'enfant : ses fiches et cartes mentales sont visibles par ses parents.
function infoContenuHtml() {
  if (state.role !== 'enfant' || state.infoContenuVue) return '';
  return `<section class="card info-contenu">
        <p>👀 <strong>Nouveau :</strong> tes fiches de cours et tes cartes mentales sont maintenant visibles par tes parents dans leur espace. Tes photos, elles, restent sur ton téléphone.</p>
        <button id="info-contenu-ok" class="secondary">J'ai compris</button>
      </section>`;
}

// Fiche d'un cours enregistré, avec ses boutons (détails, carte mentale, mini-quiz, quiz de révision).
function renderLessonDetail(lesson) {
  app.innerHTML = ficheCoursHtml(lesson, DIFFICULTIES);

  document.getElementById('fiche-btn')?.addEventListener('click', e => onPlusDeDetails(lesson, e.currentTarget));
  document.getElementById('mini-quiz-btn')?.addEventListener('click', () => lancerMiniQuiz(lesson));
  document.getElementById('carte-btn')?.addEventListener('click', e => onCarteMentale(lesson, e.currentTarget));
  document.querySelectorAll('.difficulty-btn').forEach(btn => {
    btn.addEventListener('click', () => onGenerateQuiz(lesson, btn.dataset.id, btn.dataset.label, btn));
  });
  document.getElementById('back-home').addEventListener('click', renderHome);
}

// « Plus de détails » : affiche la fiche détaillée, en la demandant d'abord à l'IA si le cours n'en a pas.
// La fiche est gardée sur l'appareil : un seul appel payant par cours.
async function onPlusDeDetails(lesson, btn) {
  const zone = document.getElementById('fiche-detail');
  if (!lesson.fiche) {
    btn.disabled = true;
    btn.textContent = 'Rédaction de la fiche...';
    try {
      const reponse = await callClaudeJSON(state.accessCode, ficheDetailleePrompt(state.profile.niveau, lesson), {
        system: 'Tu réponds uniquement en JSON valide, sans texte ni markdown autour.', maxTokens: 5000
      });
      const fiche = lireFiche(reponse?.fiche);
      if (!fiche) throw new Error('fiche vide, réessaie');
      lesson.fiche = fiche;
      lesson.ficheSource = 'resume';
      aRepartager(lesson); // la fiche rejoint l'espace parent
      enregistrerEtPartager();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = '📖 Plus de détails';
      zone.innerHTML = `<p class="error">Impossible de rédiger la fiche : ${echapperHtml(err.message)}</p>`;
      return;
    }
  }
  btn.remove();
  zone.innerHTML = ficheDetailleeHtml(lesson);
}

// Carte mentale d'un cours : demandée une fois à l'IA, puis gardée sur l'appareil et dessinée par l'appli.
async function onCarteMentale(lesson, btn) {
  const zone = document.getElementById('carte-zone');
  // Carte faite avant la fiche détaillée : refaite à partir de la fiche, source plus fidèle
  if (!lesson.carte || (lesson.fiche && lesson.carte.source !== 'fiche')) {
    btn.disabled = true;
    btn.textContent = 'Création de la carte...';
    try {
      const reponse = await callClaudeJSON(state.accessCode, carteMentalePrompt(state.profile.niveau, lesson), {
        system: 'Tu réponds uniquement en JSON valide, sans texte ni markdown autour.', maxTokens: 2500
      });
      const carte = validerCarteMentale(reponse);
      if (!carte) throw new Error("réponse de l'IA inutilisable, réessaie");
      lesson.carte = { ...carte, source: lesson.fiche ? 'fiche' : 'resume' };
      aRepartager(lesson); // la carte rejoint l'espace parent
      enregistrerEtPartager();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = '🧠 Carte mentale';
      zone.innerHTML = `<p class="error">Impossible de créer la carte : ${echapperHtml(err.message)}</p>`;
      return;
    }
  }
  if (!zone.isConnected) return; // écran quitté pendant l'appel : la carte est gardée pour la prochaine fois
  btn.remove();
  zone.innerHTML = carteMentaleHtml(lesson.carte);
  brancherExportCarte(lesson.carte, lesson.titre);
}

// Cours sur mesure : l'IA explique les erreurs du quiz qui vient de se terminer, puis le cours est
// enregistré dans « Mes cours » (partagé avec l'espace parent comme les autres) et affiché.
async function onCoursSurMesure(quizTermine, erreurs, btn) {
  const errorEl = document.getElementById('sur-mesure-error');
  errorEl.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Préparation de ton cours...';
  try {
    const reponse = await callClaudeJSON(
      state.accessCode,
      coursSurMesurePrompt(state.profile.niveau, quizTermine.subject, erreurs),
      { system: 'Tu réponds uniquement en JSON valide, sans texte ni markdown autour.', maxTokens: 6000 }
    );
    const cours = validerCoursSurMesure(reponse);
    if (!cours) throw new Error("réponse de l'IA inutilisable, réessaie");
    const lesson = {
      id: uid(),
      type: 'sur-mesure',
      matiere: quizTermine.subject,
      themeOrigine: quizTermine.theme || null, // le mini-quiz compte pour le même chapitre
      ...cours,
      date: new Date().toISOString()
    };
    state.lessons.push(lesson);
    enregistrerEtPartager();
    renderLessonDetail(lesson);
  } catch (err) {
    errorEl.textContent = `Erreur : ${err.message}`;
    btn.disabled = false;
    btn.textContent = '✨ Mon cours sur mesure';
  }
}

// Lance le mini-quiz d'un cours sur mesure (construit par quizDuCoursSurMesure, cours.js).
function lancerMiniQuiz(lesson) {
  const quiz = quizDuCoursSurMesure(lesson);
  state.quizzes.push(quiz);
  saveState(state);
  startQuiz(quiz);
}

// Génère avec l'IA un quiz de révision sur un cours enregistré, au niveau de difficulté choisi.
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
      questions: questionsDepuisIA(parsed.questions)
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
      ${enTete('Corriger un exercice', '', 'exercice')}
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
      date: now,
      enonce: ex.enonce,
      reponseDonnee: ex.reponseEleve,
      bonneReponse: null
    });
  });
  enregistrerEtPartager();

  const allCorrect = result.exercices.every(ex => ex.statut === 'correct');

  app.innerHTML = correctionHtml(result, imageDataUrls);

  document.getElementById('back-home').addEventListener('click', renderHome);
  if (allCorrect) fireConfetti();
}

render();
