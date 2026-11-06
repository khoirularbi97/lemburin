// Admin: persetujuan wajah karyawan, tap in yang masih berjalan, dan aturan hitung jam aktual.
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ah, HttpError, ringkasKaryawan } from '../lib/util.js';
import { dariTanggalDb, jamWIB } from '../lib/lembur.js';
import { ambilAturan, simpanAturan } from '../lib/aturanLembur.js';
import { ATURAN_AKTUAL_BAWAAN } from '../lib/lembur.js';

const router = Router();

// ---------- aturan ----------
router.get('/aturan', ah(async (req, res) => {
  res.json({ aturan: await ambilAturan(), bawaan: ATURAN_AKTUAL_BAWAAN });
}));
router.put('/aturan', ah(async (req, res) => {
  res.json({ aturan: await simpanAturan(req.body) });
}));

// ---------- wajah ----------
router.get('/wajah', ah(async (req, res) => {
  const status = ['MENUNGGU', 'DISETUJUI', 'DITOLAK'].includes(req.query.status) ? req.query.status : 'MENUNGGU';
  const [list, jumlah] = await Promise.all([
    prisma.wajahKaryawan.findMany({ where: { status }, include: { karyawan: true }, orderBy: { updatedAt: 'desc' }, take: 200 }),
    prisma.wajahKaryawan.count({ where: { status: 'MENUNGGU' } }),
  ]);
  res.json({
    menunggu: jumlah,
    list: list.map((w) => ({
      karyawan: ringkasKaryawan(w.karyawan), status: w.status, catatan: w.catatan,
      didaftarkan: w.updatedAt, persetujuan: w.persetujuan, diprosesPada: w.diprosesPada,
    })),
  });
}));

router.get('/wajah/:karyawanId/foto', ah(async (req, res) => {
  const w = await prisma.wajahKaryawan.findUnique({ where: { karyawanId: Number(req.params.karyawanId) } });
  if (!w) throw new HttpError(404, 'Data wajah tidak ada.');
  res.set('Content-Type', w.fotoMime);
  res.set('Cache-Control', 'private, no-store');
  res.send(Buffer.from(w.foto));
}));

const skemaProses = z.object({ setuju: z.boolean(), catatan: z.string().trim().max(200).optional().nullable() });
router.post('/wajah/:karyawanId', ah(async (req, res) => {
  const d = skemaProses.parse(req.body);
  if (!d.setuju && !d.catatan) throw new HttpError(400, 'Tulis alasan penolakan supaya karyawan tahu harus memperbaiki apa.');
  const id = Number(req.params.karyawanId);
  const w = await prisma.wajahKaryawan.findUnique({ where: { karyawanId: id } });
  if (!w) throw new HttpError(404, 'Data wajah tidak ada.');
  const baru = await prisma.wajahKaryawan.update({
    where: { karyawanId: id },
    data: { status: d.setuju ? 'DISETUJUI' : 'DITOLAK', catatan: d.catatan || null, diprosesOlehId: req.user.id, diprosesPada: new Date() },
  });
  res.json({ status: baru.status });
}));

// Hapus data wajah (mis. karyawan keluar, atau perlu daftar ulang)
router.delete('/wajah/:karyawanId', ah(async (req, res) => {
  await prisma.wajahKaryawan.deleteMany({ where: { karyawanId: Number(req.params.karyawanId) } });
  res.status(204).end();
}));

// ---------- tap in yang belum di-tap out ----------
router.get('/sesi', ah(async (req, res) => {
  const list = await prisma.sesiLembur.findMany({
    include: { karyawan: true, petugas: { select: { username: true, nama: true } } },
    orderBy: { mulai: 'asc' },
  });
  const kini = Date.now();
  res.json(list.map((s) => ({
    id: s.id, tanggal: dariTanggalDb(s.tanggal), jamMulai: jamWIB(s.mulai), mulai: s.mulai,
    menitBerjalan: Math.floor((kini - s.mulai) / 60000), karyawan: ringkasKaryawan(s.karyawan), petugas: s.petugas?.username,
  })));
}));

router.delete('/sesi/:id', ah(async (req, res) => {
  const r = await prisma.sesiLembur.deleteMany({ where: { id: Number(req.params.id) } });
  if (!r.count) throw new HttpError(404, 'Tap in tidak ditemukan.');
  res.status(204).end();
}));

export default router;
