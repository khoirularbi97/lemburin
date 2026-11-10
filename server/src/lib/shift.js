// Dua shift bergilir per grup (rotasi mingguan). Aturan jam shift ada di aturan lembur (bagian `shift`).
// Per tanggal kerja, petugas/admin menandai "shift 1 lembur" → shift 2 masuk 19.30–03.30, bukan 16.00–24.00.
import { prisma } from './prisma.js';
import { jadwalShift, keTanggalDb, lengkapiAturan } from './lembur.js';

/** Apakah shift 1 ditandai lembur pada tanggal kerja ini. */
export async function shift1LemburPada(db, tanggal) {
  const r = await (db || prisma).hariShift.findUnique({ where: { tanggal: keTanggalDb(tanggal) } });
  return Boolean(r?.shift1Lembur);
}

export async function aturShift1Lembur(db, tanggal, nilai, userId) {
  const data = { shift1Lembur: Boolean(nilai), diubahOlehId: userId ?? null };
  await (db || prisma).hariShift.upsert({ where: { tanggal: keTanggalDb(tanggal) }, update: data, create: { tanggal: keTanggalDb(tanggal), ...data } });
}

/** Jam kerja shift karyawan pada tanggal kerja (null = non-shift / fitur shift mati). */
export async function jamKerjaKaryawan(db, karyawan, tanggal, aturan) {
  const a = lengkapiAturan(aturan);
  if (!a.shift.aktif || !karyawan?.grup) return null;
  return jadwalShift({ grup: karyawan.grup, tanggal, aturan: a, shift1Lembur: await shift1LemburPada(db, tanggal) });
}

/** Ringkasan shift sebuah tanggal kerja untuk layar (null bila fitur shift mati). */
export async function infoShift(db, tanggal, aturan) {
  const a = lengkapiAturan(aturan);
  if (!a.shift.aktif) return null;
  const shift1Lembur = await shift1LemburPada(db, tanggal);
  const grup = Object.fromEntries(a.shift.grup.map((g) => [g, jadwalShift({ grup: g, tanggal, aturan: a, shift1Lembur })]));
  return { aktif: true, gantiHari: a.shift.gantiHari, shift1Lembur, shift2Lembur: { ...a.shift.shift2Lembur }, grup };
}
