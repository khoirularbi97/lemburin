import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ah, HttpError } from '../lib/util.js';
import { dariTanggalDb, keTanggalDb, polaTanggal } from '../lib/lembur.js';
import { wajibPeran } from '../middleware/auth.js';

const router = Router();

router.get('/', ah(async (req, res) => {
  const list = await prisma.hariLibur.findMany({ orderBy: { tanggal: 'asc' } });
  res.json(list.map((h) => ({ tanggal: dariTanggalDb(h.tanggal), keterangan: h.keterangan })));
}));

const skemaLibur = z.object({
  tanggal: z.string().refine(polaTanggal, 'Format tanggal harus YYYY-MM-DD'),
  keterangan: z.string().trim().min(2, 'Keterangan wajib diisi'),
});

// Tambah atau ubah keterangan. Tap yang sudah tercatat tidak ikut berubah.
router.post('/', wajibPeran('ADMIN'), ah(async (req, res) => {
  const { tanggal, keterangan } = skemaLibur.parse(req.body);
  const h = await prisma.hariLibur.upsert({
    where: { tanggal: keTanggalDb(tanggal) },
    update: { keterangan },
    create: { tanggal: keTanggalDb(tanggal), keterangan },
  });
  res.status(201).json({ tanggal: dariTanggalDb(h.tanggal), keterangan: h.keterangan });
}));

router.delete('/:tanggal', wajibPeran('ADMIN'), ah(async (req, res) => {
  const { tanggal } = req.params;
  if (!polaTanggal(tanggal)) throw new HttpError(400, 'Format tanggal harus YYYY-MM-DD');
  await prisma.hariLibur.delete({ where: { tanggal: keTanggalDb(tanggal) } });
  res.status(204).end();
}));

export default router;
