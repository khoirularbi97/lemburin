import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';

export function buatJwt(user) {
  return jwt.sign(
    { sub: String(user.id), username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '12h' },
  );
}

/** Wajib login. JWT dikirim di header Authorization: Bearer <token>. */
export async function wajibLogin(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ pesan: 'Silakan masuk terlebih dahulu.' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: Number(payload.sub) } });
    if (!user || !user.aktif) return res.status(401).json({ pesan: 'Akun tidak aktif atau sudah dihapus.' });
    req.user = { id: user.id, username: user.username, role: user.role, nama: user.nama, area: user.area };
    return next();
  } catch {
    return res.status(401).json({ pesan: 'Sesi berakhir. Silakan masuk lagi.' });
  }
}

export function wajibPeran(...peran) {
  return (req, res, next) => {
    if (!req.user || !peran.includes(req.user.role)) {
      return res.status(403).json({ pesan: 'Anda tidak punya akses ke fitur ini.' });
    }
    return next();
  };
}
