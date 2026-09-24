function isLocalSubject(subject) {
  return subject === 'Maths' || subject === 'Français';
}

function localThemes(subject) {
  return subject === 'Maths' ? THEMES_MATHS : THEMES_FR;
}

function localGenerators(subject) {
  return subject === 'Maths' ? G_MATHS : G_FR;
}

// themeId === null : pioche dans tous les thèmes de la matière (quiz surprise).
function generateLocalQuiz(subject, themeId, difficultyId, length) {
  const hard = difficultyId === 'defi';
  const generators = localGenerators(subject);
  const pool = themeId ? generators[themeId] : Object.values(generators).flat();

  const questions = [];
  for (let i = 0; i < length; i++) {
    const genFn = pick(pool);
    questions.push({ id: uid(), ...genFn(hard) });
  }
  return questions;
}
