// Admin: persetujuan wajah karyawan, tap in yang masih berjalan, dan aturan hitung jam aktual.
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ah, HttpError, ringkasKaryawan } from '../lib/util.js';
import { dariTanggalDb, jamWIB } from '../lib/lembur.js';
import { ambilAturan, simpanAturan } from '../lib/aturanLembur.js';
import { ATURAN_AKTUAL_BAWAAN } from '../lib/lembur.js';
import { ambilLokasiPabrik, simpanLokasiPabrik } from '../lib/lokasi.js';

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

// ---------- tap eksklusif: izin per karyawan + titik lokasi pabrik ----------
router.get('/eksklusif', ah(async (req, res) => {
  const kini = new Date();
  const [izin, lokasi, tap] = await Promise.all([
    prisma.karyawan.findMany({ where: { eksklusifSampai: { not: null } }, orderBy: { nama: 'asc' } }),
    ambilLokasiPabrik(),
    prisma.lembur.findMany({ where: { sumber: 'EKSKLUSIF' }, include: { karyawan: true }, orderBy: { waktuTap: 'desc' }, take: 100 }),
  ]);
  res.json({
    lokasiPabrik: lokasi,
    izin: izin.map((k) => ({
      karyawan: ringkasKaryawan(k), sampai: k.eksklusifSampai, alasan: k.eksklusifAlasan,
      berlaku: new Date(k.eksklusifSampai) >= kini, aktif: k.aktif,
    })),
    tap: tap.map((t) => ({
      id: t.id, tanggal: dariTanggalDb(t.tanggal), karyawan: ringkasKaryawan(t.karyawan), jam: jamWIB(t.waktuTap),
      jenisHari: t.jenisHari, jamHitung: t.jamHitung, nominal: t.nominal, lokasi: t.rincianHitung?.lokasi || null,
    })),
  });
}));

const skemaIzin = z.object({
  sampai: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD'),
  alasan: z.string().trim().min(3, 'Tulis alasan pemberian izin.').max(200),
});

// Beri / perpanjang izin. Berlaku sampai akhir hari `sampai` (WIB).
router.put('/eksklusif/:karyawanId', ah(async (req, res) => {
  const d = skemaIzin.parse(req.body);
  const sampai = new Date(`${d.sampai}T23:59:59.999+07:00`);
  if (Number.isNaN(sampai.getTime()) || sampai < new Date()) throw new HttpError(400, 'Tanggal berlaku harus hari ini atau setelahnya.');
  const maks = new Date(Date.now() + 366 * 86400000);
  if (sampai > maks) throw new HttpError(400, 'Izin paling lama 1 tahun. Perpanjang lagi nanti.');
  const k = await prisma.karyawan.findUnique({ where: { id: Number(req.params.karyawanId) } });
  if (!k) throw new HttpError(404, 'Karyawan tidak ditemukan.');
  const u = await prisma.karyawan.update({ where: { id: k.id }, data: { eksklusifSampai: sampai, eksklusifAlasan: d.alasan, eksklusifOlehId: req.user.id } });
  res.json({ karyawan: ringkasKaryawan(u), sampai: u.eksklusifSampai, alasan: u.eksklusifAlasan });
}));

router.delete('/eksklusif/:karyawanId', ah(async (req, res) => {
  const id = Number(req.params.karyawanId);
  const k = await prisma.karyawan.findUnique({ where: { id } });
  if (!k) throw new HttpError(404, 'Karyawan tidak ditemukan.');
  await prisma.karyawan.update({ where: { id }, data: { eksklusifSampai: null, eksklusifAlasan: null, eksklusifOlehId: null } });
  res.status(204).end();
}));

router.put('/lokasi-pabrik', ah(async (req, res) => {
  res.json({ lokasiPabrik: await simpanLokasiPabrik(req.body?.lokasiPabrik ?? null) });
}));

export default router;
