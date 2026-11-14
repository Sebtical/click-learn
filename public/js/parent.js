// Espace parent : suivi de l'enfant lu depuis le serveur (/api/parent/suivi), réservé aux codes parents.
// Tout texte venant de la base passe par echapperHtml avant d'être affiché.

// ── Réglages ──
const NB_ERREURS_AFFICHEES = 20;
const NB_QUIZ_HISTORIQUE = 10;

// ── Chargement ──

// Affiche l'écran d'attente, charge le suivi depuis le serveur, puis l'affiche (ou l'erreur).
async function renderParentDashboard() {
  app.innerHTML = `
    <div class="card card-wide">
      <h1>👪 Espace parent</h1>
      <div class="busy"><p>Chargement du suivi...</p></div>
    </div>`;
  try {
    afficherSuivi(await chargerSuivi(state.accessCode));
  } catch (err) {
    app.innerHTML = `
      <div class="card card-wide">
        <h1>👪 Espace parent</h1>
        <p class="error">Impossible de charger le suivi : ${echapperHtml(err.message)}</p>
        <div class="actions">
          <button id="parent-retry">Réessayer</button>
          <button id="parent-back" class="secondary">Retour à l'accueil</button>
        </div>
      </div>`;
    document.getElementById('parent-retry').addEventListener('click', renderParentDashboard);
    document.getElementById('parent-back').addEventListener('click', renderHome);
  }
}

// ── Calculs ──

// Nom lisible d'un chapitre : titre du thème pour Maths/Français, titre tel quel pour les autres matières.
function libelleChapitre(matiere, theme) {
  if (!theme) return 'Cours photo et exercices';
  if (isLocalSubject(matiere)) return localThemes(matiere).find(t => t.id === theme)?.titre ?? theme;
  return theme;
}

// Regroupe les réponses selon une clé et compte total / justes pour chaque groupe
// (la matière de la première réponse du groupe est gardée, utile pour l'historique des quiz).
function regrouper(tentatives, cle) {
  const groupes = new Map();
  tentatives.forEach(t => {
    const k = cle(t);
    const g = groupes.get(k) || { total: 0, justes: 0, derniere: t.date, matiere: t.matiere };
    g.total++;
    if (t.correct) g.justes++;
    if (t.date > g.derniere) g.derniere = t.date;
    groupes.set(k, g);
  });
  return [...groupes.entries()].map(([k, g]) => ({ cle: k, ...g, pct: pourcentage(g.justes, g.total) }));
}

// Date courte en français, ou tiret si la date est illisible.
function dateCourte(iso) {
  const d = new Date(iso);
  return isNaN(d) ? '—' : d.toLocaleDateString('fr-FR');
}

// ── Affichage ──

