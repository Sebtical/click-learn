const THEMES_MATHS = [
  {
    id: 'relatifs', titre: 'Nombres relatifs',
    resume: 'Repérer, comparer, additionner et soustraire des nombres relatifs (positifs et négatifs).',
    notions: ['comparaison de relatifs', 'addition de relatifs', 'soustraction de relatifs'],
    cours: `Un nombre relatif est un nombre positif ou négatif. Il est composé d'un signe (+ ou −) et d'une distance à zéro, appelée valeur absolue.

Comparer deux relatifs : sur une droite graduée, plus un nombre est à droite, plus il est grand. Tout nombre positif est plus grand que tout nombre négatif. Entre deux nombres négatifs, celui qui a la plus petite valeur absolue est le plus grand (par exemple, −3 est plus grand que −8).

Additionner deux relatifs de même signe : on additionne leurs valeurs absolues et on garde le signe commun. Exemple : (−4) + (−7) = −11.

Additionner deux relatifs de signes différents : on soustrait la plus petite valeur absolue de la plus grande, et on garde le signe du nombre qui a la plus grande valeur absolue. Exemple : (−9) + (+3) = −6.

Soustraire un nombre relatif revient à ajouter son opposé : a − b = a + (−b). Exemple : 5 − (−2) = 5 + 2 = 7.`
  },
  {
    id: 'fractions', titre: 'Fractions',
    resume: 'Comparer des fractions, les additionner (même dénominateur ou non), calculer une fraction d\'une quantité.',
    notions: ['comparaison de fractions', 'addition de fractions', 'fraction d\'une quantité'],
    cours: `Une fraction n/d représente n parts sur d parts égales d'un tout.

Comparer deux fractions de même dénominateur : celle qui a le plus grand numérateur est la plus grande.

Additionner deux fractions de même dénominateur : on additionne les numérateurs et on garde le dénominateur. Exemple : 2/7 + 3/7 = 5/7.

Additionner deux fractions de dénominateurs différents : il faut d'abord les mettre au même dénominateur, en multipliant numérateur et dénominateur de chaque fraction par le même nombre, puis on additionne comme au-dessus. Exemple : 1/3 + 1/4 = 4/12 + 3/12 = 7/12.

Une fraction ne change pas de valeur si on multiplie (ou on divise) son numérateur ET son dénominateur par le même nombre non nul : on parle de fractions égales.

Calculer une fraction d'une quantité : on divise la quantité par le dénominateur, puis on multiplie par le numérateur. Exemple : les 3/4 de 20, c'est (20 ÷ 4) × 3 = 15.`
  },
  {
    id: 'proportionnalite', titre: 'Proportionnalité',
    resume: 'Reconnaître et utiliser un tableau de proportionnalité, calculer un pourcentage simple.',
    notions: ['tableau de proportionnalité', 'pourcentages'],
    cours: `Une situation est proportionnelle quand, pour passer d'une grandeur à l'autre, on multiplie toujours par le même nombre.

Dans un tableau de proportionnalité, si on multiplie une valeur de la première ligne par un nombre, la valeur correspondante de la deuxième ligne est multipliée par ce même nombre.

Méthode du passage à l'unité : pour trouver le prix de plusieurs objets, on calcule d'abord le prix d'un seul objet (en divisant), puis on multiplie par la quantité voulue.

Calculer un pourcentage : calculer p % d'un nombre, c'est le multiplier par p/100. Exemple : 20 % de 150 = 150 × 20/100 = 30.`
  },
  {
    id: 'calcul', titre: 'Calculs et priorités',
    resume: 'Appliquer les priorités opératoires, calculer avec des nombres décimaux.',
    notions: ['priorités opératoires', 'calcul décimal'],
    cours: `Les priorités opératoires indiquent dans quel ordre effectuer les calculs :
1. Les parenthèses en premier.
2. Les multiplications et divisions ensuite, dans l'ordre où elles apparaissent.
3. Les additions et soustractions en dernier.

Exemple : 4 + 3 × 2 = 4 + 6 = 10 (on ne calcule pas 4 + 3 en premier).

Additionner des nombres décimaux : on aligne bien les virgules les unes sous les autres avant d'additionner, comme pour des nombres entiers, en n'oubliant pas les retenues.`
  },
  {
    id: 'symetrie', titre: 'Symétrie centrale',
    resume: 'Comprendre les propriétés conservées par une symétrie centrale.',
    notions: ['symétrie centrale'],
    cours: `La symétrie centrale par rapport à un point O associe à chaque point A un point A' tel que O soit le milieu du segment [AA'].

Le centre O est son propre symétrique : il ne bouge pas dans la transformation.

La symétrie centrale conserve les longueurs, les angles et les aires : la figure obtenue est superposable à la figure de départ (elle est juste "retournée" par rapport au centre).`
  },
  {
    id: 'angles', titre: 'Angles',
    resume: 'Classer un angle, calculer des angles complémentaires ou supplémentaires.',
    notions: ['classer un angle', 'angles complémentaires et supplémentaires'],
    cours: `Un angle aigu mesure moins de 90°. Un angle droit mesure exactement 90°. Un angle obtus mesure entre 90° et 180°. Un angle plat mesure 180°.

Deux angles complémentaires ont une somme de 90°.

Deux angles supplémentaires ont une somme de 180°.

Pour trouver la mesure du second angle quand on connaît le premier, on soustrait la mesure connue à 90° (complémentaires) ou à 180° (supplémentaires).`
  },
  {
    id: 'aires', titre: 'Aires et périmètres',
    resume: 'Calculer l\'aire et le périmètre d\'un rectangle, l\'aire d\'un triangle rectangle.',
    notions: ['aire du rectangle', 'périmètre du rectangle', 'aire du triangle'],
    cours: `Aire du rectangle = longueur × largeur.

Périmètre du rectangle = 2 × (longueur + largeur).

Aire du triangle = (base × hauteur) ÷ 2, où la hauteur est mesurée perpendiculairement à la base.`
  },
  {
    id: 'volumes', titre: 'Volumes',
    resume: 'Calculer le volume d\'un pavé droit.',
    notions: ['volume du pavé droit'],
    cours: `Le volume d'un pavé droit (une boîte rectangulaire) se calcule avec la formule : longueur × largeur × hauteur.

Le résultat s'exprime en unités "cube" (cm³, m³...).`
  },
  {
    id: 'stats', titre: 'Statistiques',
    resume: 'Calculer une moyenne, lire des données dans une petite série de nombres.',
    notions: ['moyenne', 'lecture de données'],
    cours: `La moyenne d'une série de valeurs s'obtient en additionnant toutes les valeurs, puis en divisant par le nombre de valeurs.

Lire des données dans une série : le maximum est la plus grande valeur, le minimum est la plus petite.`
  }
];

