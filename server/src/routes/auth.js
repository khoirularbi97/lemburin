import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ah } from '../lib/util.js';
import { buatJwt, wajibLogin } from '../middleware/auth.js';

const router = Router();

const batasLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { pesan: 'Terlalu banyak percobaan masuk. Coba lagi 15 menit lagi.' },
});

const skemaLogin = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

router.post(
  '/login',
  batasLogin,
  ah(async (req, res) => {
    const { username, password } = skemaLogin.parse(req.body);
    const user = await prisma.user.findUnique({ where: { username: username.toLowerCase() } });
    const cocok = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !cocok) return res.status(401).json({ pesan: 'Username atau kata sandi salah.' });
    if (!user.aktif) return res.status(403).json({ pesan: 'Akun ini sedang nonaktif. Hubungi admin.' });

    await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });
    return res.json({
      token: buatJwt(user),
      user: { id: user.id, username: user.username, nama: user.nama, role: user.role, area: user.area },
    });
  }),
);

router.get('/me', wajibLogin, (req, res) => res.json({ user: req.user }));

export default router;
