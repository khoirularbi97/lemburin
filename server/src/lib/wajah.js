// Verifikasi wajah untuk tap mandiri. Wajah dibaca di HP karyawan menjadi 128 angka (vektor);
// server hanya membandingkan vektor itu dengan vektor acuan yang sudah disetujui admin.
// Foto wajah tidak dikirim saat tap — hanya saat pendaftaran (untuk diperiksa admin).
import { HttpError } from './util.js';

export const PANJANG_VEKTOR = 128;
// Jarak Euclid antar-vektor. Model face-api: < 0,6 biasanya orang yang sama. Dibuat lebih ketat (uji: dua orang berbeda bisa berjarak ±0,51).
export const AMBANG_WAJAH = Number(process.env.WAJAH_AMBANG) || 0.45;

export function bacaVektor(v) {
  if (!Array.isArray(v) || v.length !== PANJANG_VEKTOR || !v.every((x) => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) < 2)) {
    throw new HttpError(400, 'Data wajah tidak valid. Ulangi verifikasi wajah.');
  }
  return v.map((x) => Math.round(x * 1e6) / 1e6);
}

export function jarakWajah(a, b) {
  let s = 0;
  for (let i = 0; i < PANJANG_VEKTOR; i += 1) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s);
}

export function bacaFotoWajah(dataUrl) {
  const m = /^data:(image\/(?:webp|jpeg));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new HttpError(400, 'Foto wajah harus gambar WEBP atau JPEG.');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 120_000) throw new HttpError(413, 'Foto wajah terlalu besar.');
  return { mime: m[1], buf };
}