const G_MATHS = {
  relatifs: [
    hard => {
      const a = ri(hard ? 15 : 2, hard ? 60 : 20);
      const b = ri(hard ? 15 : 2, hard ? 60 : 20);
      const x = pick([-1, 1]) * a;
      const y = pick([-1, 1]) * b;
      if (x === y) return G_MATHS.relatifs[0](hard);
      const bigger = Math.max(x, y);
      return qcm('nombres relatifs : comparaison', `Quel est le plus grand des deux nombres : ${x} ou ${y} ?`,
        String(bigger), [String(Math.min(x, y))],
        'Sur un axe gradué, plus on va vers la droite, plus le nombre est grand. Entre deux négatifs, celui qui a la plus petite valeur absolue est le plus grand.');
    },
    hard => {
      const a = ri(hard ? 10 : 1, hard ? 50 : 15);
      const b = ri(hard ? 10 : 1, hard ? 50 : 15);
      const x = pick([-1, 1]) * a;
      const y = pick([-1, 1]) * b;
      const op = pick(['+', '−']);
      const result = op === '+' ? x + y : x - y;
      return numQ('nombres relatifs : addition et soustraction', `Calcule : ${x} ${op} (${y})`, result,
        op === '+'
          ? 'Pour additionner deux relatifs de même signe, additionne leurs valeurs absolues et garde le signe. De signes différents, soustrais la plus petite valeur absolue de la plus grande et garde le signe du plus grand.'
          : 'Soustraire un nombre relatif revient à ajouter son opposé : a − (b) = a + (−b).');
    }
  ],

  fractions: [
    hard => {
      const d = pick(hard ? [7, 9, 11] : [4, 5, 6, 8]);
      let n1 = ri(1, d - 1), n2 = ri(1, d - 1);
      while (n1 === n2) n2 = ri(1, d - 1);
      const bigger = Math.max(n1, n2);
      return qcm('fractions : comparaison', `Quelle est la plus grande fraction : ${n1}/${d} ou ${n2}/${d} ?`,
        `${bigger}/${d}`, [`${Math.min(n1, n2)}/${d}`],
        'Deux fractions ont le même dénominateur : la plus grande est celle qui a le plus grand numérateur.');
    },
    hard => {
      const d = pick(hard ? [8, 10, 20] : [2, 4, 5, 10]);
      const n1 = ri(1, d - 1), n2 = ri(1, d - n1);
      return courtQ('fractions : addition',
        `Calcule et donne le résultat sous forme de fraction : ${n1}/${d} + ${n2}/${d}`,
        fracAnswers(n1 + n2, d),
        `On additionne les numérateurs car le dénominateur est le même : (${n1}+${n2})/${d}. N'oublie pas de simplifier si c'est possible.`);
    },
    hard => {
      const pool = hard ? [3, 4, 5, 6, 7, 8] : [2, 3, 4, 5];
      const d1 = pick(pool);
      let d2 = pick(pool);
      while (d2 === d1) d2 = pick(pool);
      const n1 = ri(1, d1 - 1);
      const n2 = ri(1, d2 - 1);
      const commun = (d1 * d2) / gcd(d1, d2);
      const numCommun = n1 * (commun / d1) + n2 * (commun / d2);
      return courtQ('fractions : addition (dénominateurs différents)',
        `Calcule et donne le résultat sous forme de fraction : ${n1}/${d1} + ${n2}/${d2}`,
        fracAnswers(numCommun, commun),
        `Mets d'abord les deux fractions au même dénominateur (tu peux utiliser ${commun}) en multipliant numérateur ET dénominateur de chaque fraction par le même nombre, puis additionne les numérateurs. N'oublie pas de simplifier si c'est possible.`);
    },
    hard => {
      const d = pick([2, 3, 4, 5, 10]);
      const k = ri(hard ? 6 : 2, hard ? 30 : 12) * d;
      const result = k / d;
      const nomFraction = { 2: 'la moitié', 3: 'le tiers', 4: 'le quart', 5: 'le cinquième', 10: 'le dixième' }[d];
      return numQ('fractions : fraction d\'une quantité', `Quel est ${nomFraction} de ${k} ?`, result,
        `Prendre ${nomFraction === 'la moitié' ? 'la moitié' : nomFraction} d'un nombre, c'est le diviser par ${d}.`);
    },
    () => {
      const k = ri(2, 6);
      const [n, d] = pick([[1, 2], [1, 3], [2, 3], [1, 4], [3, 4], [1, 5]]);
      const correct = `${n * k}/${d * k}`;
      const wrongs = shuffle([`${n * k + 1}/${d * k}`, `${n}/${d * k}`, `${n * k}/${d * k + 1}`]).slice(0, 3);
      return qcm('fractions : fractions égales', `Laquelle de ces fractions est égale à ${n}/${d} ?`, correct, wrongs,
        'Une fraction ne change pas de valeur si on multiplie (ou divise) son numérateur ET son dénominateur par le même nombre.');
    },
    () => {
      const [n, d] = pick([[1, 2], [1, 3], [2, 3], [1, 4], [3, 4], [1, 5]]);
      const k1 = ri(2, 4);
      let k2 = ri(2, 4);
      while (k2 === k1) k2 = ri(2, 4);
      const correct1 = `${n * k1}/${d * k1}`;
      const correct2 = `${n * k2}/${d * k2}`;
      const wrong1 = `${n * k1 + 1}/${d * k1}`;
      const wrong2 = `${n}/${d * k1 + 2}`;
      return qcmMulti('fractions : fractions égales', `Parmi ces fractions, lesquelles sont égales à ${n}/${d} ? (plusieurs réponses possibles)`,
        [correct1, correct2], [wrong1, wrong2],
        'Une fraction reste égale si on multiplie (ou divise) son numérateur ET son dénominateur par le même nombre. Vérifie chaque fraction une par une.');
    }
  ],

  proportionnalite: [
    hard => {
      const unite = ri(hard ? 3 : 2, hard ? 9 : 6);
      const prixUnite = ri(hard ? 2 : 1, hard ? 12 : 5);
      const qte = ri(hard ? 7 : 3, hard ? 15 : 9);
      const total = unite * prixUnite;
      const result = (total / unite) * qte;
      return numQ('proportionnalité : tableau', `${unite} objets identiques coûtent ${fmtNum(total)} €. Combien coûtent ${qte} de ces objets ?`, result,
        'Calcule d\'abord le prix d\'un seul objet (÷ par le nombre d\'objets), puis multiplie par la quantité voulue.', '€');
    },
    hard => {
      const pct = pick(hard ? [15, 30, 60, 75] : [10, 20, 25, 50]);
      const base = ri(hard ? 40 : 20, hard ? 300 : 200);
      const result = (base * pct) / 100;
      return numQ('proportionnalité : pourcentages', `Calcule ${pct} % de ${base}.`, result,
        `Calculer ${pct} % d'un nombre, c'est le multiplier par ${pct}/100.`);
    },
    () => {
      const unite = ri(2, 8);
      const prix = ri(2, 20);
      const total = unite * prix;
      const facteur = pick([2, 3]);
      const correct = fmtNum(total * facteur);
      const wrongs = [fmtNum(total + facteur), fmtNum(total / facteur), fmtNum(total * facteur + 1)];
      return qcm('proportionnalité : reconnaître une situation proportionnelle',
        `${unite} objets coûtent ${fmtNum(total)} €. Dans une situation proportionnelle, combien coûteraient ${unite * facteur} objets ?`,
        correct, wrongs,
        'Dans une situation proportionnelle, si on multiplie la quantité par un nombre, le prix est multiplié par le même nombre.');
    }
  ],

  calcul: [
    hard => {
      const a = ri(2, hard ? 12 : 9), b = ri(2, hard ? 12 : 9), c = ri(2, hard ? 12 : 9);
      const avant = Math.random() < 0.5;
      const result = avant ? a + b * c : a * b + c;
      const enonce = avant ? `Calcule : ${a} + ${b} × ${c}` : `Calcule : ${a} × ${b} + ${c}`;
      return numQ('calcul : priorités opératoires', enonce, result,
        'La multiplication doit être calculée avant l\'addition, même si elle est écrite en second.');
    },
    hard => {
      const i1 = ri(1, hard ? 40 : 15), d1 = ri(1, 9);
      const i2 = ri(1, hard ? 40 : 15), d2 = ri(1, 9);
      const result = Math.round((i1 + d1 / 10 + i2 + d2 / 10) * 10) / 10;
      return numQ('calcul : nombres décimaux', `Calcule : ${i1},${d1} + ${i2},${d2}`, result,
        'Aligne bien les virgules et additionne les dixièmes ensemble, puis les unités ensemble, en n\'oubliant pas les retenues.');
    },
    hard => {
      const a = ri(2, hard ? 12 : 9), b = ri(2, hard ? 12 : 9), c = ri(2, hard ? 12 : 9);
      const avant = Math.random() < 0.5;
      const enonce = avant ? `${a} + ${b} × ${c}` : `${a} × ${b} + ${c}`;
      const correct = avant ? `${b} × ${c}` : `${a} × ${b}`;
      const wrong = avant ? `${a} + ${b}` : `${b} + ${c}`;
      return qcm('calcul : priorités opératoires', `Dans le calcul ${enonce}, quelle opération doit-on effectuer en premier ?`, correct, [wrong],
        'La multiplication (et la division) est toujours prioritaire sur l\'addition et la soustraction, sauf s\'il y a des parenthèses.');
    }
  ],

  symetrie: [
    () => { const q = qcm('symétrie centrale : définition', 'Dans une symétrie centrale de centre O, quel est le symétrique du point O lui-même ?',
      'Le point O lui-même', ['Un point très éloigné de O', 'Il n\'a pas de symétrique', 'Cela dépend de la figure'],
      'Le centre de symétrie est toujours son propre symétrique : il ne bouge pas dans la transformation.');
      q.fig = symetrieSVG(); return q; },
    () => { const q = qcm('symétrie centrale : propriétés conservées', 'La symétrie centrale conserve-t-elle les longueurs et les angles d\'une figure ?',
      'Oui, elle conserve les longueurs et les angles', ['Elle conserve les longueurs mais pas les angles', 'Elle conserve les angles mais pas les longueurs', 'Elle ne conserve ni l\'un ni l\'autre'],
      'La symétrie centrale est une transformation qui ne déforme pas la figure : les longueurs, les angles et les aires sont conservés.');
      q.fig = symetrieSVG(); return q; }
  ],

  angles: [
    hard => {
      const a = ri(hard ? 5 : 10, hard ? 85 : 80);
      const compl = 90 - a;
      const suppl = 180 - a;
      const useSuppl = Math.random() < 0.5;
      const q = numQ('angles : complémentaires et supplémentaires',
        useSuppl
          ? `Deux angles sont supplémentaires (leur somme fait 180°). Le premier mesure ${a}° (voir le schéma). Quelle est la mesure du second, en degrés ?`
          : `Deux angles sont complémentaires (leur somme fait 90°). Le premier mesure ${a}° (voir le schéma). Quelle est la mesure du second, en degrés ?`,
        useSuppl ? suppl : compl,
        useSuppl ? 'Deux angles supplémentaires ont une somme de 180°. Il suffit de soustraire la mesure connue à 180°.' : 'Deux angles complémentaires ont une somme de 90°. Il suffit de soustraire la mesure connue à 90°.',
        '°');
      q.fig = angleSVG(a);
      return q;
    },
    () => {
      const mesure = ri(1, 179);
      const type = mesure < 90 ? 'aigu' : mesure > 90 ? 'obtus' : 'droit';
      const wrongs = ['aigu', 'droit', 'obtus'].filter(t => t !== type);
      const q = qcm('angles : classer un angle', `Voici un angle. Comment le qualifie-t-on ?`, type, wrongs,
        'Un angle aigu mesure moins de 90°, un angle droit mesure exactement 90°, un angle obtus mesure entre 90° et 180°.');
      q.fig = angleSVG(mesure);
      return q;
    }
  ],

  aires: [
    hard => {
      const L = ri(hard ? 8 : 3, hard ? 25 : 15);
      const l = ri(hard ? 4 : 2, hard ? 15 : 10);
      const q = numQ('aires : aire du rectangle', `Calcule l'aire de ce rectangle.`, L * l,
        'L\'aire d\'un rectangle se calcule avec la formule : longueur × largeur.', 'cm²');
      q.fig = rectSVG(L, l, 'cm');
      return q;
    },
    hard => {
      const L = ri(hard ? 8 : 3, hard ? 25 : 15);
      const l = ri(hard ? 4 : 2, hard ? 15 : 10);
      const q = numQ('aires : périmètre du rectangle', `Calcule le périmètre de ce rectangle.`, 2 * (L + l),
        'Le périmètre d\'un rectangle se calcule avec la formule : 2 × (longueur + largeur).', 'cm');
      q.fig = rectSVG(L, l, 'cm');
      return q;
    },
    hard => {
      const base = ri(hard ? 8 : 4, hard ? 24 : 14) * 2;
      const hauteur = ri(hard ? 4 : 2, hard ? 14 : 8);
      const q = numQ('aires : aire du triangle', `Ce triangle est rectangle. Calcule son aire.`, (base * hauteur) / 2,
        'L\'aire d\'un triangle se calcule avec la formule : (base × hauteur) ÷ 2.', 'cm²');
      q.fig = triSVG(base, hauteur, 'cm');
      return q;
    },
    () => qcm('aires : formules', 'Quelle formule permet de calculer l\'aire d\'un rectangle ?',
      'longueur × largeur', ['2 × (longueur + largeur)', 'longueur + largeur', '(longueur × largeur) ÷ 2'],
      'Le périmètre additionne les côtés (×2), l\'aire d\'un rectangle multiplie longueur et largeur.'),
    () => qcm('aires : formules', 'Quelle formule permet de calculer l\'aire d\'un triangle ?',
      '(base × hauteur) ÷ 2', ['base × hauteur', '2 × (base + hauteur)', 'base + hauteur'],
      'L\'aire d\'un triangle correspond à la moitié de l\'aire du rectangle qui l\'englobe : (base × hauteur) ÷ 2.')
  ],

  volumes: [
    hard => {
      const L = ri(hard ? 6 : 2, hard ? 15 : 8);
      const l = ri(hard ? 4 : 2, hard ? 12 : 6);
      const h = ri(hard ? 3 : 2, hard ? 10 : 5);
      const q = numQ('volumes : pavé droit', `Calcule le volume de ce pavé droit.`, L * l * h,
        'Le volume d\'un pavé droit se calcule avec la formule : longueur × largeur × hauteur.', 'cm³');
      q.fig = paveSVG(L, l, h, 'cm');
      return q;
    },
    () => qcm('volumes : formule', 'Quelle formule permet de calculer le volume d\'un pavé droit ?',
      'longueur × largeur × hauteur', ['2 × (longueur + largeur + hauteur)', 'longueur × largeur', '(longueur × largeur × hauteur) ÷ 2'],
      'Le volume d\'un pavé droit se calcule en multipliant ses trois dimensions : longueur × largeur × hauteur.')
  ],

  stats: [
    hard => {
      const n = hard ? 5 : 4;
      const notes = Array.from({ length: n }, () => ri(4, 18));
      const somme = notes.reduce((a, b) => a + b, 0);
      const moyenne = Math.round((somme / n) * 100) / 100;
      return numQ('statistiques : moyenne', `Voici une série de notes : ${notes.join(', ')}. Calcule la moyenne.`, moyenne,
        'La moyenne s\'obtient en additionnant toutes les valeurs, puis en divisant par le nombre de valeurs.');
    },
    () => {
      const n = 5;
      const notes = Array.from({ length: n }, () => ri(4, 18));
      const max = Math.max(...notes);
      const min = Math.min(...notes);
      const useMax = Math.random() < 0.5;
      return numQ('statistiques : lecture de données', `Voici une série de notes : ${notes.join(', ')}. Quelle est la ${useMax ? 'plus grande' : 'plus petite'} valeur ?`, useMax ? max : min,
        'Relis la série une valeur à la fois et repère la plus ' + (useMax ? 'grande.' : 'petite.'));
    }
  ]
};
