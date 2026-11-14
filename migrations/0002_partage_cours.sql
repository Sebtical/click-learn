-- Contenu des cours partagé avec l'espace parent (jamais les photos) : ajout de colonnes, rien n'est modifié.
ALTER TABLE cours ADD COLUMN type TEXT;          -- 'sur-mesure' pour un cours sur mesure, sinon vide
ALTER TABLE cours ADD COLUMN fiche TEXT;         -- fiche détaillée (texte mis en forme ##, -, **)
ALTER TABLE cours ADD COLUMN carte TEXT;         -- carte mentale en JSON {centre, branches}
ALTER TABLE cours ADD COLUMN explications TEXT;  -- explications d'un cours sur mesure, en JSON
