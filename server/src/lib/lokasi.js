// Lokasi HP saat tap eksklusif. Hanya DICATAT (tidak memblokir): GPS di dalam gedung sering meleset,
// jadi admin yang menilai dari jarak ke titik pabrik.
import { z } from 'zod';
import { prisma } from './prisma.js';

const KUNCI = 'lokasiPabrik';

export const skemaLokasiPabrik = z.object({
  nama: z.string().trim().min(1).max(80).default('Pabrik'),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  /** Batas wajar; tap di luar radius ditandai "jauh" di daftar admin */
  radiusM: z.number().int().min(50).max(20_000).default(300),
}).nullable();

export const skemaLokasiHp = z.union([
  z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), akurasi: z.number().min(0).max(100_000).optional() }),
  z.object({ gagal: z.string().trim().max(120) }),
]).nullable().optional();

let simpanan; let sejak = 0;
export async function ambilLokasiPabrik(db = prisma) {
  if (simpanan !== undefined && Date.now() - sejak < 30_000) return simpanan;
  const r = await db.pengaturan.findUnique({ where: { kunci: KUNCI } });
  simpanan = r?.nilai?.lat != null ? r.nilai : null;
  sejak = Date.now();
  return simpanan;
}
export async function simpanLokasiPabrik(data, db = prisma) {
  const nilai = skemaLokasiPabrik.parse(data);
  if (nilai) await db.pengaturan.upsert({ where: { kunci: KUNCI }, update: { nilai }, create: { kunci: KUNCI, nilai } });
  else await db.pengaturan.deleteMany({ where: { kunci: KUNCI } });
  simpanan = undefined;
  return ambilLokasiPabrik(db);
}

/** Jarak dua titik di permukaan bumi (meter), rumus haversine. */
export function jarakMeter(a, b) {
  const R = 6_371_000; const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat); const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/** Bentuk catatan lokasi yang disimpan: koordinat dibulatkan ±1 m, plus jarak & status terhadap titik pabrik. */
export function catatLokasi(hp, pabrik, waktu = new Date()) {
  if (!hp) return { gagal: 'Tidak dikirim', waktu };
  if (hp.gagal) return { gagal: hp.gagal, waktu };
  const lat = Math.round(hp.lat * 1e5) / 1e5; const lng = Math.round(hp.lng * 1e5) / 1e5;
  const akurasi = hp.akurasi != null ? Math.round(hp.akurasi) : null;
  if (!pabrik) return { lat, lng, akurasi, waktu };
  const jarakM = jarakMeter({ lat, lng }, pabrik);
  // "jauh" hanya kalau di luar radius bahkan setelah memperhitungkan akurasi GPS
  const jauh = jarakM - (akurasi || 0) > pabrik.radiusM;
  return { lat, lng, akurasi, jarakM, jauh, waktu };
}
