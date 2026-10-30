// Ditambahkan ke service worker PWA (lihat vite.config.js → workbox.importScripts).
// Menampilkan notifikasi lembur dan membuka halaman terkait saat diketuk.
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { isi: event.data?.text() }; }
  event.waitUntil(self.registration.showNotification(d.judul || 'lemburin', {
    body: d.isi || '',
    icon: '/pwa-192.png',
    badge: '/pwa-192.png',
    tag: d.tag || undefined,
    renotify: Boolean(d.tag),
    data: { url: d.url || '/portal' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/portal', self.location.origin).href;
  event.waitUntil((async () => {
    const semua = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const ada = semua.find((c) => c.url.startsWith(self.location.origin));
    if (ada) { await ada.focus(); return ada.navigate(url); }
    return self.clients.openWindow(url);
  })());
});
