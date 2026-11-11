function isLocalSubject(subject) {
  return subject === 'Maths' || subject === 'Français';
}

function localThemes(subject) {
  return subject === 'Maths' ? THEMES_MATHS : THEMES_FR;
}

function localGenerators(subject) {
  return subject === 'Maths' ? G_MATHS : G_FR;
}

// Génère un quiz local ; themeId === null pioche dans tous les thèmes de la matière (quiz surprise).
// Chaque question garde son thème, pour que la maîtrise par chapitre compte aussi les quiz surprise.
function generateLocalQuiz(subject, themeId, difficultyId, length) {
  const hard = difficultyId === 'defi';
  const generators = localGenerators(subject);
  const themes = themeId ? [themeId] : Object.keys(generators);
  const pool = themes.flatMap(t => generators[t].map(genFn => [t, genFn]));

  const questions = [];
  for (let i = 0; i < length; i++) {
    const [theme, genFn] = pick(pool);
    questions.push({ id: uid(), theme, ...genFn(hard) });
  }
  return questions;
}
