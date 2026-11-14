// Écrans des cours et des corrections photo : fabrication du HTML en fonctions pures (testées).
// Règle dure : tout texte venant de l'IA (titre, résumé, notions, corrections) passe par echapperHtml.

// ── Réglages ──
const LONGUEUR_MAX_FICHE = 20000; // caractères gardés d'une fiche détaillée (quelques pages)
const NB_ERREURS_SUR_MESURE = 10; // erreurs envoyées à l'IA pour un cours sur mesure

// ── Outils ──

// Rangée de miniatures des photos prises sur l'appareil.
function miniaturesHtml(imageDataUrls) {
  return `<div class="thumb-row">${imageDataUrls.map(u => `<img class="thumb" src="${echapperHtml(u)}" alt="">`).join('')}</div>`;
}

// Liste de notions lisible (« a, b, c »), échappée ; vide si absente.
function notionsTexte(notions) {
  return echapperHtml(Array.isArray(notions) ? notions.join(', ') : '');
}

// Met en forme un texte rédigé par l'IA : « ## » donne un titre, « - » une liste, **mot** du gras.
// Le texte est échappé AVANT toute mise en forme : aucune balise venue de l'IA ne peut passer.
function texteRicheHtml(texte) {
  const ligneHtml = t => echapperHtml(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  const morceaux = [];
  let liste = [];
  const fermerListe = () => {
    if (liste.length) morceaux.push(`<ul>${liste.join('')}</ul>`);
    liste = [];
  };
  for (const brute of String(texte ?? '').split('\n')) {
    const ligne = brute.trim();
    if (/^[-•*]\s+/.test(ligne)) { liste.push(`<li>${ligneHtml(ligne.replace(/^[-•*]\s+/, ''))}</li>`); continue; }
    fermerListe();
    if (/^#{1,6}\s+/.test(ligne)) morceaux.push(`<h3>${ligneHtml(ligne.replace(/^#{1,6}\s+/, ''))}</h3>`);
    else if (ligne) morceaux.push(`<p>${ligneHtml(ligne)}</p>`);
  }
  fermerListe();
  return morceaux.join('');
}

// Fiche détaillée renvoyée par l'IA : texte non vide, borné ; null sinon.
function lireFiche(valeur) {
  return typeof valeur === 'string' && valeur.trim() ? valeur.trim().slice(0, LONGUEUR_MAX_FICHE) : null;
}

// ── Cours sur mesure : contrôle de ce que renvoie l'IA ──

// Une question du mini-quiz est utilisable : QCM avec une bonne réponse existante, réponse numérique ou fraction.
function questionIAValide(q) {
  if (!q || typeof q.enonce !== 'string' || !q.enonce.trim()) return false;
  if (q.type === 'qcm') {
    return Array.isArray(q.choix) && q.choix.length >= 2 && q.choix.every(c => typeof c === 'string')
      && Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex < q.choix.length;
  }
  if (q.type === 'num') return typeof q.answer === 'number' && Number.isFinite(q.answer);
  if (q.type === 'fraction') return estFractionIA(q.numerateur, q.denominateur);
  return false;
}

// Remet en forme un cours sur mesure ; null s'il n'a aucune explication exploitable.
// Les questions invalides sont écartées, et aucune ne garde de figure (seul HTML affiché tel quel).
function validerCoursSurMesure(objet) {
  if (!objet || typeof objet !== 'object') return null;
  const texte = v => (typeof v === 'string' ? v.trim() : '');
  const explications = (Array.isArray(objet.explications) ? objet.explications : [])
    .filter(e => e && texte(e.methode))
    .map(e => ({ notion: texte(e.notion), erreur: texte(e.erreur), methode: texte(e.methode), exemple: texte(e.exemple) }));
  if (explications.length === 0) return null;
  return {
    titre: texte(objet.titre) || 'Mon cours sur mesure',
    resume: texte(objet.resume),
    notions: (Array.isArray(objet.notions) ? objet.notions : []).filter(n => typeof n === 'string'),
    explications,
    questions: (Array.isArray(objet.questions) ? objet.questions : []).filter(questionIAValide).map(({ fig, ...q }) => q)
  };
}

// Erreurs d'un quiz terminé, au format attendu par coursSurMesurePrompt (les plus anciennes d'abord).
function erreursDuQuiz(resultats) {
  return resultats.filter(r => !r.correct).slice(0, NB_ERREURS_SUR_MESURE)
    .map(r => ({ notion: r.notion, enonce: r.enonce, reponseDonnee: r.reponseDonnee, bonneReponse: r.bonneReponse }));
}

// Mini-quiz d'un cours sur mesure : ses questions (via questionDepuisIA), rattachées au chapitre du quiz d'origine.
function quizDuCoursSurMesure(cours) {
  return {
    id: uid(),
    lessonId: cours.id,
    theme: cours.themeOrigine || null,
    subject: cours.matiere,
    difficulty: 'sur-mesure',
    createdAt: new Date().toISOString(),
    questions: questionsDepuisIA(cours.questions)
  };
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

// Fiche détaillée d'un cours, avec la mention de sa source quand elle ne vient pas de la photo.
function ficheDetailleeHtml(cours) {
  const mention = cours.ficheSource === 'resume'
    ? '<p class="subtitle">Rédigé à partir du résumé de ton cours, pas de ta photo : ton cahier fait foi.</p>'
    : '';
  return `<section class="fiche-detail">${mention}${texteRicheHtml(cours.fiche)}</section>`;
}

// Explications d'un cours sur mesure : pour chaque notion, l'erreur, la méthode et un exemple corrigé.
function explicationsHtml(explications) {
  return explications.map(e => `
    <section class="explication">
      <h3>${echapperHtml(e.notion || 'À revoir')}</h3>
      ${e.erreur ? `<p class="hint"><strong>Ce qui n'allait pas :</strong> ${echapperHtml(e.erreur)}</p>` : ''}
      <p><strong>La méthode</strong></p>${texteRicheHtml(e.methode)}
      ${e.exemple ? `<p><strong>Exemple corrigé</strong></p>${texteRicheHtml(e.exemple)}` : ''}
    </section>`).join('');
}

// Fiche d'un cours enregistré : en-tête illustré, résumé, notions, détails (ou explications pour un
// cours sur mesure), puis choix du niveau du quiz de révision.
function ficheCoursHtml(cours, difficultes) {
  const surMesure = cours.type === 'sur-mesure';
  const etiquette = surMesure ? `${echapperHtml(cours.matiere)} · cours sur mesure` : echapperHtml(cours.matiere);
  return `
    <div class="card card-wide">
      ${enTete(echapperHtml(cours.titre), `<span class="tag">${etiquette}</span>`, cours.matiere)}
      <p>${echapperHtml(cours.resume)}</p>
      <p><strong>Notions :</strong> ${notionsTexte(cours.notions)}</p>
      <button id="carte-btn" class="secondary">🧠 Carte mentale</button>
      <div id="carte-zone"></div>
      ${surMesure
        ? `${explicationsHtml(cours.explications || [])}
           ${cours.questions?.length ? `<button id="mini-quiz-btn">✅ Vérifier que j'ai compris</button>` : ''}`
        : `<button id="fiche-btn" class="secondary">📖 Plus de détails</button>
           <div id="fiche-detail"></div>`}
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
