const DIFFICULTIES = [
  {
    id: 'decouverte',
    label: 'Découverte',
    guidance: 'Questions très accessibles : application directe et immédiate du cours, un seul concept à la fois par question, aucun piège, énoncés courts. Le but est de rassurer et de consolider une base solide, pas de tester les limites.'
  },
  {
    id: 'entrainement',
    label: 'Entraînement',
    guidance: 'Niveau standard attendu en classe à ce moment de l\'année : applique le cours avec un peu d\'autonomie, éventuellement deux étapes de raisonnement, mais sans piège gratuit ni notion hors-sujet.'
  },
  {
    id: 'defi',
    label: 'Défi',
    guidance: 'Pour aller un peu plus loin une fois les bases posées : combine deux notions proches ou demande un raisonnement en plusieurs étapes, mais reste strictement dans le programme du niveau — jamais de complexité artificielle ni de formulation piège juste pour compliquer.'
  }
];

// Niveau de difficulté par son identifiant (Entraînement par défaut).
function difficultyById(id) {
  return DIFFICULTIES.find(d => d.id === id) || DIFFICULTIES[1];
}

// Rappel injecté dans tous les prompts de génération de questions, pour éviter que l'IA
// ne parte sur des formulations trop complexes ou un niveau plus dur que demandé.
function calibrationNote(niveau) {
  return `Formule des énoncés simples, concrets et clairs, vraiment adaptés à un(e) élève de ${niveau} (collège, France) — évite le vocabulaire universitaire ou les tournures alambiquées, et ne complique jamais une question artificiellement pour la rendre "plus dure".`;
}

// Un calcul faux dans la clé "answer"/"correctIndex" pénalise injustement l'élève (il peut avoir
// raison et se voir répondre "faux") : on demande explicitement une relecture avant de finaliser.
const ACCURACY_NOTE = 'Avant de finaliser, pour chaque question recalcule le résultat attendu pas à pas (étape par étape, sans sauter d\'étape mentalement) et vérifie que "answer" (ou "correctIndex") correspond exactement à ce résultat recalculé. Une bonne réponse de l\'élève marquée "fausse" à cause d\'une erreur de calcul de ta part est pire qu\'une question trop facile.';

// Même logique côté correction : si l'élève a raison, il ne doit jamais être marqué "faux"
// parce que l'IA a refait le calcul de travers en jugeant sa réponse.
const GRADING_ACCURACY_NOTE = 'Si la question implique un calcul ou un raisonnement, refais-le toi-même pas à pas avant de juger — ne te fie pas à une impression, une réponse juste de l\'élève ne doit jamais être marquée incorrecte par erreur de calcul de ta part.';

// La répétition d'exercices est ce qui fait progresser : des sets plus longs qu'un simple mini-quiz.
const QUIZ_LENGTH = 15;

// Bloc commun aux deux prompts qui génèrent un jeu de questions (quizGenerationPrompt et
// programQuizPrompt) : mélange de types, rappel anti-erreur, et format JSON attendu.
function questionSetInstructions() {
  return `Mélange des questions à choix multiples (QCM, 4 choix), des questions à réponse numérique quand c'est adapté (calcul, mesure...), et des questions ouvertes courtes pour le reste. Varie les questions même sur une même notion (angles d'attaque différents, exemples différents) pour un vrai entraînement par répétition, sans répéter deux fois la même question. Pour chaque question, précise la notion exacte testée (ex : "fractions : addition de fractions").
Pour les QCM : donne l'index (0 à 3) de la bonne réponse, et une piste de réflexion à afficher si l'élève se trompe. Cette piste ne doit JAMAIS révéler la réponse : elle doit rappeler une règle, poser une question, ou suggérer une méthode pour que l'élève trouve seul(e).
${ACCURACY_NOTE}
Réponds UNIQUEMENT avec un JSON valide, sans texte autour, sans balises markdown, au format :
{"questions": [
  {"type": "qcm", "notion": "...", "enonce": "...", "choix": ["...", "...", "...", "..."], "correctIndex": 0, "pisteReflexion": "..."},
  {"type": "num", "notion": "...", "enonce": "...", "answer": 0, "unit": "", "pisteReflexion": "..."},
  {"type": "fraction", "notion": "...", "enonce": "...", "numerateur": 3, "denominateur": 4, "pisteReflexion": "..."},
  {"type": "ouverte", "notion": "...", "enonce": "..."}
]}
${REGLE_FRACTIONS}
(le tableau "questions" doit contenir exactement ${QUIZ_LENGTH} éléments, ni plus ni moins)`;
}

