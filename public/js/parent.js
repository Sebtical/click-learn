// Accueil et espace parent : tableau de bord de l'enfant en onglets (Vue d'ensemble · Cours · Erreurs ·
// Progression · Défis), lu depuis le serveur et réservé aux codes parents.
// Règle dure : tout texte venant de la base passe par echapperHtml avant d'être affiché.

// ── Réglages ──
const NB_ERREURS_AFFICHEES = 20;
const NB_QUIZ_HISTORIQUE = 10;
const ONGLETS_PARENT = [
  ['ensemble', "Vue d'ensemble"], ['cours', 'Cours'], ['erreurs', 'Erreurs'], ['progression', 'Progression'], ['defis', 'Défis']
];

const SUIVI_FRAIS_MS = 2 * 60 * 1000; // au-delà, revenir à l'accueil recharge le suivi

// Suivi gardé en mémoire (évite de le recharger à chaque onglet ou retour à l'accueil).
let suiviParent = null;
let suiviChargeLe = 0;

// ── Calculs (fonctions pures, testées) ──

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

// Activité des 7 derniers jours : questions, réussite du premier coup, quiz.
function activiteSemaine(tentatives, maintenant = new Date()) {
  const depuis = new Date(maintenant.getTime() - 7 * 24 * 3600 * 1000).toISOString();
  const semaine = tentatives.filter(t => t.date >= depuis);
  const justes = semaine.filter(t => t.correct).length;
  return {
    questions: semaine.length,
    pct: semaine.length ? pourcentage(justes, semaine.length) : null,
    quiz: new Set(semaine.map(t => t.quiz_id || t.id)).size
  };
}

// ── Gabarits des onglets (fonctions pures, testées) ──

// Barre d'onglets, l'onglet actif mis en avant.
function ongletsParentHtml(actif) {
  return `<nav class="onglets" role="tablist">${ONGLETS_PARENT.map(([id, libelle]) =>
    `<button class="onglet${id === actif ? ' actif' : ''}" role="tab" aria-selected="${id === actif}" data-onglet="${id}">${libelle}</button>`).join('')}</nav>`;
}

// Ligne d'un cours (titre, résumé, notions) avec les boutons de son contenu, chargé au clic.
function ligneCoursHtml(c) {
  return `
    <li class="exercise-item">
      <p class="subtitle">${dateCourte(c.date)} — ${echapperHtml(c.matiere || 'Cours')}${c.type === 'sur-mesure' ? ' · cours sur mesure' : ''}</p>
      <p class="ex-statement">📚 ${echapperHtml(c.titre || '(sans titre)')}</p>
      ${c.resume ? `<p>${echapperHtml(c.resume)}</p>` : ''}
      ${c.notions?.length ? `<p class="hint">Notions : ${echapperHtml(c.notions.join(', '))}</p>` : ''}
      ${boutonsContenuCours(c)}
      <div class="cours-contenu" data-contenu="${echapperHtml(c.id)}"></div>
    </li>`;
}

// Boutons d'un cours selon ce que l'enfant a créé : fiche, explications (cours sur mesure), carte mentale.
function boutonsContenuCours(c) {
  const boutons = [];
  if (c.a_fiche) boutons.push(['fiche', '📖 Voir la fiche']);
  if (c.a_explications) boutons.push(['explications', '✨ Voir les explications']);
  if (c.a_carte) boutons.push(['carte', '🧠 Voir la carte mentale']);
  return boutons.length
    ? `<div class="actions">${boutons.map(([vue, libelle]) => `<button class="secondary voir-contenu" data-cours="${echapperHtml(c.id)}" data-vue="${vue}">${libelle}</button>`).join('')}</div>`
    : '';
}

// Contenu affiché sous un cours : fiche détaillée, explications d'un cours sur mesure ou carte mentale.
// Tout passe par les gabarits de cours.js et carte.js, qui échappent les textes.
function contenuCoursHtml(contenu, vue) {
  if (vue === 'fiche') return contenu.fiche ? ficheDetailleeHtml({ fiche: contenu.fiche }) : '';
  if (vue === 'explications') return explicationsHtml(Array.isArray(contenu.explications) ? contenu.explications : []);
  const carte = validerCarteMentale(contenu.carte);
  return carte ? carteMentaleHtml(carte) : '<p class="subtitle">Carte illisible.</p>';
}

