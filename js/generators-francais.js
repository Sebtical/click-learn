const THEMES_FR = [
  {
    id: 'conjugaison', titre: 'Conjugaison',
    resume: 'Conjuguer des verbes au présent, à l\'imparfait et au futur simple, et reconnaître un temps.',
    notions: ['présent', 'imparfait', 'futur simple'],
    cours: `Au présent, à l'imparfait et au futur simple, chaque verbe a des terminaisons différentes selon le groupe auquel il appartient : le 1er groupe (verbes en -er comme "aimer"), le 2e groupe (verbes en -ir comme "finir"), et le 3e groupe qui regroupe les verbes irréguliers (être, avoir, aller, faire...).

À l'imparfait, les terminaisons sont toujours les mêmes, quel que soit le verbe : -ais, -ais, -ait, -ions, -iez, -aient.

Au futur simple, on reconnaît souvent l'infinitif du verbe suivi de -ai, -as, -a, -ons, -ez, -ont.`
  },
  {
    id: 'homophones', titre: 'Homophones grammaticaux',
    resume: 'Choisir la bonne orthographe entre des mots qui se prononcent pareil (a/à, et/est, son/sont...).',
    notions: ['homophones grammaticaux'],
    cours: `Pour bien choisir entre deux homophones grammaticaux, on utilise une astuce de remplacement :

a / à : remplace par "avait" — si ça fonctionne, c'est "a" (verbe avoir).

et / est : remplace par "était" — si ça fonctionne, c'est "est" (verbe être).

son / sont : remplace par "étaient" — si ça fonctionne, c'est "sont".

ce / se : "se" s'utilise devant un verbe (verbe pronominal), "ce" s'utilise devant un nom.

ou / où : remplace par "ou bien" — si ça fonctionne, c'est "ou" (sans accent). "où" indique un lieu ou un moment.

ces / ses : "ses" indique la possession (remplaçable par "les siens/siennes"), "ces" désigne (remplaçable par "ces...-là").`
  },
  {
    id: 'nature_mots', titre: 'Nature des mots',
    resume: 'Identifier la classe grammaticale d\'un mot dans une phrase (nom, verbe, adjectif, adverbe, pronom, préposition).',
    notions: ['classes grammaticales'],
    cours: `La nature (ou classe grammaticale) d'un mot indique à quelle catégorie il appartient :

le nom désigne une personne, un objet ou une idée ;
le verbe exprime une action ou un état ;
l'adjectif qualifie un nom ;
l'adverbe modifie un verbe, un adjectif ou une phrase entière (souvent en -ment) ;
le pronom remplace un nom (il, elle, le, que...) ;
la préposition introduit un complément (à, de, sur, dans, avec...).`
  },
  {
    id: 'fonctions', titre: 'Fonctions dans la phrase',
    resume: 'Identifier la fonction d\'un groupe de mots : sujet, complément d\'objet direct (COD), complément d\'objet indirect (COI).',
    notions: ['sujet', 'COD', 'COI'],
    cours: `La fonction d'un mot ou groupe de mots indique son rôle dans la phrase :

le sujet fait l'action exprimée par le verbe (on le trouve en posant la question "qui est-ce qui...?" avant le verbe) ;

le complément d'objet direct (COD) répond à la question "quoi ?" ou "qui ?" juste après le verbe, sans préposition ;

le complément d'objet indirect (COI) répond à "à quoi ?", "à qui ?", "de quoi ?" avec une préposition entre le verbe et lui.`
  },
  {
    id: 'accords', titre: 'Accords',
    resume: 'Accorder un adjectif avec le nom qu\'il qualifie, accorder le participe passé avec "être".',
    notions: ['accord adjectif-nom', 'accord du participe passé avec être'],
    cours: `L'adjectif s'accorde en genre (masculin/féminin) et en nombre (singulier/pluriel) avec le nom qu'il qualifie. Exemple : un grand jardin, une grande maison.

Avec l'auxiliaire "être", le participe passé s'accorde toujours avec le sujet du verbe, en genre et en nombre. Exemple : il est parti, elle est partie, ils sont partis, elles sont parties.`
  },
  {
    id: 'vocabulaire', titre: 'Vocabulaire',
    resume: 'Trouver un synonyme ou un antonyme d\'un mot donné.',
    notions: ['synonymes', 'antonymes'],
    cours: `Un synonyme est un mot de sens proche ou identique à un autre mot. Exemple : content / heureux.

Un antonyme est un mot de sens opposé à un autre mot. Exemple : grand / petit.

Pour vérifier, on peut essayer de remplacer un mot par un autre dans une phrase : si le sens reste proche, c'est un synonyme ; s'il devient l'inverse, c'est un antonyme.`
  },
  {
    id: 'types_phrases', titre: 'Types de phrases',
    resume: 'Reconnaître si une phrase est déclarative, interrogative, exclamative ou injonctive.',
    notions: ['types de phrases'],
    cours: `Une phrase déclarative affirme ou raconte quelque chose ; elle se termine par un point.

Une phrase interrogative pose une question ; elle se termine par un point d'interrogation.

Une phrase exclamative exprime une émotion forte ; elle se termine par un point d'exclamation.

Une phrase injonctive donne un ordre ou un conseil, souvent avec un verbe à l'impératif.`
  },
  {
    id: 'figures_style', titre: 'Figures de style',
    resume: 'Reconnaître une comparaison, une métaphore, une personnification ou une hyperbole.',
    notions: ['figures de style'],
    cours: `La comparaison rapproche deux éléments à l'aide d'un mot comparatif (comme, tel que, pareil à, ressembler à...).

La métaphore rapproche deux éléments sans mot comparatif : on identifie directement l'un à l'autre.

La personnification donne des caractéristiques humaines à une chose ou un animal.

L'hyperbole exagère fortement une réalité pour créer un effet.`
  }
];