// Construit l'écran de suivi à partir des données du serveur.
function afficherSuivi({ profil, tentatives, nbCours, cours = [], tronque }) {
  // Aucune donnée partagée : on explique comment démarrer
  if (!profil && tentatives.length === 0) {
    app.innerHTML = `
      <div class="card card-wide">
        <h1>👪 Espace parent</h1>
        <p>Aucun résultat partagé pour l'instant.</p>
        <p class="subtitle">Ouvre l'appli sur l'appareil de ton enfant, avec son code : elle lui proposera de partager ses résultats.</p>
        <div class="actions"><button id="parent-back">Retour à l'accueil</button></div>
      </div>`;
    document.getElementById('parent-back').addEventListener('click', renderHome);
    return;
  }

  // Indicateurs généraux
  const total = tentatives.length;
  const justes = tentatives.filter(t => t.correct).length;
  const pct = total ? pourcentage(justes, total) : null;
  const nbQuiz = new Set(tentatives.map(t => t.quiz_id || t.id)).size;
  const derniere = tentatives[0]?.date; // le serveur renvoie la plus récente en premier

  // Regroupements : matière, chapitre, notion, quiz
  const parMatiere = regrouper(tentatives, t => t.matiere || 'Autre').sort((a, b) => a.cle.localeCompare(b.cle));
  const parChapitre = regrouper(tentatives, t => `${t.matiere || 'Autre'}|${t.theme || ''}`)
    .sort((a, b) => a.cle.localeCompare(b.cle) || a.pct - b.pct);
  const aRetravailler = regrouper(tentatives, t => t.notion || '(non précisé)')
    .filter(n => n.justes < n.total).sort((a, b) => a.pct - b.pct).slice(0, 5);
  const historique = regrouper(tentatives, t => t.quiz_id || t.id)
    .sort((a, b) => b.derniere.localeCompare(a.derniere)).slice(0, NB_QUIZ_HISTORIQUE);
  const erreurs = tentatives.filter(t => !t.correct).slice(0, NB_ERREURS_AFFICHEES);

  // Gabarits des listes
  const lignesMatieres = parMatiere.map(m =>
    `<li><span>${echapperHtml(m.cle)}</span><span>${m.justes}/${m.total} (${m.pct}%)</span></li>`).join('');
  const lignesChapitres = parChapitre.map(c => {
    const [matiere, theme] = c.cle.split('|');
    return `<li><span>${echapperHtml(matiere)} — ${echapperHtml(libelleChapitre(matiere, theme))}</span><span>${masteryBadge(c.pct)} <small>${c.total} q.</small></span></li>`;
  }).join('');
  const lignesFaibles = aRetravailler.map(n =>
    `<li><span>${echapperHtml(n.cle)}</span><span>${n.justes}/${n.total}</span></li>`).join('');
  const lignesErreurs = erreurs.map(t => `
    <li class="exercise-item">
      <p class="subtitle">${dateCourte(t.date)} — ${echapperHtml(t.matiere)} — ${echapperHtml(t.notion)}</p>
      <p class="ex-statement">🔴 ${echapperHtml(t.enonce || '(énoncé non conservé)')}</p>
      <p class="hint">Sa réponse : <strong>${t.reponse_donnee ? echapperHtml(t.reponse_donnee) : '<em>non conservée</em>'}</strong>
        ${t.bonne_reponse ? `<br>Bonne réponse : <strong>${echapperHtml(t.bonne_reponse)}</strong>` : ''}</p>
    </li>`).join('');
  const lignesCours = cours.map(c => `
    <li class="exercise-item">
      <p class="subtitle">${dateCourte(c.date)} — ${echapperHtml(c.matiere || 'Cours')}</p>
      <p class="ex-statement">📚 ${echapperHtml(c.titre || '(sans titre)')}</p>
      ${c.resume ? `<p>${echapperHtml(c.resume)}</p>` : ''}
      ${c.notions?.length ? `<p class="hint">Notions : ${echapperHtml(c.notions.join(', '))}</p>` : ''}
    </li>`).join('');
  const lignesHistorique = historique.map(h =>
    `<li><span>${dateCourte(h.derniere)} — ${echapperHtml(h.matiere)}</span><span>${h.justes}/${h.total}</span></li>`).join('');

  // Page complète
  app.innerHTML = `
    <div class="card card-wide">
      <h1>👪 Espace parent</h1>
      <p class="subtitle">Suivi de ${echapperHtml(profil?.prenom || 'ton enfant')}${profil?.niveau ? ` — niveau ${echapperHtml(profil.niveau)}` : ''}
        ${derniere ? `<br>Dernière activité : ${dateCourte(derniere)}` : ''}
        ${tronque ? `<br>Chiffres calculés sur les ${fmtNum(total)} dernières réponses.` : ''}</p>

      <div class="kpis">
        <div class="kpi"><b>${nbCours}</b><span>Cours ajoutés</span></div>
        <div class="kpi"><b>${nbQuiz}</b><span>Quiz faits</span></div>
        <div class="kpi"><b>${total}</b><span>Questions répondues</span></div>
        <div class="kpi"><b>${pct !== null ? pct + '%' : '—'}</b><span>Réussite du 1er coup</span></div>
      </div>

      ${lignesMatieres ? `<div class="parent-section"><h3>Par matière</h3><ul class="notion-list">${lignesMatieres}</ul></div>` : ''}

      ${lignesChapitres ? `<div class="parent-section"><h3>Maîtrise par chapitre</h3><ul class="notion-list">${lignesChapitres}</ul></div>` : ''}

      <div class="parent-section">
        <h3>🔴 Points à retravailler</h3>
        ${lignesFaibles ? `<ul class="notion-list weak">${lignesFaibles}</ul>` : '<p class="subtitle">Pas encore assez de données.</p>'}
      </div>

      <div class="parent-section">
        <h3>Dernières réponses fausses</h3>
        ${lignesErreurs ? `<ul class="exercise-list">${lignesErreurs}</ul>` : '<p class="subtitle">Aucune erreur pour le moment. 🎉</p>'}
      </div>

      <div class="parent-section">
        <h3>📚 Ses derniers cours</h3>
        ${lignesCours ? `<ul class="exercise-list">${lignesCours}</ul>` : '<p class="subtitle">Aucun cours ajouté pour le moment.</p>'}
      </div>

      <div class="parent-section">
        <h3>Historique récent</h3>
        ${lignesHistorique ? `<ul class="history-list">${lignesHistorique}</ul>` : '<p class="subtitle">Aucun quiz effectué pour le moment.</p>'}
      </div>

      <div class="actions">
        <button id="parent-back">Retour à l'accueil</button>
      </div>
    </div>`;

  document.getElementById('parent-back').addEventListener('click', renderHome);
}
