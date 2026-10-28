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

router.patch('/:id', ah(async (req, res) => {
  const id = Number(req.params.id);
  const body = z.object({ aktif: z.boolean().optional(), resetPassword: z.boolean().optional() }).parse(req.body);
  if (body.aktif === false && id === req.user.id) throw new HttpError(400, 'Anda tidak bisa menonaktifkan akun sendiri.');

  const data = {};
  let sandiBaru = null;
  if (typeof body.aktif === 'boolean') data.aktif = body.aktif;
  if (body.resetPassword) {
    sandiBaru = buatSandiSementara();
    data.passwordHash = await bcrypt.hash(sandiBaru, 10);
  }
  const u = await prisma.user.update({ where: { id }, data, select: pilih });
  res.json({ ...u, sandiBaru });
}));

export default router;
