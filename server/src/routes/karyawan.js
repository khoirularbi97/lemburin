import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ah, buatTokenQr, HttpError } from '../lib/util.js';
import { upahSejam } from '../lib/lembur.js';

const router = Router();

export const DEPARTEMEN = ['Painting Line 1', 'Painting Line 2', 'Injection', 'QC', 'Warehouse'];

const skemaKaryawan = z.object({
  nama: z.string().trim().min(2, 'Nama minimal 2 huruf'),
  nik: z.string().trim().toUpperCase().min(3, 'NIK wajib diisi'),
  departemen: z.string().trim().min(1),
  jabatan: z.string().trim().default('Operator'),
  upahBulanan: z.coerce.number().int().min(1_000_000, 'Upah minimal Rp1.000.000'),
});

function bentuk(k) {
  return { ...k, upahSejam: upahSejam(k.upahBulanan) };
}

router.get('/departemen', (req, res) => res.json(DEPARTEMEN));

router.get('/', ah(async (req, res) => {
  const list = await prisma.karyawan.findMany({ orderBy: { nama: 'asc' } });
  res.json(list.map(bentuk));
}));

router.post('/', ah(async (req, res) => {
  const data = skemaKaryawan.parse(req.body);
  const k = await prisma.karyawan.create({ data: { ...data, qrToken: buatTokenQr() } });
  res.status(201).json(bentuk(k));
}));

router.put('/:id', ah(async (req, res) => {
  const id = Number(req.params.id);
  const data = skemaKaryawan.parse(req.body);
  const k = await prisma.karyawan.update({ where: { id }, data });
  res.json(bentuk(k));
}));

router.patch('/:id/aktif', ah(async (req, res) => {
  const id = Number(req.params.id);
  const { aktif } = z.object({ aktif: z.boolean() }).parse(req.body);
  const k = await prisma.karyawan.update({ where: { id }, data: { aktif } });
  res.json(bentuk(k));
}));

// Ganti QR: token lama disimpan agar scanner bisa menolak dengan pesan yang jelas
router.post('/:id/ganti-qr', ah(async (req, res) => {
  const id = Number(req.params.id);
  const lama = await prisma.karyawan.findUnique({ where: { id } });
  if (!lama) throw new HttpError(404, 'Karyawan tidak ditemukan.');
  const [, k] = await prisma.$transaction([
    prisma.qrTokenLama.create({ data: { token: lama.qrToken, karyawanId: id } }),
    prisma.karyawan.update({ where: { id }, data: { qrToken: buatTokenQr(), perluCetakUlang: true } }),
  ]);
  res.json(bentuk(k));
}));

router.post('/:id/sudah-dicetak', ah(async (req, res) => {
  const id = Number(req.params.id);
  const k = await prisma.karyawan.update({ where: { id }, data: { perluCetakUlang: false } });
  res.json(bentuk(k));
}));

export default router;