// Notions les moins réussies (au plus n), en lignes de liste prêtes à afficher.
function pointsFaiblesHtml(tentatives, n) {
  return regrouper(tentatives, t => t.notion || '(non précisé)')
    .filter(x => x.justes < x.total).sort((a, b) => a.pct - b.pct).slice(0, n)
    .map(x => `<li><span>${echapperHtml(x.cle)}</span><span>${x.justes}/${x.total}</span></li>`);
}

// Vue d'ensemble : activité de la semaine, défis en attente, derniers cours, points à retravailler.
function ensembleHtml(suivi) {
  const { tentatives, cours = [], nbCours } = suivi;
  const semaine = activiteSemaine(tentatives);
  const faibles = pointsFaiblesHtml(tentatives, 3);
  return `
    <div class="kpis">
      <div class="kpi"><b>${semaine.questions}</b><span>Questions cette semaine</span></div>
      <div class="kpi"><b>${semaine.pct !== null ? semaine.pct + '%' : '—'}</b><span>Réussite du 1er coup</span></div>
      <div class="kpi"><b>${semaine.quiz}</b><span>Quiz cette semaine</span></div>
      <div class="kpi"><b>${nbCours}</b><span>Cours ajoutés</span></div>
    </div>
    <div id="bandeau-defis"></div>
    <div class="parent-section">
      <h3>📚 Ses derniers cours</h3>
      ${cours.length ? `<ul class="exercise-list">${cours.slice(0, 3).map(ligneCoursHtml).join('')}</ul>
        <button class="secondary" data-onglet="cours">Tous ses cours →</button>` : '<p class="subtitle">Aucun cours ajouté pour le moment.</p>'}
    </div>
    <div class="parent-section">
      <h3>🔴 Points à retravailler</h3>
      ${faibles.length ? `<ul class="notion-list weak">${faibles.join('')}</ul>` : '<p class="subtitle">Pas encore assez de données.</p>'}
    </div>`;
}

// Erreurs : dernières réponses fausses, avec sa réponse et la bonne.
function erreursHtml(tentatives) {
  const erreurs = tentatives.filter(t => !t.correct).slice(0, NB_ERREURS_AFFICHEES);
  if (!erreurs.length) return '<p class="subtitle">Aucune erreur pour le moment. 🎉</p>';
  return `<ul class="exercise-list">${erreurs.map(t => `
    <li class="exercise-item">
      <p class="subtitle">${dateCourte(t.date)} — ${echapperHtml(t.matiere)} — ${echapperHtml(t.notion)}</p>
      <p class="ex-statement">🔴 ${echapperHtml(t.enonce || '(énoncé non conservé)')}</p>
      <p class="hint">Sa réponse : <strong>${t.reponse_donnee ? echapperHtml(t.reponse_donnee) : '<em>non conservée</em>'}</strong>
        ${t.bonne_reponse ? `<br>Bonne réponse : <strong>${echapperHtml(t.bonne_reponse)}</strong>` : ''}</p>
    </li>`).join('')}</ul>`;
}

