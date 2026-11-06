// Notifikasi ke HP/laptop karyawan.
//   WEB : Web Push standar (PWA di Chrome/Edge/Firefox, Android, iPhone iOS 16.4+
//         yang sudah "Tambah ke Layar Utama"). Butuh VAPID_PUBLIC_KEY & VAPID_PRIVATE_KEY.
//   FCM : aplikasi Android/iOS (Capacitor) lewat Firebase Cloud Messaging.
//         Opsional, aktif kalau FIREBASE_SERVICE_ACCOUNT diisi.
// Pengiriman tidak pernah menggagalkan proses utama (scan tetap tercatat walau push gagal).
import webpush from 'web-push';
import { prisma } from './prisma.js';
import { dariTanggalDb, jamWIB, periodeDari } from './lembur.js';

const VAPID_PUBLIK = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_RAHASIA = process.env.VAPID_PRIVATE_KEY || '';
const WEB_AKTIF = Boolean(VAPID_PUBLIK && VAPID_RAHASIA);
if (WEB_AKTIF) {
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@lemburin.local', VAPID_PUBLIK, VAPID_RAHASIA);
}

let fcmSiap; // Promise<Messaging|null>
let fcmGalat = null; // pesan error terakhir saat menyiapkan Firebase (untuk diagnosa)
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
  })().catch((e) => {
    fcmGalat = e instanceof SyntaxError
      ? 'FIREBASE_SERVICE_ACCOUNT bukan JSON yang valid. Tempel seluruh isi file service account (atau versi base64-nya).'
      : /private key/i.test(e.message)
        ? 'Private key di FIREBASE_SERVICE_ACCOUNT rusak (biasanya karena baris baru hilang saat ditempel). Pakai versi base64: base64 -w0 file.json.'
        : e.message;
    console.error('[push] Firebase gagal disiapkan:', fcmGalat);
    return null;
  });
  return fcmSiap;
}

/** Untuk halaman diagnosa: apakah Firebase benar-benar siap dipakai. */
export async function statusFcm() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) return { siap: false, galat: 'FIREBASE_SERVICE_ACCOUNT belum diisi di server (Render → Environment).' };
  const m = await fcm();
  return { siap: Boolean(m), galat: m ? null : fcmGalat };
}

/** Terjemahkan error pengiriman ke bahasa yang bisa ditindaklanjuti. */
function jelaskanGalat(e) {
  const k = e.code || e.errorInfo?.code || '';
  if (k === 'messaging/registration-token-not-registered' || k === 'messaging/invalid-registration-token') return 'Token perangkat sudah tidak berlaku. Tekan Aktifkan notifikasi lagi.';
  if (k === 'messaging/mismatched-credential' || k === 'messaging/sender-id-mismatch' || /SenderId mismatch/i.test(e.message)) return 'google-services.json di APK dan service account di Render berasal dari project Firebase yang berbeda.';
  if (k === 'messaging/third-party-auth-error') return 'Firebase menolak kredensial (cek APNs untuk iOS).';
  if (/invalid_grant|account not found|Invalid JWT/i.test(e.message)) return 'Service account Firebase tidak valid atau sudah dihapus. Buat private key baru.';
  if (/Firebase Cloud Messaging API|has not been used|disabled/i.test(e.message)) return 'Firebase Cloud Messaging API (V1) belum aktif di Google Cloud project ini.';
  if (e.statusCode) return `Layanan push menjawab ${e.statusCode}.`;
  return e.message || String(k);
}

export function infoPush() {
  return { web: WEB_AKTIF, kunciPublik: WEB_AKTIF ? VAPID_PUBLIK : null, fcm: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT) };
}

/** Kirim ke semua perangkat milik karyawan. Mengembalikan jumlah yang terkirim. */
/** Kotak masuk + push. Kotak masuk selalu terisi, push hanya kalau perangkat berlangganan. */
export async function kirimKeKaryawan(karyawanId, pesan) {
  await prisma.notifikasi.create({ data: { karyawanId, judul: pesan.judul, isi: pesan.isi, url: pesan.url || '/portal' } });
  return kirimPush(karyawanId, pesan);
}

/** Hanya push ke perangkat (tanpa menyimpan ke kotak masuk). Mengembalikan jumlah terkirim. */
export async function kirimPush(karyawanId, pesan) {
  return (await kirimPushRinci(karyawanId, pesan)).terkirim;
}

/** Sama dengan kirimPush, tapi mengembalikan rincian per perangkat (untuk tombol Kirim uji). */
export async function kirimPushRinci(karyawanId, { judul, isi, url = '/portal', tag }) {
  const daftar = await prisma.langgananPush.findMany({ where: { karyawanId } });
  const rincian = [];
  if (!daftar.length) return { terkirim: 0, rincian };
  const payload = { judul, isi, url, tag };
  let terkirim = 0;
  const hapus = [];

  await Promise.all(daftar.map(async (l) => {
    try {
      if (l.jenis === 'WEB') {
        if (!WEB_AKTIF) { rincian.push({ jenis: l.jenis, perangkat: l.perangkat, ok: false, pesan: 'Kunci VAPID belum diisi di server.' }); return; }
        await webpush.sendNotification(
          { endpoint: l.endpoint, keys: { p256dh: l.p256dh, auth: l.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 24, urgency: 'high', topic: tag ? tag.slice(0, 32).replace(/[^A-Za-z0-9_-]/g, '') : undefined },
        );
      } else if (l.jenis === 'FCM') {
        const m = await fcm();
        if (!m) { rincian.push({ jenis: l.jenis, perangkat: l.perangkat, ok: false, pesan: fcmGalat || 'Firebase belum siap di server.' }); return; }
        await m.send({
          token: l.endpoint,
          notification: { title: judul, body: isi },
          data: { url },
          // channelId 'lembur' dibuat aplikasi dengan prioritas tinggi → muncul sebagai pop-up (heads-up)
          android: { priority: 'high', notification: { channelId: 'lembur', color: '#2CC9A8', icon: 'ic_stat_lemburin', tag } },
          apns: { payload: { aps: { sound: 'default', 'thread-id': 'lembur' } } },
        });
      }
      terkirim += 1;
      rincian.push({ jenis: l.jenis, perangkat: l.perangkat, ok: true });
    } catch (e) {
      rincian.push({ jenis: l.jenis, perangkat: l.perangkat, ok: false, pesan: jelaskanGalat(e) });
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
  return { terkirim, rincian };
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
    isi: `${tgl(tanggal)} · ${tap.mulai ? `${jamWIB(tap.mulai)}–${jamWIB(tap.selesai)}` : jamWIB(tap.waktuTap)} WIB · ${jamFmt(tap.jamHitung)} jam hitung · ${rp(tap.nominal)}`,
    url: `/portal/riwayat?bulan=${periodeDari(tanggal)}`,
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
