// Notifikasi ke HP/laptop karyawan.
//   WEB : Web Push standar (PWA di Chrome/Edge/Firefox, Android, iPhone iOS 16.4+
//         yang sudah "Tambah ke Layar Utama"). Butuh VAPID_PUBLIC_KEY & VAPID_PRIVATE_KEY.
//   FCM : aplikasi Android/iOS (Capacitor) lewat Firebase Cloud Messaging.
//         Opsional, aktif kalau FIREBASE_SERVICE_ACCOUNT diisi.
// Pengiriman tidak pernah menggagalkan proses utama (scan tetap tercatat walau push gagal).
import webpush from 'web-push';
import { prisma } from './prisma.js';
import { dariTanggalDb, jamWIB } from './lembur.js';

const VAPID_PUBLIK = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_RAHASIA = process.env.VAPID_PRIVATE_KEY || '';
const WEB_AKTIF = Boolean(VAPID_PUBLIK && VAPID_RAHASIA);
if (WEB_AKTIF) {
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@lemburin.local', VAPID_PUBLIK, VAPID_RAHASIA);
}

let fcmSiap; // Promise<Messaging|null>
function fcm() {
  if (fcmSiap) return fcmSiap;
  const mentah = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!mentah) { fcmSiap = Promise.resolve(null); return fcmSiap; }
  fcmSiap = (async () => {
    // Boleh diisi JSON langsung atau JSON yang di-base64 (lebih aman di dashboard Render)
    const teks = mentah.trim().startsWith('{') ? mentah : Buffer.from(mentah, 'base64').toString('utf8');
    const { initializeApp, cert, getApps } = await import('firebase-admin/app');
    const { getMessaging } = await import('firebase-admin/messaging');
    const app = getApps()[0] || initializeApp({ credential: cert(JSON.parse(teks)) });
    return getMessaging(app);
  })().catch((e) => { console.error('[push] Firebase gagal disiapkan:', e.message); return null; });
  return fcmSiap;
}

export function infoPush() {
  return { web: WEB_AKTIF, kunciPublik: WEB_AKTIF ? VAPID_PUBLIK : null, fcm: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT) };
}

/** Kirim ke semua perangkat milik karyawan. Mengembalikan jumlah yang terkirim. */
export async function kirimKeKaryawan(karyawanId, { judul, isi, url = '/portal', tag }) {
  const daftar = await prisma.langgananPush.findMany({ where: { karyawanId } });
  if (!daftar.length) return 0;
  const payload = { judul, isi, url, tag };
  let terkirim = 0;
  const hapus = [];

  await Promise.all(daftar.map(async (l) => {
    try {
      if (l.jenis === 'WEB') {
        if (!WEB_AKTIF) return;
        await webpush.sendNotification(
          { endpoint: l.endpoint, keys: { p256dh: l.p256dh, auth: l.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 24, urgency: 'high', topic: tag ? tag.slice(0, 32).replace(/[^A-Za-z0-9_-]/g, '') : undefined },
        );
      } else if (l.jenis === 'FCM') {
        const m = await fcm();
        if (!m) return;
        await m.send({
          token: l.endpoint,
          notification: { title: judul, body: isi },
          data: { url },
          android: { priority: 'high', notification: { color: '#2CC9A8', tag } },
          apns: { payload: { aps: { sound: 'default', 'thread-id': 'lembur' } } },
        });
      }
      terkirim += 1;
    } catch (e) {
      const mati = [404, 410].includes(e.statusCode)
        || ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(e.code);
      if (mati) hapus.push(l.id); // perangkat sudah berhenti langganan
      else console.error(`[push] gagal ke langganan ${l.id}:`, e.statusCode || e.code || e.message);
    }
  }));

  if (hapus.length) await prisma.langgananPush.deleteMany({ where: { id: { in: hapus } } });
  if (terkirim) {
    await prisma.langgananPush.updateMany({
      where: { karyawanId, id: { notIn: hapus } }, data: { terakhirDipakai: new Date() },
    });
  }
  return terkirim;
}

const rp = (n) => `Rp${Math.round(n).toLocaleString('id-ID')}`;
const jamFmt = (n) => Number(n).toLocaleString('id-ID', { maximumFractionDigits: 1 });
const tgl = (s) => new Date(`${s}T12:00:00Z`).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

function diam(janji) {
  janji.catch((e) => console.error('[push]', e.message));
}

/** Dipanggil setelah tap tersimpan (scan, tap manual, atau pengajuan disetujui). */
export function kabariTapTercatat(karyawan, tap, { manual = false, dariPengajuan = false } = {}) {
  const tanggal = typeof tap.tanggal === 'string' ? tap.tanggal : dariTanggalDb(tap.tanggal);
  const judul = dariPengajuan ? 'Pengajuan lembur disetujui' : manual ? 'Lembur ditambahkan admin' : 'Lembur tercatat';
  diam(kirimKeKaryawan(karyawan.id, {
    judul,
    isi: `${tgl(tanggal)} · ${jamWIB(tap.waktuTap)} WIB · ${jamFmt(tap.jamHitung)} jam hitung · ${rp(tap.nominal)}`,
    url: `/portal/riwayat?bulan=${tanggal.slice(0, 7)}`,
    tag: `tap-${tap.id}`,
  }));
}

export function kabariPengajuanDitolak(pengajuan) {
  const tanggal = dariTanggalDb(pengajuan.tanggal);
  diam(kirimKeKaryawan(pengajuan.karyawanId, {
    judul: 'Pengajuan lembur ditolak',
    isi: `${tgl(tanggal)}${pengajuan.catatanAdmin ? ` · ${pengajuan.catatanAdmin}` : ''}`,
    url: '/portal/pengajuan',
    tag: `pengajuan-${pengajuan.id}`,
  }));
}
