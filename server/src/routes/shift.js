// Penanda "shift 1 lembur" per tanggal kerja: petugas/admin menandai supaya shift 2 dihitung masuk 19.30–03.30.
import { Router } from 'express';
import { z } from 'zod';
import { ah, HttpError } from '../lib/util.js';
import { prisma } from '../lib/prisma.js';
import { ambilAturan } from '../lib/aturanLembur.js';
import { polaTanggal, tanggalKerja, waktuJakarta } from '../lib/lembur.js';
import { aturShift1Lembur, infoShift } from '../lib/shift.js';

const router = Router();

async function tanggalDari(q) {
  if (q) { if (!polaTanggal(q)) throw new HttpError(400, 'Format tanggal harus YYYY-MM-DD'); return q; }
  const w = waktuJakarta();
  return tanggalKerja(w.tanggal, w.jam, await ambilAturan());
}

router.get('/hari', ah(async (req, res) => {
  const tanggal = await tanggalDari(req.query.tanggal);
  res.json({ tanggal, shift: await infoShift(prisma, tanggal, await ambilAturan()) });
}));

router.put('/hari', ah(async (req, res) => {
  const d = z.object({ tanggal: z.string().optional(), shift1Lembur: z.boolean() }).parse(req.body);
  const tanggal = await tanggalDari(d.tanggal);
  const aturan = await ambilAturan();
  if (!aturan.shift?.aktif) throw new HttpError(400, 'Fitur shift belum diaktifkan admin.');
  await aturShift1Lembur(prisma, tanggal, d.shift1Lembur, req.user.id);
  res.json({ tanggal, shift: await infoShift(prisma, tanggal, aturan) });
}));

export default router;