const VERBS_FR = [
  { inf: 'aimer', forms: { present: ['aime', 'aimes', 'aime', 'aimons', 'aimez', 'aiment'], imparfait: ['aimais', 'aimais', 'aimait', 'aimions', 'aimiez', 'aimaient'], futur: ['aimerai', 'aimeras', 'aimera', 'aimerons', 'aimerez', 'aimeront'] } },
  { inf: 'finir', forms: { present: ['finis', 'finis', 'finit', 'finissons', 'finissez', 'finissent'], imparfait: ['finissais', 'finissais', 'finissait', 'finissions', 'finissiez', 'finissaient'], futur: ['finirai', 'finiras', 'finira', 'finirons', 'finirez', 'finiront'] } },
  { inf: 'être', forms: { present: ['suis', 'es', 'est', 'sommes', 'êtes', 'sont'], imparfait: ['étais', 'étais', 'était', 'étions', 'étiez', 'étaient'], futur: ['serai', 'seras', 'sera', 'serons', 'serez', 'seront'] } },
  { inf: 'avoir', forms: { present: ['ai', 'as', 'a', 'avons', 'avez', 'ont'], imparfait: ['avais', 'avais', 'avait', 'avions', 'aviez', 'avaient'], futur: ['aurai', 'auras', 'aura', 'aurons', 'aurez', 'auront'] } },
  { inf: 'aller', forms: { present: ['vais', 'vas', 'va', 'allons', 'allez', 'vont'], imparfait: ['allais', 'allais', 'allait', 'allions', 'alliez', 'allaient'], futur: ['irai', 'iras', 'ira', 'irons', 'irez', 'iront'] } },
  { inf: 'faire', forms: { present: ['fais', 'fais', 'fait', 'faisons', 'faites', 'font'], imparfait: ['faisais', 'faisais', 'faisait', 'faisions', 'faisiez', 'faisaient'], futur: ['ferai', 'feras', 'fera', 'ferons', 'ferez', 'feront'] } }
];
const PRONOUNS_FR = ['je', 'tu', 'il', 'nous', 'vous', 'ils'];
const TENSE_LABELS_FR = { present: 'au présent', imparfait: "à l'imparfait", futur: 'au futur simple' };
const TENSE_QCM_LABELS_FR = { present: 'Présent', imparfait: 'Imparfait', futur: 'Futur simple' };

function displayPronounForm(idx, form) {
  if (idx === 0) return /^[aeiouhAEIOUH]/.test(form) ? "j'" + form : 'je ' + form;
  return PRONOUNS_FR[idx] + ' ' + form;
}

