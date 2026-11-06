// QR dinamis yang ditampilkan di HP petugas/admin dan dipindai karyawan untuk tap in / tap out mandiri.
// Isinya bertanda tangan (HMAC) dan berganti tiap PERIODE_DETIK, jadi foto/screenshot QR cepat kedaluwarsa.
import crypto from 'node:crypto';

export const PERIODE_DETIK = 10;
// Hanya QR yang sedang tampil dan satu sebelumnya yang diterima: foto QR yang diteruskan lewat chat
// paling lama berlaku ±10–20 detik.
const TOLERANSI_SLOT = 1;
const AWALAN = 'LQM1';

const rahasia = () => `${process.env.QR_MANDIRI_SECRET || process.env.JWT_SECRET}:qr-mandiri`;
const slotSekarang = (ms = Date.now()) => Math.floor(ms / 1000 / PERIODE_DETIK);
const tanda = (userId, slot) => crypto.createHmac('sha256', rahasia()).update(`${userId}.${slot}`).digest('base64url').slice(0, 22);

/** QR untuk petugas/admin `userId` pada saat ini. */
export function buatQrMandiri(userId, ms = Date.now()) {
  const slot = slotSekarang(ms);
  const berganti = (slot + 1) * PERIODE_DETIK * 1000;
  return { isi: `${AWALAN}.${userId}.${slot}.${tanda(userId, slot)}`, berlakuSampai: new Date(berganti).toISOString(), periodeDetik: PERIODE_DETIK, sisaMs: berganti - ms };
}

/**
 * Periksa isi QR yang dipindai karyawan.
 * @returns {{ok:true, userId:number} | {ok:false, kode:string, pesan:string}}
 */
export function periksaQrMandiri(isi, ms = Date.now()) {
  const p = String(isi || '').trim().split('.');
  if (p.length !== 4 || p[0] !== AWALAN) {
    return { ok: false, kode: 'QR_BUKAN_MANDIRI', pesan: 'Ini bukan QR lembur dari HP petugas. Pindai QR yang tampil di aplikasi petugas.' };
  }
  const userId = Number(p[1]); const slot = Number(p[2]);
  if (!Number.isInteger(userId) || !Number.isInteger(slot)) return { ok: false, kode: 'QR_RUSAK', pesan: 'QR tidak terbaca dengan benar. Pindai ulang.' };
  const harus = Buffer.from(tanda(userId, slot)); const ada = Buffer.from(p[3]);
  if (harus.length !== ada.length || !crypto.timingSafeEqual(harus, ada)) return { ok: false, kode: 'QR_PALSU', pesan: 'QR tidak sah.' };
  const kini = slotSekarang(ms);
  if (slot > kini + 1 || kini - slot > TOLERANSI_SLOT) {
    return { ok: false, kode: 'QR_KEDALUWARSA', pesan: 'QR sudah kedaluwarsa. Pindai QR terbaru langsung dari layar HP petugas.' };
  }
  return { ok: true, userId };
}
