// Service worker de Click&Learn : reste actif sur le téléphone, même appli fermée, pour recevoir les
// notifications (défi lancé, défi terminé) et poser la pastille sur l'icône. Il ne met rien en cache.

// ── Installation : prend la main tout de suite ──
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', evenement => evenement.waitUntil(self.clients.claim()));

// ── Réception d'une notification (déchiffrée par le téléphone) ──
self.addEventListener('push', evenement => {
  let message = {};
  try {
    message = evenement.data ? evenement.data.json() : {};
  } catch {
    // Message illisible : on affiche quand même une notification générique (exigé par l'iPhone)
  }
  const pastille = Number.isInteger(message.badge) && 'setAppBadge' in navigator
    ? (message.badge > 0 ? navigator.setAppBadge(message.badge) : navigator.clearAppBadge()).catch(() => {})
    : Promise.resolve();
  evenement.waitUntil(Promise.all([
    self.registration.showNotification(message.titre || 'Click&Learn', {
      body: message.corps || 'Du nouveau dans tes défis !',
      icon: 'apple-touch-icon.png'
    }),
    pastille
  ]));
});

// ── Toucher une notification : ouvre l'appli (ou la remet au premier plan) ──
self.addEventListener('notificationclick', evenement => {
  evenement.notification.close();
  evenement.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(fenetres => {
    if (fenetres.length) return fenetres[0].focus();
    return self.clients.openWindow('/');
  }));
});