const HOMOPHONES_FR = [
  { phrase: 'Il ___ mangé une pomme.', correct: 'a', wrong: 'à', regle: 'Remplace par "avait" : si ça fonctionne, c\'est "a" (verbe avoir).' },
  { phrase: 'Elle habite ___ Paris.', correct: 'à', wrong: 'a', regle: '"à" est une préposition, on ne peut pas la remplacer par "avait".' },
  { phrase: 'Ils ___ arrivés en retard.', correct: 'sont', wrong: 'son', regle: 'Remplace par "étaient" : si ça fonctionne, c\'est "sont" (verbe être).' },
  { phrase: 'Paul a perdu ___ cahier.', correct: 'son', wrong: 'sont', regle: '"son" est suivi d\'un nom et indique la possession, remplaçable par "mon" ou "ton".' },
  { phrase: 'Il faut ___ dépêcher.', correct: 'se', wrong: 'ce', regle: '"se" s\'utilise devant un verbe (verbe pronominal).' },
  { phrase: '___ livre est passionnant.', correct: 'Ce', wrong: 'Se', regle: '"ce" s\'utilise devant un nom, remplaçable par "un".' },
  { phrase: 'Tu préfères le thé ___ le café ?', correct: 'ou', wrong: 'où', regle: 'Remplace par "ou bien" : si ça fonctionne, c\'est "ou" sans accent.' },
  { phrase: 'Je ne sais pas ___ il est parti.', correct: 'où', wrong: 'ou', regle: '"où" indique un lieu ou un moment ; on ne peut pas le remplacer par "ou bien".' },
  { phrase: 'Regarde ___ enfants qui jouent là-bas.', correct: 'ces', wrong: 'ses', regle: '"ces" désigne, remplaçable par "ces...-là".' },
  { phrase: 'Marie a rangé ___ affaires.', correct: 'ses', wrong: 'ces', regle: '"ses" indique la possession, remplaçable par "les siennes".' },
  { phrase: 'Mes cousins ___ un chien.', correct: 'ont', wrong: 'on', regle: 'Remplace par "avaient" : si ça fonctionne, c\'est "ont" (verbe avoir).' },
  { phrase: '___ va au cinéma ce soir ?', correct: 'On', wrong: 'Ont', regle: '"on" est un pronom, remplaçable par "il".' }
];

const NATURE_MOTS_FR = [
  { phrase: 'Le chat noir dort.', mot: 'noir', nature: 'adjectif' },
  { phrase: 'Elle chante joyeusement.', mot: 'joyeusement', nature: 'adverbe' },
  { phrase: 'Le chat noir dort.', mot: 'chat', nature: 'nom' },
  { phrase: 'Il mange une pomme.', mot: 'mange', nature: 'verbe' },
  { phrase: 'Elle le regarde.', mot: 'le', nature: 'pronom' },
  { phrase: 'Le livre est sur la table.', mot: 'sur', nature: 'préposition' },
  { phrase: 'Nous partons demain.', mot: 'nous', nature: 'pronom' },
  { phrase: 'Un grand arbre.', mot: 'grand', nature: 'adjectif' }
];
const NATURES_FR = ['nom', 'verbe', 'adjectif', 'adverbe', 'pronom', 'préposition'];

const FONCTIONS_FR = [
  { phrase: 'Le chien mange sa gamelle.', groupe: 'sa gamelle', fonction: 'COD' },
  { phrase: 'Le chien mange sa gamelle.', groupe: 'Le chien', fonction: 'sujet' },
  { phrase: 'Elle parle à sa sœur.', groupe: 'à sa sœur', fonction: 'COI' },
  { phrase: 'Les enfants jouent dans le jardin.', groupe: 'Les enfants', fonction: 'sujet' },
  { phrase: 'Il offre un cadeau à son ami.', groupe: 'un cadeau', fonction: 'COD' },
  { phrase: 'Il offre un cadeau à son ami.', groupe: 'à son ami', fonction: 'COI' },
  { phrase: 'Le professeur explique la leçon.', groupe: 'la leçon', fonction: 'COD' },
  { phrase: 'Nous pensons à nos vacances.', groupe: 'à nos vacances', fonction: 'COI' }
];

