// Notifications de ce téléphone : service worker, abonnement auprès du serveur, pastille sur l'icône.
// Sur iPhone, elles ne fonctionnent que dans l'appli installée sur l'écran d'accueil (iOS 16.4+).

// ── Disponibilité ──

// Vrai si ce navigateur sait recevoir des notifications (sur iPhone : appli installée seulement).
function notificationsPossibles() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// État affichable : 'impossible', 'a-proposer', 'actives' ou 'refusees'.
function etatNotifications() {
  if (!notificationsPossibles()) return 'impossible';
  if (Notification.permission === 'granted') return 'actives';
  if (Notification.permission === 'denied') return 'refusees';
  return 'a-proposer';
}

// ── Abonnement ──

// Décode une clé base64url (format de la clé publique du serveur) en octets.
function octetsBase64Url(texte) {
  const b64 = texte.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64 + '='.repeat((4 - b64.length % 4) % 4)), c => c.charCodeAt(0));
}

// Enregistre le service worker (sans effet si le navigateur ne le permet pas).
async function enregistrerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('sw.js');
  } catch {
    return null;
  }
}

// Abonne ce téléphone (ou renouvelle son abonnement) et le transmet au serveur.
async function abonnerTelephone(accessCode) {
  const enregistrement = await navigator.serviceWorker.ready;
  const existant = await enregistrement.pushManager.getSubscription();
  const abonnement = existant || await enregistrement.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: octetsBase64Url((await demanderCleNotifications(accessCode)).cle)
  });
  await envoyerAbonnement(accessCode, abonnement.toJSON());
}

// Bouton « Activer les notifications » : la demande d'autorisation doit suivre directement le toucher.
async function activerNotifications(accessCode) {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('notifications refusées sur ce téléphone');
  await abonnerTelephone(accessCode);
}

// Au démarrage : si les notifications sont déjà autorisées, s'assure que le serveur connaît ce téléphone.
async function verifierAbonnement(accessCode) {
  if (etatNotifications() !== 'actives') return;
  try {
    await abonnerTelephone(accessCode);
  } catch {
    // Hors ligne ou serveur indisponible : nouvel essai au prochain démarrage
  }
}

// ── Pastille ──

// Affiche sur l'icône le nombre de défis en attente (efface la pastille à zéro).
function mettreAJourPastille(nombre) {
  if (!('setAppBadge' in navigator)) return;
  (nombre > 0 ? navigator.setAppBadge(nombre) : navigator.clearAppBadge()).catch(() => {});
}

// Carte d'accueil qui propose d'activer les notifications (rien si impossible, déjà fait ou masqué).
function carteNotificationsHtml() {
  if (etatNotifications() !== 'a-proposer' || state.notificationsMasquees) return '';
  return `<section class="card info-contenu">
        <p>🔔 <strong>Sois prévenu·e des défis :</strong> active les notifications pour savoir quand on te lance un défi ou quand un joueur a terminé.</p>
        <div class="actions">
          <button id="notifs-activer">Activer les notifications</button>
          <button id="notifs-plus-tard" class="secondary">Plus tard</button>
        </div>
        <p id="notifs-erreur" class="error"></p>
      </section>`;
}
