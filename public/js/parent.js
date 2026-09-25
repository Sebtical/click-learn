function renderParentGate() {
  const hasCode = !!state.parentAuth.code;
  app.innerHTML = `
    <div class="card pinbox">
      <h1>👪 Espace parent</h1>
      <p class="subtitle">${hasCode ? 'Entre le code à 4 chiffres.' : 'Crée un code à 4 chiffres pour protéger cet espace.'}</p>
      <form id="pin-form">
        <input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" id="pin-input" placeholder="••••" autofocus>
        <button type="submit">${hasCode ? 'Valider' : 'Créer'}</button>
      </form>
      <p id="pin-error" class="error"></p>
      <button id="pin-cancel" class="link">Retour</button>
    </div>
  `;

  document.getElementById('pin-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const value = document.getElementById('pin-input').value.trim();
    const errorEl = document.getElementById('pin-error');

    if (!/^\d{4}$/.test(value)) {
      errorEl.textContent = 'Le code doit contenir exactement 4 chiffres.';
      return;
    }

    if (hasCode) {
      if (value === state.parentAuth.code) {
        renderParentDashboard();
      } else {
        errorEl.textContent = 'Code incorrect.';
      }
    } else {
      state.parentAuth.code = value;
      saveState(state);
      renderParentDashboard();
    }
  });

  document.getElementById('pin-cancel').addEventListener('click', renderHome);
}

function computeSubjectAndNotionStats() {
  const bySubject = {};
  const byNotion = {};

  state.attempts.forEach(a => {
    bySubject[a.subject] = bySubject[a.subject] || { total: 0, correct: 0 };
    bySubject[a.subject].total++;
    if (a.correct) bySubject[a.subject].correct++;

    const key = a.notion || '(non précisé)';
    byNotion[key] = byNotion[key] || { total: 0, correct: 0 };
    byNotion[key].total++;
    if (a.correct) byNotion[key].correct++;
  });

  return { bySubject, byNotion };
}

function renderParentDashboard() {
  const attempts = state.attempts;
  const total = attempts.length;
  const correct = attempts.filter(a => a.correct).length;
  const pct = total ? Math.round((correct / total) * 100) : null;
  const { bySubject, byNotion } = computeSubjectAndNotionStats();

  const subjectRows = Object.entries(bySubject).map(([s, v]) => {
    const p = Math.round((v.correct / v.total) * 100);
    return `<li><span>${s}</span><span>${v.correct}/${v.total} (${p}%)</span></li>`;
  }).join('');

  const notionEntries = Object.entries(byNotion).map(([notion, v]) => ({
    notion, ...v, pct: Math.round((v.correct / v.total) * 100)
  }));
  const weak = notionEntries.filter(n => n.correct < n.total).sort((a, b) => a.pct - b.pct).slice(0, 5);
  const strong = notionEntries.filter(n => n.pct === 100).sort((a, b) => b.total - a.total).slice(0, 5);

  const quizzesById = {};
  attempts.forEach(a => {
    const q = quizzesById[a.quizId] || { subject: a.subject, total: 0, correct: 0, date: a.date };
    q.total++;
    if (a.correct) q.correct++;
    if (a.date > q.date) q.date = a.date;
    quizzesById[a.quizId] = q;
  });
  const history = Object.values(quizzesById).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);

  app.innerHTML = `
    <div class="card card-wide">
      <h1>👪 Espace parent</h1>
      <p class="subtitle">Suivi de ${state.profile.prenom} — niveau ${state.profile.niveau}</p>

      <div class="kpis">
        <div class="kpi"><b>${state.lessons.length}</b><span>Cours ajoutés</span></div>
        <div class="kpi"><b>${state.quizzes.length}</b><span>Quiz générés</span></div>
        <div class="kpi"><b>${total}</b><span>Questions répondues</span></div>
        <div class="kpi"><b>${pct !== null ? pct + '%' : '—'}</b><span>Taux de réussite</span></div>
      </div>

      ${subjectRows ? `
      <div class="parent-section">
        <h3>Par matière</h3>
        <ul class="notion-list">${subjectRows}</ul>
      </div>` : ''}

      <div class="parent-section">
        <h3>🔴 Points à retravailler</h3>
        ${weak.length
          ? `<ul class="notion-list weak">${weak.map(n => `<li><span>${n.notion}</span><span>${n.correct}/${n.total}</span></li>`).join('')}</ul>`
          : '<p class="subtitle">Pas encore assez de données.</p>'}
      </div>

      <div class="parent-section">
        <h3>🟢 Points forts</h3>
        ${strong.length
          ? `<ul class="notion-list strong">${strong.map(n => `<li><span>${n.notion}</span><span>${n.correct}/${n.total}</span></li>`).join('')}</ul>`
          : '<p class="subtitle">Pas encore assez de données.</p>'}
      </div>

      <div class="parent-section">
        <h3>Historique récent</h3>
        ${history.length
          ? `<ul class="history-list">${history.map(h => `<li><span>${new Date(h.date).toLocaleDateString('fr-FR')} — ${h.subject}</span><span>${h.correct}/${h.total}</span></li>`).join('')}</ul>`
          : '<p class="subtitle">Aucun quiz effectué pour le moment.</p>'}
      </div>

      <div class="actions">
        <button id="parent-back">Retour à l'accueil</button>
        <button id="parent-reset-code" class="secondary">Changer le code</button>
      </div>
    </div>
  `;

  document.getElementById('parent-back').addEventListener('click', renderHome);
  document.getElementById('parent-reset-code').addEventListener('click', () => {
    state.parentAuth.code = null;
    saveState(state);
    renderParentGate();
  });
}