// Progression : par matière, maîtrise par chapitre, points faibles et historique des quiz.
function progressionHtml(tentatives, tronque) {
  const parMatiere = regrouper(tentatives, t => t.matiere || 'Autre').sort((a, b) => a.cle.localeCompare(b.cle));
  const parChapitre = regrouper(tentatives, t => `${t.matiere || 'Autre'}|${t.theme || ''}`)
    .sort((a, b) => a.cle.localeCompare(b.cle) || a.pct - b.pct);
  const historique = regrouper(tentatives, t => t.quiz_id || t.id)
    .sort((a, b) => b.derniere.localeCompare(a.derniere)).slice(0, NB_QUIZ_HISTORIQUE);
  const liste = (titre, lignes, classe = 'notion-list') => lignes.length
    ? `<div class="parent-section"><h3>${titre}</h3><ul class="${classe}">${lignes.join('')}</ul></div>` : '';
  return `
    ${tronque ? `<p class="subtitle">Chiffres calculés sur les ${fmtNum(tentatives.length)} dernières réponses.</p>` : ''}
    ${liste('Par matière', parMatiere.map(m => `<li><span>${echapperHtml(m.cle)}</span><span>${m.justes}/${m.total} (${m.pct}%)</span></li>`))}
    ${liste('Maîtrise par chapitre', parChapitre.map(c => {
      const [matiere, theme] = c.cle.split('|');
      return `<li><span>${echapperHtml(matiere)} — ${echapperHtml(libelleChapitre(matiere, theme))}</span><span>${masteryBadge(c.pct)} <small>${c.total} q.</small></span></li>`;
    }))}
    ${liste('🔴 Points à retravailler', pointsFaiblesHtml(tentatives, 5), 'notion-list weak')}
    ${liste('Historique récent', historique.map(h => `<li><span>${dateCourte(h.derniere)} — ${echapperHtml(h.matiere)}</span><span>${h.justes}/${h.total}</span></li>`), 'history-list')}
    ${!tentatives.length ? '<p class="subtitle">Aucun quiz effectué pour le moment.</p>' : ''}`;
}

// ── Écrans ──

// Accueil parent : en-tête de l'enfant, onglets, contenu de l'onglet choisi (Vue d'ensemble par défaut).
// Le suivi (jusqu'à 5 000 réponses) n'est rechargé que s'il est demandé ou a plus de 2 minutes.
async function renderParentDashboard(onglet = 'ensemble', recharger = true) {
  if (recharger || !suiviParent || Date.now() - suiviChargeLe > SUIVI_FRAIS_MS) {
    app.innerHTML = `<div class="card card-wide"><h1>👪 Suivi</h1><div class="busy"><p>Chargement du suivi...</p></div></div>`;
    try {
      suiviParent = await chargerSuivi(state.accessCode);
      suiviChargeLe = Date.now();
    } catch (err) {
      app.innerHTML = `<div class="card card-wide"><h1>👪 Suivi</h1>
        <p class="error">Impossible de charger le suivi : ${echapperHtml(err.message)}</p>
        <div class="actions"><button id="parent-retry">Réessayer</button><button id="edit-config" class="secondary">Modifier la configuration</button></div></div>`;
      document.getElementById('parent-retry').addEventListener('click', () => renderParentDashboard());
      document.getElementById('edit-config').addEventListener('click', renderSetup);
      return;
    }
  }
  const { profil } = suiviParent;
  const derniere = suiviParent.tentatives[0]?.date;
  app.innerHTML = `
    <div class="card card-wide">
      <header class="home-head">
        <div>
          <h1>Suivi de ${echapperHtml(profil?.prenom || 'ton enfant')}</h1>
          <p class="subtitle">${profil?.niveau ? `${echapperHtml(profil.niveau)} · ` : ''}${derniere ? `dernière activité le ${dateCourte(derniere)}` : 'pas encore d\'activité partagée'}</p>
        </div>
      </header>
      ${carteNotificationsHtml()}
      ${ongletsParentHtml(onglet)}
      <div id="onglet-contenu"></div>
      <div class="home-foot"><button id="edit-config" class="link">Modifier la configuration</button></div>
    </div>`;
  document.querySelectorAll('.onglets [data-onglet]').forEach(b => b.addEventListener('click', () => renderParentDashboard(b.dataset.onglet, false)));
  document.getElementById('edit-config').addEventListener('click', renderSetup);
  brancherNotificationsAccueil();
  // Onglet choisi rendu visible dans la barre (sur iPhone, « Progression » et « Défis » dépassent à droite)
  const actif = document.querySelector('.onglet.actif');
  if (actif) actif.parentElement.scrollLeft = actif.offsetLeft - actif.parentElement.offsetLeft - 8;
  afficherOnglet(onglet);
}