const ADJECTIFS_FR = [
  { m: 'grand', f: 'grande' }, { m: 'petit', f: 'petite' }, { m: 'joli', f: 'jolie' },
  { m: 'beau', f: 'belle' }, { m: 'nouveau', f: 'nouvelle' }, { m: 'blanc', f: 'blanche' },
  { m: 'heureux', f: 'heureuse' }
];
const NOMS_FR = [
  { mot: 'garçon', genre: 'm' }, { mot: 'fille', genre: 'f' }, { mot: 'maison', genre: 'f' }, { mot: 'chat', genre: 'm' }
];
const PP_VERBES_FR = [
  { inf: 'aller', radical: 'all', voyelle: 'é' }, { inf: 'partir', radical: 'part', voyelle: 'i' },
  { inf: 'arriver', radical: 'arriv', voyelle: 'é' }, { inf: 'tomber', radical: 'tomb', voyelle: 'é' },
  { inf: 'rentrer', radical: 'rentr', voyelle: 'é' }, { inf: 'sortir', radical: 'sort', voyelle: 'i' }
];
const SUJETS_PP_FR = [
  { pron: 'Il', genre: 'm', nb: 's' }, { pron: 'Elle', genre: 'f', nb: 's' },
  { pron: 'Ils', genre: 'm', nb: 'p' }, { pron: 'Elles', genre: 'f', nb: 'p' }
];

const SYN_PAIRS_FR = [
  ['content', 'heureux'], ['grand', 'immense'], ['petit', 'minuscule'], ['beau', 'magnifique'],
  ['triste', 'malheureux'], ['intelligent', 'brillant'], ['difficile', 'compliqué'], ['facile', 'simple'],
  ['fort', 'puissant'], ['gentil', 'aimable']
];
const ANT_PAIRS_FR = [
  ['grand', 'petit'], ['chaud', 'froid'], ['rapide', 'lent'], ['heureux', 'triste'],
  ['facile', 'difficile'], ['fort', 'faible'], ['beau', 'laid'], ['content', 'mécontent'],
  ['clair', 'sombre'], ['jeune', 'vieux']
];

const SYN_GROUPS_FR = [
  { mot: 'content', synonymes: ['heureux', 'joyeux'], autres: ['triste', 'rapide'] },
  { mot: 'grand', synonymes: ['immense', 'énorme'], autres: ['petit', 'rapide'] },
  { mot: 'beau', synonymes: ['magnifique', 'superbe'], autres: ['laid', 'lent'] },
  { mot: 'petit', synonymes: ['minuscule', 'minime'], autres: ['grand', 'fort'] }
];

const WORDS_NATURE_FR = [
  { mot: 'chat', nature: 'nom' }, { mot: 'table', nature: 'nom' }, { mot: 'liberté', nature: 'nom' },
  { mot: 'rapide', nature: 'adjectif' }, { mot: 'beau', nature: 'adjectif' }, { mot: 'triste', nature: 'adjectif' },
  { mot: 'chante', nature: 'verbe' }, { mot: 'dort', nature: 'verbe' }, { mot: 'mange', nature: 'verbe' },
  { mot: 'doucement', nature: 'adverbe' }, { mot: 'vite', nature: 'adverbe' }, { mot: 'toujours', nature: 'adverbe' }
];

const TYPES_PHRASES_FR = [
  { phrase: 'Le chat dort.', type: 'déclarative' },
  { phrase: 'Est-ce que tu viens ?', type: 'interrogative' },
  { phrase: 'Quelle belle journée !', type: 'exclamative' },
  { phrase: 'Range ta chambre !', type: 'injonctive' },
  { phrase: 'Il pleut aujourd\'hui.', type: 'déclarative' },
  { phrase: 'Pourquoi es-tu en retard ?', type: 'interrogative' },
  { phrase: 'Quel dommage !', type: 'exclamative' },
  { phrase: 'Ferme la porte, s\'il te plaît.', type: 'injonctive' }
];

const FIGURES_STYLE_FR = [
  { phrase: 'Cette fille est rapide comme l\'éclair.', figure: 'comparaison' },
  { phrase: 'Le vent hurlait dans la nuit.', figure: 'personnification' },
  { phrase: 'Cet enfant est un vrai petit soleil.', figure: 'métaphore' },
  { phrase: 'Il pleure des torrents de larmes.', figure: 'hyperbole' },
  { phrase: 'Ses yeux sont deux étoiles brillantes.', figure: 'métaphore' },
  { phrase: 'La feuille dansait dans le vent.', figure: 'personnification' },
  { phrase: 'Il court comme un lièvre.', figure: 'comparaison' }
];