// Consigne d'analyse des photos d'un cours : matière, titre, résumé, notions et fiche détaillée fidèle.
function lessonAnalysisPrompt(niveau, subjects) {
  return `Tu es un assistant pédagogique qui analyse des photos de cours pour un(e) élève de ${niveau} (collège, France).
Tu reçois une ou plusieurs photos d'un même cours ou d'une même leçon (éventuellement plusieurs pages) : traite-les comme un seul document. Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, sans balises markdown, au format exact suivant :
{"matiere": "une matière parmi cette liste : ${subjects.join(', ')}", "titre": "titre court du cours", "resume": "résumé synthétique du contenu en 3 à 5 phrases", "notions": ["notion précise 1", "notion précise 2"], "fiche": "fiche de cours détaillée"}
La "fiche" reprend fidèlement le contenu des photos, sans rien inventer : définitions, règles, méthodes, dates ou formules, et exemples tels qu'ils figurent dans le cours. ${FORMAT_FICHE}`;
}

// Le clavier chiffres du téléphone n'a pas de « / » et une réponse numérique refuse « 3/4 » :
// toute réponse attendue sous forme de fraction doit utiliser le type « fraction ».
const REGLE_FRACTIONS = 'Si la réponse attendue est une fraction, utilise toujours le type "fraction" (numérateur et dénominateur entiers positifs, la fraction peut ne pas être simplifiée : toute fraction égale sera acceptée) et jamais "num" ; "num" est réservé aux nombres entiers ou décimaux.';

// Mise en forme commune des fiches (rendue par texteRicheHtml dans cours.js) : pas de HTML ni de markdown complexe.
const FORMAT_FICHE = 'Mise en forme : texte simple, une ligne « ## Titre » pour chaque partie, des lignes commençant par « - » pour les listes, **mot** pour mettre en gras un mot important ; aucune autre balise.';

// Fiche « Plus de détails » d'un cours déjà enregistré : la photo n'est plus disponible,
// l'IA approfondit à partir du résumé et des notions, dans le programme du niveau.
function ficheDetailleePrompt(niveau, cours) {
  return `Tu es un professeur bienveillant de ${cours.matiere} pour un(e) élève de ${niveau} (collège, France).
Voici le résumé d'un cours que l'élève a eu en classe :
Titre : ${cours.titre}
Résumé : ${cours.resume}
Notions : ${(cours.notions || []).join(', ')}

Rédige une fiche de révision détaillée de ce cours : explique chaque notion simplement, donne les définitions et règles à retenir, et au moins un exemple concret par notion. Reste strictement dans le programme de ${niveau} et dans le sujet du résumé, sans ajouter de chapitre voisin.
${calibrationNote(niveau)}
${FORMAT_FICHE}
Réponds UNIQUEMENT avec un JSON valide, sans texte autour, sans balises markdown : {"fiche": "..."}`;
}

// Carte mentale d'un cours : contenu seulement (l'appli la dessine). Source la plus fidèle disponible :
// la fiche détaillée si elle existe, sinon le résumé, les notions et les explications d'un cours sur mesure.
// (Utilise CARTE_MAX_BRANCHES et CARTE_MAX_ELEMENTS de carte.js, lues au moment de l'appel.)
function carteMentalePrompt(niveau, cours) {
  const explications = (cours.explications || []).map(e => `- ${e.notion} : ${e.methode}`).join('\n');
  const source = cours.fiche
    ? `Fiche du cours :
${cours.fiche}`
    : `Résumé : ${cours.resume}
Notions : ${(cours.notions || []).join(', ')}${explications ? `
Méthodes à retenir :
${explications}` : ''}`;
  return `Tu es un professeur de ${cours.matiere} qui aide un(e) élève de ${niveau} (collège, France) à réviser avec une carte mentale.
Cours : ${cours.titre}
${source}

Construis le contenu d'une carte mentale de ce cours : au centre, le thème en 1 à 4 mots ; autour, 3 à ${CARTE_MAX_BRANCHES} branches (par exemple définitions, règles, méthodes, exemples, pièges à éviter), chacune avec 2 à ${CARTE_MAX_ELEMENTS} éléments très courts (mots-clés, formules ou mini-exemples, 60 caractères au plus). Reste fidèle au cours, sans rien ajouter qui n'y soit pas. Écris les formules en texte simple (ex : a/b, x², √2).
Réponds UNIQUEMENT avec un JSON valide, sans texte autour, sans balises markdown :
{"centre": "...", "branches": [{"titre": "...", "elements": ["...", "..."]}]}`;
}