// Remplit la zone de l'onglet choisi et branche ses boutons.
async function afficherOnglet(onglet) {
  const zone = document.getElementById('onglet-contenu');
  const { tentatives, tronque } = suiviParent;
  if (onglet === 'ensemble') {
    zone.innerHTML = ensembleHtml(suiviParent);
    zone.querySelectorAll('[data-onglet]').forEach(b => b.addEventListener('click', () => renderParentDashboard(b.dataset.onglet, false)));
    actualiserBandeauDefis();
  } else if (onglet === 'erreurs') {
    zone.innerHTML = erreursHtml(tentatives);
  } else if (onglet === 'progression') {
    zone.innerHTML = progressionHtml(tentatives, tronque);
  } else if (onglet === 'defis') {
    return remplirListeDefis(zone); // même liste que l'écran « Défis » (defis.js)
  } else if (onglet === 'cours') {
    return afficherPageCours(zone, 0, '');
  }
  brancherContenuCours(zone);
}

// Onglet Cours : une page de cours (20), filtrable par matière, avec « Plus de cours » s'il en reste.
let demandeCoursEnCours = 0; // numéro de la dernière demande : une réponse plus ancienne arrivée en retard est ignorée
async function afficherPageCours(zone, page, matiere) {
  const numero = ++demandeCoursEnCours;
  if (page === 0) zone.innerHTML = '<div class="busy"><p>Chargement des cours...</p></div>';
  const boutonPlus = document.getElementById('cours-plus');
  if (boutonPlus) boutonPlus.disabled = true; // pas de double toucher sur « Plus de cours »
  let donnees;
  try {
    donnees = await chargerCoursParent(state.accessCode, page, matiere);
  } catch (err) {
    if (numero === demandeCoursEnCours) zone.innerHTML = `<p class="error">Impossible de charger les cours : ${echapperHtml(err.message)}</p>`;
    return;
  }
  if (numero !== demandeCoursEnCours || !zone.isConnected) return; // filtre changé ou onglet quitté entre-temps
  if (page === 0) {
    zone.innerHTML = `
      <label>Matière
        <select id="cours-filtre"><option value="">Toutes</option>${donnees.matieres.map(m => `<option ${m === matiere ? 'selected' : ''}>${echapperHtml(m)}</option>`).join('')}</select>
      </label>
      <ul class="exercise-list" id="cours-liste"></ul>
      <button id="cours-plus" class="secondary">Plus de cours</button>`;
    document.getElementById('cours-filtre').addEventListener('change', e => afficherPageCours(zone, 0, e.target.value));
  }
  const liste = document.getElementById('cours-liste');
  liste.insertAdjacentHTML('beforeend', donnees.cours.length || page ? donnees.cours.map(ligneCoursHtml).join('') : '<p class="subtitle">Aucun cours.</p>');
  const plus = document.getElementById('cours-plus');
  plus.hidden = !donnees.suivant;
  plus.disabled = false;
  plus.onclick = () => afficherPageCours(zone, page + 1, matiere);
  brancherContenuCours(liste);
}

// Boutons « Voir la fiche / les explications / la carte » d'une zone : contenu chargé au clic, une visionneuse ouverte à la fois.
function brancherContenuCours(zone) {
  zone.querySelectorAll('.voir-contenu:not([data-branche])').forEach(btn => {
    btn.dataset.branche = '1';
    btn.addEventListener('click', async () => {
      const id = btn.dataset.cours, vue = btn.dataset.vue;
      document.querySelectorAll('.cours-contenu').forEach(z => { z.innerHTML = ''; });
      const cible = [...document.querySelectorAll('.cours-contenu')].find(z => z.dataset.contenu === id);
      cible.innerHTML = '<div class="busy"><p>Chargement...</p></div>';
      try {
        const contenu = await chargerContenuCours(state.accessCode, id);
        cible.innerHTML = contenuCoursHtml(contenu, vue);
        const carte = vue === 'carte' ? validerCarteMentale(contenu.carte) : null;
        if (carte) brancherExportCarte(carte, btn.closest('.exercise-item')?.querySelector('.ex-statement')?.textContent || 'cours');
      } catch (err) {
        cible.innerHTML = `<p class="error">Impossible d'afficher ce contenu : ${echapperHtml(err.message)}</p>`;
      }
    });
  });
}
