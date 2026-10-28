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
