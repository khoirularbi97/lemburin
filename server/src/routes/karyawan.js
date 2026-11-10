import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import bcrypt from 'bcryptjs';
import { ah, buatSandiAwal, buatTokenQr, HttpError } from '../lib/util.js';
import { upahSejam } from '../lib/lembur.js';

const router = Router();

export const DEPARTEMEN = ['Painting Line 1', 'Painting Line 2', 'Injection', 'QC', 'Warehouse'];

const skemaKaryawan = z.object({
  nama: z.string().trim().min(2, 'Nama minimal 2 huruf'),
  nik: z.string().trim().toUpperCase().min(3, 'NIK wajib diisi'),
  departemen: z.string().trim().min(1),
  jabatan: z.string().trim().default('Operator'),
  upahBulanan: z.coerce.number().int().min(1_000_000, 'Upah minimal Rp1.000.000'),
  // Grup shift (rotasi mingguan shift 1 / shift 2); kosong = non-shift
  grup: z.string().trim().toUpperCase().max(10).nullable().optional().transform((g) => g || null),
});

// sandiHash tidak pernah dikirim ke browser
function bentuk({ sandiHash, sandiDiubah, ...k }) {
  return {
    ...k,
    upahSejam: upahSejam(k.upahBulanan),
    portal: { aktif: Boolean(sandiHash), sandiAwal: Boolean(sandiHash) && k.wajibGantiSandi, loginTerakhir: k.loginTerakhir },
  };
}

/** Sandi awal portal: hanya ditampilkan sekali ke admin, yang disimpan hanya hash-nya. */
async function dataSandiAwal() {
  const sandi = buatSandiAwal();
  return { sandi, data: { sandiHash: await bcrypt.hash(sandi, 10), wajibGantiSandi: true, sandiDiubah: new Date() } };
}

router.get('/departemen', (req, res) => res.json(DEPARTEMEN));

router.get('/', ah(async (req, res) => {
  const list = await prisma.karyawan.findMany({ orderBy: { nama: 'asc' } });
  res.json(list.map(bentuk));
}));

router.post('/', ah(async (req, res) => {
  const data = skemaKaryawan.parse(req.body);
  const awal = await dataSandiAwal();
  const k = await prisma.karyawan.create({ data: { ...data, ...awal.data, qrToken: buatTokenQr() } });
  res.status(201).json({ ...bentuk(k), sandiAwal: awal.sandi });
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

// Aktifkan / reset akun portal karyawan (lupa sandi). Semua sesi login lamanya berakhir.
router.post('/:id/sandi-portal', ah(async (req, res) => {
  const id = Number(req.params.id);
  const awal = await dataSandiAwal();
  const k = await prisma.karyawan.update({ where: { id }, data: awal.data });
  res.json({ ...bentuk(k), sandiAwal: awal.sandi });
}));

router.post('/:id/sudah-dicetak', ah(async (req, res) => {
  const id = Number(req.params.id);
  const k = await prisma.karyawan.update({ where: { id }, data: { perluCetakUlang: false } });
  res.json(bentuk(k));
}));

/** Data yang ikut terhapus bila karyawan dihapus. */
async function ringkasanHapus(id) {
  const [lembur, pengajuan, sesi, wajah] = await Promise.all([
    prisma.lembur.count({ where: { karyawanId: id } }),
    prisma.pengajuanTap.count({ where: { karyawanId: id } }),
    prisma.sesiLembur.count({ where: { karyawanId: id } }),
    prisma.wajahKaryawan.count({ where: { karyawanId: id } }),
  ]);
  return { lembur, pengajuan, sesi, wajah };
}

router.get('/:id/ringkasan-hapus', ah(async (req, res) => {
  res.json(await ringkasanHapus(Number(req.params.id)));
}));

// Hapus permanen. Kalau karyawan sudah punya catatan lembur, admin wajib mengetik NIK-nya sebagai konfirmasi,
// karena riwayat lembur, slip, dan pengajuannya ikut terhapus. Untuk karyawan yang keluar, Nonaktifkan lebih aman.
router.delete('/:id', ah(async (req, res) => {
  const id = Number(req.params.id);
  const { konfirmasiNik } = z.object({ konfirmasiNik: z.string().trim().toUpperCase().optional() }).parse(req.body || {});
  const k = await prisma.karyawan.findUnique({ where: { id } });
  if (!k) throw new HttpError(404, 'Karyawan tidak ditemukan.');
  const r = await ringkasanHapus(id);
  if (r.lembur && konfirmasiNik !== k.nik) {
    throw new HttpError(400, `Ketik NIK ${k.nik} untuk menghapus ${k.nama} beserta ${r.lembur} catatan lemburnya.`, { kode: 'PERLU_KONFIRMASI', ringkasan: r });
  }
  await prisma.$transaction(async (tx) => {
    // Hapus berurutan (relasi juga cascade di database), supaya jelas apa saja yang hilang
    await tx.pengajuanTap.deleteMany({ where: { karyawanId: id } });
    await tx.lembur.deleteMany({ where: { karyawanId: id } });
    await tx.sesiLembur.deleteMany({ where: { karyawanId: id } });
    await tx.wajahKaryawan.deleteMany({ where: { karyawanId: id } });
    await tx.notifikasi.deleteMany({ where: { karyawanId: id } });
    await tx.langgananPush.deleteMany({ where: { karyawanId: id } });
    await tx.karyawan.delete({ where: { id } });
  });
  res.json({ ok: true, terhapus: r });
}));

export default router;
