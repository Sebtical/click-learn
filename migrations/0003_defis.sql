-- Défis en famille : un quiz figé lancé par un joueur, et la participation de chacun.
-- Les joueurs sont les rôles déduits du code d'accès ('enfant', 'parent1', 'parent2') ;
-- leur surnom est gardé dans profils.prenom.

-- ── Défis (quiz figé, identique pour les trois joueurs) ──
CREATE TABLE defis (
  id        TEXT PRIMARY KEY,
  lance_par TEXT NOT NULL,          -- rôle imposé par le serveur, jamais par le navigateur
  matiere   TEXT,
  titre     TEXT,
  questions TEXT NOT NULL,          -- liste JSON, figures retirées par le serveur
  cree_le   TEXT NOT NULL
);

-- ── Participations (une seule par joueur et par défi) ──
CREATE TABLE participations (
  defi_id    TEXT NOT NULL,
  joueur     TEXT NOT NULL,
  score      INTEGER NOT NULL,
  total      INTEGER NOT NULL,
  reponses   TEXT,                  -- liste JSON [{reponse, correct}] dans l'ordre des questions
  termine_le TEXT NOT NULL,
  PRIMARY KEY (defi_id, joueur)
);

CREATE INDEX idx_defis_cree_le ON defis (cree_le);
