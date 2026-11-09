-- Structure initiale de la base Click&Learn (D1, stockage restreint à l'UE).
-- Appliquée avec : npx.cmd wrangler d1 migrations apply click-learn --local (puis --remote)

-- ── Profil de l'enfant (une ligne par rôle) ──
CREATE TABLE profils (
  role   TEXT PRIMARY KEY,          -- 'enfant' pour l'instant
  prenom TEXT,
  niveau TEXT,
  maj    TEXT NOT NULL              -- date de dernière mise à jour (ISO)
);

-- ── Réponses aux questions et exercices ──
-- id vient du navigateur : renvoyer la même réponse deux fois ne crée pas de doublon.
CREATE TABLE tentatives (
  id             TEXT PRIMARY KEY,
  joueur         TEXT NOT NULL,     -- imposé par le serveur à partir du code, jamais par le navigateur
  quiz_id        TEXT,
  question_id    TEXT,
  matiere        TEXT,
  theme          TEXT,
  notion         TEXT,
  type           TEXT,
  correct        INTEGER NOT NULL,  -- 1 = juste du premier coup, 0 = faux
  date           TEXT NOT NULL,
  enonce         TEXT,
  reponse_donnee TEXT,              -- absente pour l'historique antérieur à cette version
  bonne_reponse  TEXT
);
CREATE INDEX idx_tentatives_joueur_date ON tentatives (joueur, date);

-- ── Résumés de cours (jamais les photos) ──
CREATE TABLE cours (
  id      TEXT PRIMARY KEY,
  joueur  TEXT NOT NULL,
  matiere TEXT,
  titre   TEXT,
  resume  TEXT,
  notions TEXT,                     -- liste en JSON
  date    TEXT NOT NULL
);
