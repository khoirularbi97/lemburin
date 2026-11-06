import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ah, buatSandiSementara, HttpError } from '../lib/util.js';

const router = Router();

const pilih = { id: true, username: true, nama: true, role: true, area: true, aktif: true, lastLogin: true };

router.get('/', ah(async (req, res) => {
  res.json(await prisma.user.findMany({ select: pilih, orderBy: [{ role: 'asc' }, { username: 'asc' }] }));
}));

const skemaUser = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,32}$/, 'Username 3-32 karakter: huruf kecil, angka, titik, garis'),
  nama: z.string().trim().min(2),
  role: z.enum(['ADMIN', 'PETUGAS']),
  area: z.string().trim().default('Semua'),
  password: z.string().min(6, 'Kata sandi minimal 6 karakter'),
});

router.post('/', ah(async (req, res) => {
  const { password, ...data } = skemaUser.parse(req.body);
  const u = await prisma.user.create({
    data: { ...data, passwordHash: await bcrypt.hash(password, 10) },
    select: pilih,
  });
  res.status(201).json(u);
}));

const skemaUbah = z.object({
  username: skemaUser.shape.username.optional(),
  nama: skemaUser.shape.nama.optional(),
  role: skemaUser.shape.role.optional(),
  area: z.string().trim().min(1).optional(),
  aktif: z.boolean().optional(),
  resetPassword: z.boolean().optional(),
});

/** Jumlah admin aktif selain `kecuali`. Sistem tidak boleh kehilangan admin aktif terakhir. */
const adminLain = (kecuali) => prisma.user.count({ where: { role: 'ADMIN', aktif: true, NOT: { id: kecuali } } });

router.patch('/:id', ah(async (req, res) => {
  const id = Number(req.params.id);
  const body = skemaUbah.parse(req.body);
  const lama = await prisma.user.findUnique({ where: { id } });
  if (!lama) throw new HttpError(404, 'Pengguna tidak ditemukan.');
  const diriSendiri = id === req.user.id;
  if (body.aktif === false && diriSendiri) throw new HttpError(400, 'Anda tidak bisa menonaktifkan akun sendiri.');
  if (body.role === 'PETUGAS' && diriSendiri && lama.role === 'ADMIN') throw new HttpError(400, 'Anda tidak bisa menurunkan peran akun sendiri. Minta admin lain melakukannya.');
  const hilangAdmin = lama.role === 'ADMIN' && lama.aktif && (body.role === 'PETUGAS' || body.aktif === false);
  if (hilangAdmin && (await adminLain(id)) === 0) throw new HttpError(400, 'Harus ada minimal satu admin aktif. Tambahkan admin lain dulu.');

  const data = {};
  let sandiBaru = null;
  for (const k of ['username', 'nama', 'role', 'area', 'aktif']) if (body[k] !== undefined) data[k] = body[k];
  if (data.role === 'ADMIN' && !data.area) data.area = 'Semua';
  if (body.resetPassword) {
    sandiBaru = buatSandiSementara();
    data.passwordHash = await bcrypt.hash(sandiBaru, 10);
  }
  const u = await prisma.user.update({ where: { id }, data, select: pilih });
  res.json({ ...u, sandiBaru });
}));

/** Riwayat yang mengikat akun ini. Akun dengan riwayat tidak dihapus agar rekap & jejak audit tetap utuh. */
async function riwayatPengguna(id) {
  const [tap, ditolak, spl, sesi] = await Promise.all([
    prisma.lembur.count({ where: { petugasId: id } }),
    prisma.tapDitolak.count({ where: { petugasId: id } }),
    prisma.spl.count({ where: { dibuatOlehId: id } }),
    prisma.sesiLembur.count({ where: { petugasId: id } }),
  ]);
  return { tap, ditolak, spl, sesi, total: tap + ditolak + spl + sesi };
}

router.get('/:id/riwayat', ah(async (req, res) => {
  res.json(await riwayatPengguna(Number(req.params.id)));
}));

router.delete('/:id', ah(async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) throw new HttpError(400, 'Anda tidak bisa menghapus akun sendiri.');
  const u = await prisma.user.findUnique({ where: { id } });
  if (!u) throw new HttpError(404, 'Pengguna tidak ditemukan.');
  if (u.role === 'ADMIN' && u.aktif && (await adminLain(id)) === 0) throw new HttpError(400, 'Harus ada minimal satu admin aktif.');
  const r = await riwayatPengguna(id);
  if (r.total) {
    const bagian = [r.tap && `${r.tap} tap lembur`, r.ditolak && `${r.ditolak} tap ditolak`, r.spl && `${r.spl} foto SPL`, r.sesi && `${r.sesi} tap in yang masih terbuka`].filter(Boolean).join(', ');
    throw new HttpError(409, `${u.username} sudah mencatat ${bagian}. Akun ini tidak bisa dihapus agar rekap tetap utuh. Nonaktifkan saja: akun tidak bisa masuk lagi.`, { kode: 'PUNYA_RIWAYAT', riwayat: r });
  }
  await prisma.$transaction(async (tx) => {
    await tx.pengajuanTap.updateMany({ where: { diprosesOlehId: id }, data: { diprosesOlehId: null } });
    await tx.wajahKaryawan.updateMany({ where: { diprosesOlehId: id }, data: { diprosesOlehId: null } });
    await tx.user.delete({ where: { id } });
  });
  res.json({ ok: true });
}));

export default router;
