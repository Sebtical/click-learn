// Écrans des cours et des corrections photo : fabrication du HTML en fonctions pures (testées).
// Règle dure : tout texte venant de l'IA (titre, résumé, notions, corrections) passe par echapperHtml.

// ── Outils ──

// Rangée de miniatures des photos prises sur l'appareil.
function miniaturesHtml(imageDataUrls) {
  return `<div class="thumb-row">${imageDataUrls.map(u => `<img class="thumb" src="${echapperHtml(u)}" alt="">`).join('')}</div>`;
}

// Liste de notions lisible (« a, b, c »), échappée ; vide si absente.
function notionsTexte(notions) {
  return echapperHtml(Array.isArray(notions) ? notions.join(', ') : '');
}

// ── Cours photographié : vérification avant enregistrement ──

// Écran « Vérifie les infos » : matière (liste fermée), titre modifiable, résumé et notions lus par l'IA.
function apercuCoursHtml(extrait, imageDataUrls, matieres) {
  return `
    <div class="card card-wide">
      <h1>Vérifie les infos</h1>
      ${miniaturesHtml(imageDataUrls)}
      <label>
        Matière
        <select id="matiere">
          ${matieres.map(m => `<option ${m === extrait.matiere ? 'selected' : ''}>${echapperHtml(m)}</option>`).join('')}
        </select>
      </label>
      <label>
        Titre
        <input id="titre" value="${echapperHtml(extrait.titre)}">
      </label>
      <p><strong>Résumé :</strong> ${echapperHtml(extrait.resume)}</p>
      <p><strong>Notions :</strong> ${notionsTexte(extrait.notions)}</p>
      <div class="actions">
        <button id="save-lesson-btn">Enregistrer</button>
        <button id="cancel-btn" class="secondary">Annuler</button>
      </div>
    </div>
  `;
}

// ── Fiche d'un cours ──

// Fiche d'un cours enregistré : en-tête illustré, résumé, notions, puis choix du niveau du quiz de révision.
function ficheCoursHtml(cours, difficultes) {
  return `
    <div class="card card-wide">
      ${enTete(echapperHtml(cours.titre), `<span class="tag">${echapperHtml(cours.matiere)}</span>`, cours.matiere)}
      <p>${echapperHtml(cours.resume)}</p>
      <p><strong>Notions :</strong> ${notionsTexte(cours.notions)}</p>
      <h2>Générer un parcours de révision</h2>
      <div class="actions" id="difficulty-choice">
        ${difficultes.map(d => `<button class="difficulty-btn" data-id="${d.id}" data-label="${echapperHtml(d.label)}">${echapperHtml(d.label)}</button>`).join('')}
      </div>
      <p id="quiz-error" class="error"></p>
      <button id="back-home" class="secondary">Retour à l'accueil</button>
    </div>
  `;
}

// ── Correction d'un exercice photographié ──

// Écran de correction : pour chaque question, statut, énoncé, réponse de l'élève et commentaire de l'IA.
function correctionHtml(resultat, imageDataUrls) {
  const pastille = { correct: '✅', partiel: '🟡' };
  const items = resultat.exercices.map(ex => `
    <li class="exercise-item">
      <p class="ex-statement">${pastille[ex.statut] || '🔴'} ${echapperHtml(ex.enonce)}</p>
      <p class="subtitle">Ta réponse : ${echapperHtml(ex.reponseEleve)}</p>
      <p class="${ex.statut === 'correct' ? 'ok' : 'hint'}">${echapperHtml(ex.feedback)}</p>
    </li>`).join('');

  return `
    <div class="card card-wide">
      <div class="hello">
        ${mascotSVG(64)}
        <div>
          <h1>Correction</h1>
          <p class="tag">${echapperHtml(resultat.matiere)}</p>
        </div>
      </div>
      ${miniaturesHtml(imageDataUrls)}
      <ul class="exercise-list">${items}</ul>
      <button id="back-home">Retour à l'accueil</button>
    </div>
  `;
}
