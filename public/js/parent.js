// Espace parent : suivi de l'enfant lu depuis le serveur (/api/parent/suivi), réservé aux codes parents.
// Tout texte venant de la base passe par echapperHtml avant d'être affiché.

// ── Réglages ──
const NB_ERREURS_AFFICHEES = 20;
const NB_QUIZ_HISTORIQUE = 10;
const e = echapperHtml; // raccourci de lecture pour les gabarits ci-dessous

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
        <p class="error">Impossible de charger le suivi : ${e(err.message)}</p>
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

// Regroupe les réponses selon une clé et compte total / justes pour chaque groupe.
function regrouper(tentatives, cle) {
  const groupes = new Map();
  tentatives.forEach(t => {
    const k = cle(t);
    const g = groupes.get(k) || { total: 0, justes: 0, derniere: t.date };
    g.total++;
    if (t.correct) g.justes++;
    if (t.date > g.derniere) g.derniere = t.date;
    groupes.set(k, g);
  });
  return [...groupes.entries()].map(([k, g]) => ({ cle: k, ...g, pct: Math.round((g.justes / g.total) * 100) }));
}

// Date courte en français, ou tiret si la date est illisible.
function dateCourte(iso) {
  const d = new Date(iso);
  return isNaN(d) ? '—' : d.toLocaleDateString('fr-FR');
}

// ── Affichage ──

// Construit l'écran de suivi à partir des données du serveur.
function afficherSuivi({ profil, tentatives, nbCours }) {
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
  const pct = total ? Math.round((justes / total) * 100) : null;
  const derniere = tentatives[0]?.date; // le serveur renvoie la plus récente en premier

  // Regroupements : matière, chapitre, notion, quiz
  const parMatiere = regrouper(tentatives, t => t.matiere || 'Autre').sort((a, b) => a.cle.localeCompare(b.cle));
  const parChapitre = regrouper(tentatives, t => `${t.matiere || 'Autre'}|${t.theme || ''}`)
    .sort((a, b) => a.cle.localeCompare(b.cle) || a.pct - b.pct);
  const aRetravailler = regrouper(tentatives, t => t.notion || '(non précisé)')
    .filter(n => n.justes < n.total).sort((a, b) => a.pct - b.pct).slice(0, 5);
  const historique = regrouper(tentatives, t => t.quiz_id || t.id)
    .sort((a, b) => b.derniere.localeCompare(a.derniere)).slice(0, NB_QUIZ_HISTORIQUE);
  const matiereDuQuiz = new Map(tentatives.map(t => [t.quiz_id || t.id, t.matiere]));
  const erreurs = tentatives.filter(t => !t.correct).slice(0, NB_ERREURS_AFFICHEES);

  // Gabarits des listes
  const lignesMatieres = parMatiere.map(m =>
    `<li><span>${e(m.cle)}</span><span>${m.justes}/${m.total} (${m.pct}%)</span></li>`).join('');
  const lignesChapitres = parChapitre.map(c => {
    const [matiere, theme] = c.cle.split('|');
    return `<li><span>${e(matiere)} — ${e(libelleChapitre(matiere, theme))}</span><span>${masteryBadge(c.pct)} <small>${c.total} q.</small></span></li>`;
  }).join('');
  const lignesFaibles = aRetravailler.map(n =>
    `<li><span>${e(n.cle)}</span><span>${n.justes}/${n.total}</span></li>`).join('');
  const lignesErreurs = erreurs.map(t => `
    <li class="exercise-item">
      <p class="subtitle">${dateCourte(t.date)} — ${e(t.matiere)} — ${e(t.notion)}</p>
      <p class="ex-statement">🔴 ${e(t.enonce || '(énoncé non conservé)')}</p>
      <p class="hint">Sa réponse : <strong>${t.reponse_donnee ? e(t.reponse_donnee) : '<em>non conservée</em>'}</strong>
        ${t.bonne_reponse ? `<br>Bonne réponse : <strong>${e(t.bonne_reponse)}</strong>` : ''}</p>
    </li>`).join('');
  const lignesHistorique = historique.map(h =>
    `<li><span>${dateCourte(h.derniere)} — ${e(matiereDuQuiz.get(h.cle))}</span><span>${h.justes}/${h.total}</span></li>`).join('');

  // Page complète
  app.innerHTML = `
    <div class="card card-wide">
      <h1>👪 Espace parent</h1>
      <p class="subtitle">Suivi de ${e(profil?.prenom || 'ton enfant')}${profil?.niveau ? ` — niveau ${e(profil.niveau)}` : ''}
        ${derniere ? `<br>Dernière activité : ${dateCourte(derniere)}` : ''}</p>

      <div class="kpis">
        <div class="kpi"><b>${nbCours}</b><span>Cours ajoutés</span></div>
        <div class="kpi"><b>${historique.length < NB_QUIZ_HISTORIQUE ? historique.length : NB_QUIZ_HISTORIQUE + '+'}</b><span>Quiz faits</span></div>
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
        <h3>Historique récent</h3>
        ${lignesHistorique ? `<ul class="history-list">${lignesHistorique}</ul>` : '<p class="subtitle">Aucun quiz effectué pour le moment.</p>'}
      </div>

      <div class="actions">
        <button id="parent-back">Retour à l'accueil</button>
      </div>
    </div>`;

  document.getElementById('parent-back').addEventListener('click', renderHome);
}
