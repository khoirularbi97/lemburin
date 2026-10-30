// Notifikasi lembur di perangkat karyawan.
//   web     : Web Push lewat service worker (PWA). iPhone harus iOS 16.4+ dan
//             lemburin sudah "Tambah ke Layar Utama".
//   android/ios : Firebase Cloud Messaging, hanya kalau build dengan VITE_FCM=true
//             dan google-services.json / GoogleService-Info.plist sudah dipasang
//             (tanpa itu memanggil register() membuat aplikasi Android crash).
//   desktop : tidak didukung Electron, jadi disembunyikan.
import { api } from './api.js';
import { NATIVE_HP, PLATFORM } from './platform.js';

const FCM_AKTIF = import.meta.env.VITE_FCM === 'true';
const KUNCI_TOKEN_FCM = 'lq_fcm';

function iosBelumDipasang() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone;
  return ios && !standalone;
}

/**
 * Apa yang bisa dilakukan di perangkat ini.
 * @returns {'web'|'fcm'|'pasang-dulu'|'tidak'}
 */
export function jenisDukungan() {
  if (NATIVE_HP) return FCM_AKTIF ? 'fcm' : 'tidak';
  if (PLATFORM !== 'web') return 'tidak';
  if (iosBelumDipasang()) return 'pasang-dulu';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'tidak';
  return 'web';
}

function keUint8(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function swSiap() {
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, tolak) => setTimeout(() => tolak(new Error('Service worker belum aktif. Muat ulang halaman lalu coba lagi.')), 8000)),
  ]);
  return reg;
}

function namaPerangkat() {
  const ua = navigator.userAgent;
  const os = /android/i.test(ua) ? 'Android' : /iphone|ipad/i.test(ua) ? 'iOS' : /windows/i.test(ua) ? 'Windows' : /mac/i.test(ua) ? 'macOS' : 'Linux';
  const br = /edg\//i.test(ua) ? 'Edge' : /firefox/i.test(ua) ? 'Firefox' : /chrome/i.test(ua) ? 'Chrome' : /safari/i.test(ua) ? 'Safari' : 'Browser';
  return `${br} · ${os}`;
}

/** true kalau perangkat ini sedang berlangganan. */
export async function statusLangganan() {
  const j = jenisDukungan();
  if (j === 'web') {
    if (Notification.permission !== 'granted') return false;
    const reg = await navigator.serviceWorker.getRegistration();
    return Boolean(await reg?.pushManager.getSubscription());
  }
  if (j === 'fcm') return Boolean(localStorage.getItem(KUNCI_TOKEN_FCM));
  return false;
}

export async function aktifkanNotifikasi(kunciPublik) {
  const j = jenisDukungan();
  if (j === 'web') {
    if (!kunciPublik) throw new Error('Notifikasi belum diaktifkan HRD di server.');
    const izin = await Notification.requestPermission();
    if (izin !== 'granted') throw new Error('Izin notifikasi ditolak. Aktifkan lewat pengaturan situs di browser.');
    const reg = await swSiap();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keUint8(kunciPublik) });
    const json = sub.toJSON();
    await api('/api/portal/push/langganan', { method: 'POST', body: { jenis: 'WEB', endpoint: json.endpoint, keys: json.keys, perangkat: namaPerangkat() } });
    return true;
  }
  if (j === 'fcm') {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const izin = await PushNotifications.requestPermissions();
    if (izin.receive !== 'granted') throw new Error('Izin notifikasi ditolak. Aktifkan di Pengaturan HP → Aplikasi → lemburin.');
    const token = await new Promise((resolve, reject) => {
      let h1; let h2;
      const selesai = () => { h1?.remove(); h2?.remove(); };
      PushNotifications.addListener('registration', (t) => { selesai(); resolve(t.value); }).then((h) => { h1 = h; });
      PushNotifications.addListener('registrationError', (e) => { selesai(); reject(new Error(e.error || 'Gagal mendaftar notifikasi')); }).then((h) => { h2 = h; });
      PushNotifications.register();
    });
    await api('/api/portal/push/langganan', { method: 'POST', body: { jenis: 'FCM', token, perangkat: `Aplikasi ${PLATFORM}` } });
    localStorage.setItem(KUNCI_TOKEN_FCM, token);
    return true;
  }
  throw new Error('Perangkat ini belum mendukung notifikasi.');
}

export async function berhentiLangganan() {
  const j = jenisDukungan();
  if (j === 'web') {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await api('/api/portal/push/langganan', { method: 'DELETE', body: { endpoint: sub.endpoint } }).catch(() => {});
    await sub.unsubscribe();
  } else if (j === 'fcm') {
    const token = localStorage.getItem(KUNCI_TOKEN_FCM);
    if (token) await api('/api/portal/push/langganan', { method: 'DELETE', body: { endpoint: token } }).catch(() => {});
    localStorage.removeItem(KUNCI_TOKEN_FCM);
    const { PushNotifications } = await import('@capacitor/push-notifications');
    await PushNotifications.unregister().catch(() => {});
  }
}

/** Ketuk notifikasi di aplikasi native → buka halaman terkait. */
export async function pasangKlikNotifikasi(buka) {
  if (jenisDukungan() !== 'fcm') return;
  const { PushNotifications } = await import('@capacitor/push-notifications');
  PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
    const url = a.notification?.data?.url;
    if (url?.startsWith('/')) buka(url);
  });
}
