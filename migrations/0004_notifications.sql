-- Notifications : un abonnement par téléphone (adresse du service de notification + clés du téléphone).
CREATE TABLE abonnements_push (
  endpoint TEXT PRIMARY KEY,         -- adresse fournie par Apple / Google, une par téléphone
  role     TEXT NOT NULL,            -- joueur déduit du code d'accès
  p256dh   TEXT NOT NULL,            -- clé publique du téléphone (base64url)
  auth     TEXT NOT NULL,            -- secret partagé du téléphone (base64url)
  maj      TEXT NOT NULL
);