// Nombre de questions du mini-quiz qui suit un cours sur mesure.
const NB_QUESTIONS_SUR_MESURE = 5;

// Cours sur mesure après un quiz : explique chaque erreur de l'élève, puis vérifie avec un mini-quiz.
// La bonne réponse fournie vient de l'appli (vérifiée pour Maths et Français) : l'IA s'appuie dessus.
function coursSurMesurePrompt(niveau, matiere, erreurs) {
  const liste = erreurs.map((e, i) => `${i + 1}. Notion : ${e.notion || 'non précisée'}
   Question : ${e.enonce}
   Réponse de l'élève : ${e.reponseDonnee ?? '(non conservée)'}
   Bonne réponse : ${e.bonneReponse ?? '(question ouverte, pas de réponse unique)'}`).join('\n');
  return `Tu es un professeur bienveillant de ${matiere} pour un(e) élève de ${niveau} (collège, France).
L'élève vient de faire un quiz et s'est trompé(e) sur ces questions :
${liste}

Crée un petit cours sur mesure pour l'aider à comprendre ses erreurs :
- pour chaque notion où il y a eu une erreur (regroupe les erreurs d'une même notion) : ce qui n'allait pas dans sa réponse, dit avec bienveillance et sans le/la juger ; la méthode ou la règle à appliquer ; un exemple corrigé pas à pas, différent de la question du quiz ;
- puis exactement ${NB_QUESTIONS_SUR_MESURE} nouvelles questions sur ces mêmes notions pour vérifier qu'il/elle a compris, de difficulté égale ou un peu plus simple que le quiz.
La « bonne réponse » indiquée ci-dessus est sûre : appuie-toi dessus et ne la contredis jamais.
${calibrationNote(niveau)}
${ACCURACY_NOTE}
Les questions sont uniquement des QCM (4 choix), des questions à réponse numérique ou des questions dont la réponse est une fraction ; la piste de réflexion ne révèle jamais la réponse.
${REGLE_FRACTIONS}
Réponds UNIQUEMENT avec un JSON valide, sans texte autour, sans balises markdown, au format :
{"titre": "titre court du cours", "resume": "ce que ce cours fait retravailler, en 1 à 2 phrases", "notions": ["..."],
 "explications": [{"notion": "...", "erreur": "...", "methode": "...", "exemple": "..."}],
 "questions": [
  {"type": "qcm", "notion": "...", "enonce": "...", "choix": ["...", "...", "...", "..."], "correctIndex": 0, "pisteReflexion": "..."},
  {"type": "num", "notion": "...", "enonce": "...", "answer": 0, "unit": "", "pisteReflexion": "..."},
  {"type": "fraction", "notion": "...", "enonce": "...", "numerateur": 3, "denominateur": 4, "pisteReflexion": "..."}
 ]}`;
}

// Consigne de génération d'un quiz de révision à partir d'un cours enregistré.
function quizGenerationPrompt(niveau, subject, difficultyId, lesson) {
  const { label, guidance } = difficultyById(difficultyId);
  return `Tu es un tuteur pédagogique bienveillant pour un(e) élève de ${niveau} (collège, France), en ${subject}.
Voici le contenu d'un cours :
Titre : ${lesson.titre}
Résumé : ${lesson.resume}
Notions : ${lesson.notions.join(', ')}

Génère un parcours de révision de ${QUIZ_LENGTH} questions, niveau de difficulté "${label}" : ${guidance}
${calibrationNote(niveau)}
${questionSetInstructions()}`;
}