const G_FR = {
  conjugaison: [
    () => {
      const verb = pick(VERBS_FR);
      const tense = pick(['present', 'imparfait', 'futur']);
      const idx = ri(0, 5);
      const form = verb.forms[tense][idx];
      return courtQ('conjugaison : ' + TENSE_LABELS_FR[tense],
        `Conjugue le verbe "${verb.inf}" ${TENSE_LABELS_FR[tense]}, avec le pronom "${PRONOUNS_FR[idx]}". Écris seulement la forme du verbe.`,
        form,
        `"${verb.inf}" ${TENSE_LABELS_FR[tense]} avec "${PRONOUNS_FR[idx]}" donne : ${displayPronounForm(idx, form)}.`);
    },
    () => {
      const verb = pick(VERBS_FR);
      const tense = pick(['present', 'imparfait', 'futur']);
      const idx = ri(0, 5);
      const form = verb.forms[tense][idx];
      const correct = TENSE_QCM_LABELS_FR[tense];
      const wrongs = shuffle(Object.values(TENSE_QCM_LABELS_FR).filter(l => l !== correct).concat(['Passé composé'])).slice(0, 3);
      return qcm('conjugaison : reconnaître un temps', `À quel temps est conjugué le verbe dans : « ${displayPronounForm(idx, form)} » ?`,
        correct, wrongs,
        'Regarde la terminaison du verbe : chaque temps a des terminaisons caractéristiques (par exemple -ais/-ait à l\'imparfait, -rai/-ras au futur).');
    }
  ],

  homophones: [
    () => {
      const h = pick(HOMOPHONES_FR);
      return qcm('homophones grammaticaux', `Complète : "${h.phrase}"`, h.correct, [h.wrong], h.regle);
    }
  ],

  nature_mots: [
    () => {
      const item = pick(NATURE_MOTS_FR);
      const wrongs = shuffle(NATURES_FR.filter(n => n !== item.nature)).slice(0, 3);
      return qcm('nature des mots', `Dans la phrase "${item.phrase}", quelle est la nature du mot "${item.mot}" ?`, item.nature, wrongs,
        'Pense à ce que fait ce mot : désigne-t-il une chose/personne (nom), une action (verbe), qualifie-t-il un nom (adjectif) ou un verbe (adverbe) ?');
    },
    () => {
      const target = pick(['nom', 'adjectif', 'verbe', 'adverbe']);
      const corrects = shuffle(WORDS_NATURE_FR.filter(w => w.nature === target)).slice(0, 2).map(w => w.mot);
      const wrongs = shuffle(WORDS_NATURE_FR.filter(w => w.nature !== target)).slice(0, 3).map(w => w.mot);
      const targetLabel = target === 'adverbe' ? 'adverbes' : target + 's';
      return qcmMulti('nature des mots', `Parmi ces mots, lesquels sont des ${targetLabel} ? (plusieurs réponses possibles)`, corrects, wrongs,
        'Repasse chaque mot un par un : désigne-t-il une chose/personne, une action, qualifie-t-il un nom, ou modifie-t-il un verbe/adjectif ?');
    }
  ],

  fonctions: [
    () => {
      const item = pick(FONCTIONS_FR);
      const wrongs = shuffle(['sujet', 'COD', 'COI'].filter(f => f !== item.fonction)).slice(0, 2);
      return qcm('fonctions dans la phrase', `Dans la phrase "${item.phrase}", quelle est la fonction de "${item.groupe}" ?`, item.fonction, wrongs,
        'Le sujet fait l\'action. Le COD répond à "quoi ?"/"qui ?" directement après le verbe. Le COI répond à "à quoi ?"/"à qui ?" avec une préposition.');
    }
  ],

  accords: [
    () => {
      const noun = pick(NOMS_FR);
      const adj = pick(ADJECTIFS_FR);
      const article = noun.genre === 'f' ? 'une' : 'un';
      const correct = noun.genre === 'f' ? adj.f : adj.m;
      const wrong = noun.genre === 'f' ? adj.m : adj.f;
      return qcm('accords : adjectif-nom', `Quelle est la forme correcte de l'adjectif "${adj.m}" dans : "${article} ${noun.mot}" ?`, correct, [wrong],
        `"${noun.mot}" est ${noun.genre === 'f' ? 'féminin' : 'masculin'}, donc l'adjectif s'accorde au ${noun.genre === 'f' ? 'féminin' : 'masculin'}.`);
    },
    () => {
      const verb = pick(PP_VERBES_FR);
      const sujet = pick(SUJETS_PP_FR);
      const auxiliaire = sujet.nb === 'p' ? 'sont' : 'est';
      const form = verb.radical + verb.voyelle + (sujet.genre === 'f' ? 'e' : '') + (sujet.nb === 'p' ? 's' : '');
      return courtQ('accords : participe passé avec être',
        `Complète : "${sujet.pron} ${auxiliaire} ___ (${verb.inf})." Écris seulement le participe passé accordé.`,
        form,
        `Avec l'auxiliaire "être", le participe passé s'accorde avec le sujet : ${sujet.pron} est ${sujet.genre === 'f' ? 'féminin' : 'masculin'} ${sujet.nb === 'p' ? 'pluriel' : 'singulier'}.`);
    }
  ],

  vocabulaire: [
    () => {
      const pair = pick(SYN_PAIRS_FR);
      const [mot, syn] = Math.random() < 0.5 ? pair : [pair[1], pair[0]];
      const pool = [...new Set([].concat(...SYN_PAIRS_FR, ...ANT_PAIRS_FR))].filter(w => w !== mot && w !== syn);
      const wrongs = shuffle(pool).slice(0, 3);
      return qcm('vocabulaire : synonymes', `Quel est un synonyme du mot "${mot}" ?`, syn, wrongs,
        'Un synonyme a un sens proche ou identique. Essaie de remplacer le mot dans une phrase pour voir si le sens reste le même.');
    },
    () => {
      const pair = pick(ANT_PAIRS_FR);
      const [mot, ant] = Math.random() < 0.5 ? pair : [pair[1], pair[0]];
      const pool = [...new Set([].concat(...SYN_PAIRS_FR, ...ANT_PAIRS_FR))].filter(w => w !== mot && w !== ant);
      const wrongs = shuffle(pool).slice(0, 3);
      return qcm('vocabulaire : antonymes', `Quel est le contraire (antonyme) du mot "${mot}" ?`, ant, wrongs,
        'Un antonyme a un sens opposé. Pense à ce qui décrirait exactement l\'inverse.');
    },
    () => {
      const group = pick(SYN_GROUPS_FR);
      return qcmMulti('vocabulaire : synonymes', `Parmi ces mots, lesquels sont des synonymes de "${group.mot}" ? (plusieurs réponses possibles)`,
        group.synonymes, group.autres,
        'Un synonyme a un sens proche. Essaie de remplacer chaque mot dans une phrase avec "' + group.mot + '" pour voir si le sens reste proche.');
    }
  ],

  types_phrases: [
    () => {
      const item = pick(TYPES_PHRASES_FR);
      const wrongs = shuffle(['déclarative', 'interrogative', 'exclamative', 'injonctive'].filter(t => t !== item.type)).slice(0, 3);
      return qcm('types de phrases', `Quel est le type de cette phrase : "${item.phrase}" ?`, item.type, wrongs,
        'Une déclarative affirme, une interrogative pose une question, une exclamative exprime une émotion forte, une injonctive donne un ordre ou un conseil.');
    }
  ],

  figures_style: [
    () => {
      const item = pick(FIGURES_STYLE_FR);
      const wrongs = shuffle(['comparaison', 'métaphore', 'personnification', 'hyperbole'].filter(f => f !== item.figure)).slice(0, 3);
      return qcm('figures de style', `Quelle figure de style est utilisée dans : "${item.phrase}" ?`, item.figure, wrongs,
        'La comparaison utilise un mot de comparaison ("comme"...), la métaphore compare sans ce mot, la personnification donne des traits humains à une chose, l\'hyperbole exagère fortement.');
    }
  ]
};
