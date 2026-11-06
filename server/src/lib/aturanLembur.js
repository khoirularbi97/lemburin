// Aturan hitungan jam aktual yang bisa diubah admin (pola kerja, jam pulang, istirahat, pembulatan).
// Disimpan di tabel Pengaturan, kunci "aturanLembur". Bawaan: ATURAN_AKTUAL_BAWAAN di lembur.js.
import { z } from 'zod';
import { prisma } from './prisma.js';
import { ATURAN_AKTUAL_BAWAAN } from './lembur.js';

const KUNCI = 'aturanLembur';
const jam = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format jam harus HH:mm');

export const skemaAturan = z.object({
  polaKerja: z.union([z.literal(5), z.literal(6)]),
  hariTerpendek: z.number().int().min(1).max(6),
  jamPulang: jam,
  jamPulangTerpendek: jam,
  istirahat: z.array(z.object({ mulai: jam, selesai: jam })).max(6),
  pembulatanMenit: z.union([z.literal(1), z.literal(15), z.literal(30), z.literal(60)]),
});

let simpanan = null;
let sejak = 0;

/** Aturan yang berlaku sekarang (disimpan sementara 30 detik). */
export async function ambilAturan(db = prisma) {
  if (simpanan && Date.now() - sejak < 30_000) return simpanan;
  const r = await db.pengaturan.findUnique({ where: { kunci: KUNCI } });
  simpanan = { ...ATURAN_AKTUAL_BAWAAN, ...(r?.nilai || {}) };
  sejak = Date.now();
  return simpanan;
}

export async function simpanAturan(data, db = prisma) {
  const nilai = skemaAturan.parse(data);
  await db.pengaturan.upsert({ where: { kunci: KUNCI }, update: { nilai }, create: { kunci: KUNCI, nilai } });
  simpanan = null;
  return ambilAturan(db);
}

/** Ringkasan aturan untuk disimpan bersama setiap lembur (supaya bisa ditelusuri nanti). */
export function jejakAturan(a) {
  return { polaKerja: a.polaKerja, jamPulang: a.jamPulang, jamPulangTerpendek: a.jamPulangTerpendek, istirahat: a.istirahat, pembulatanMenit: a.pembulatanMenit };
}
