import crypto from 'node:crypto';

/** Bungkus handler async supaya error diteruskan ke error middleware Express 4. */
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Token QR acak: tidak bisa ditebak dari NIK dan tidak bisa dibuat sendiri. */
export function buatTokenQr() {
  return `LMB-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
}

export function buatSandiSementara() {
  return crypto.randomBytes(5).toString('base64url');
}

/** Sandi awal portal karyawan: 8 karakter tanpa huruf/angka yang mirip (0/O, 1/I/L). */
export function buatSandiAwal() {
  const abjad = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const b = crypto.randomBytes(8);
  return Array.from(b, (x) => abjad[x % abjad.length]).join('');
}

/** Aturan sandi buatan karyawan sendiri. Mengembalikan pesan error atau null. */
export function cekSandiBaru(sandi, { nik, lama } = {}) {
  if (typeof sandi !== 'string' || sandi.length < 8) return 'Sandi baru minimal 8 karakter.';
  if (sandi.length > 72) return 'Sandi baru maksimal 72 karakter.';
  if (!/[A-Za-z]/.test(sandi) || !/\d/.test(sandi)) return 'Sandi baru harus berisi huruf dan angka.';
  if (nik && sandi.toUpperCase().includes(nik.toUpperCase())) return 'Sandi tidak boleh berisi NIK.';
  if (lama && sandi === lama) return 'Sandi baru harus berbeda dari sandi lama.';
  return null;
}

export class HttpError extends Error {
  constructor(status, pesan, extra = {}) {
    super(pesan);
    this.status = status;
    this.extra = extra;
  }
}

export function ringkasKaryawan(k) {
  if (!k) return null;
  return { id: k.id, nik: k.nik, nama: k.nama, departemen: k.departemen, jabatan: k.jabatan };
}