// Consigne de correction d'une réponse ouverte de l'élève.
function gradingPrompt(niveau, subject, lesson, question, reponseEleve) {
  const contexte = lesson
    ? `Contenu du cours (résumé) : ${lesson.resume}`
    : `Pas de cours source précis : évalue selon les connaissances attendues du programme de ${niveau} en ${subject}.`;

  return `Tu es un tuteur pédagogique bienveillant pour un(e) élève de ${niveau} (collège, France), en ${subject}.
${contexte}
Question posée : ${question.enonce}
Réponse de l'élève : ${reponseEleve}

${GRADING_ACCURACY_NOTE}
Évalue cette réponse. Réponds UNIQUEMENT avec un JSON valide, sans texte autour, sans balises markdown, au format :
{"statut": "correct" | "partiel" | "incorrect", "feedback": "..."}
Le feedback doit être bienveillant, adapté à un(e) ado. Si le statut n'est pas "correct", le feedback doit être une piste de réflexion qui aide à comprendre l'erreur SANS JAMAIS donner la réponse correcte.`;
}

// Quiz "prêt à l'emploi" basé sur le programme officiel, sans photo de cours au préalable.
function programQuizPrompt(niveau, subject, difficultyId, dateStr) {
  const { label, guidance } = difficultyById(difficultyId);
  return `Tu es un tuteur pédagogique bienveillant pour un(e) élève de ${niveau} (collège, France), en ${subject}.
Nous sommes le ${dateStr}.

Génère un parcours de révision de ${QUIZ_LENGTH} questions basé sur le programme officiel de l'Éducation nationale française pour ce niveau et cette matière, en te calant sur les notions généralement abordées à cette période de l'année scolaire (l'année scolaire va de septembre à juillet). Niveau de difficulté "${label}" : ${guidance}
${calibrationNote(niveau)}
${questionSetInstructions()}`;
}

// Liste des chapitres du programme officiel pour une matière, à un niveau donné, adaptée à la période de l'année.
function curriculumPrompt(niveau, subject, dateStr) {
  return `Tu es un professeur de ${subject} qui connaît précisément le programme officiel du cycle 4 de l'Éducation nationale française pour le niveau ${niveau} (collège, France).
Nous sommes le ${dateStr} (année scolaire de septembre à juillet).

Liste les chapitres/notions du programme de ${subject} en ${niveau} qui sont normalement déjà vus ou en cours à cette période de l'année, dans l'ordre où ils sont habituellement enseignés (du début d'année à maintenant, plus le chapitre en cours). Limite-toi à ce qui est raisonnablement déjà abordé, ne liste pas tout le programme de l'année si on est encore en début d'année.
Réponds UNIQUEMENT avec un JSON valide, sans texte autour, sans balises markdown, au format :
{"chapitres": [
  {"titre": "titre court du chapitre", "resume": "résumé synthétique de ce qu'il faut savoir en 2-4 phrases", "notions": ["notion précise 1", "notion précise 2"]}
]}`;
}

// Correction d'une photo d'exercice déjà réalisé par l'élève.
function exerciseGradingPrompt(niveau, subjects) {
  return `Tu es un tuteur pédagogique bienveillant qui corrige le travail d'un(e) élève de ${niveau} (collège, France).
Tu reçois une ou plusieurs photos d'un même exercice que l'élève a déjà fait (avec ses réponses écrites à la main ou remplies) — traite-les comme les pages d'un seul exercice. Identifie chaque question ou sous-question visible sur l'ensemble des photos, et pour chacune :
- reformule brièvement l'énoncé
- indique la notion précise testée
- rapporte ce que l'élève a répondu (ou "non répondu" si une question n'a pas de réponse)
- détermine un statut : "correct", "partiel" ou "incorrect"
- donne un feedback bienveillant, adapté à un(e) ado

Si le statut n'est pas "correct", le feedback doit être une piste de réflexion qui aide l'élève à comprendre son erreur, SANS JAMAIS donner la réponse correcte. Si l'écriture ou l'énoncé n'est pas lisible pour une question, dis-le dans le feedback plutôt que d'inventer une réponse.
${GRADING_ACCURACY_NOTE}

Réponds UNIQUEMENT avec un JSON valide, sans texte autour, sans balises markdown, au format :
{"matiere": "une matière parmi cette liste : ${subjects.join(', ')}", "exercices": [
  {"enonce": "...", "notion": "...", "reponseEleve": "...", "statut": "correct" | "partiel" | "incorrect", "feedback": "..."}
]}`;
}
