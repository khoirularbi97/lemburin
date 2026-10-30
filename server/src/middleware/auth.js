import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';

// Ada dua jenis token: STAF (admin & petugas, tabel User) dan KARYAWAN (portal,
// tabel Karyawan). Token satu jenis tidak bisa dipakai di rute jenis lain.

export function buatJwt(user) {
  return jwt.sign(
    { sub: String(user.id), username: user.username, role: user.role, jenis: 'STAF' },
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
    if (payload.jenis === 'KARYAWAN') return res.status(401).json({ pesan: 'Silakan masuk dengan akun petugas atau admin.' });
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

export function buatJwtKaryawan(k) {
  return jwt.sign(
    { sub: String(k.id), nik: k.nik, jenis: 'KARYAWAN' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_KARYAWAN_EXPIRES_IN || '30d' },
  );
}

/** Wajib login portal karyawan. Mengisi req.karyawan (data lengkap dari database). */
export async function wajibKaryawan(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ pesan: 'Silakan masuk terlebih dahulu.' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.jenis !== 'KARYAWAN') return res.status(401).json({ pesan: 'Silakan masuk dengan akun karyawan.' });
    const k = await prisma.karyawan.findUnique({ where: { id: Number(payload.sub) } });
    if (!k || !k.sandiHash) return res.status(401).json({ pesan: 'Akun portal tidak ditemukan. Hubungi HRD.' });
    if (!k.aktif) return res.status(401).json({ pesan: 'Akun Anda sedang nonaktif. Hubungi HRD.' });
    // Token yang dibuat sebelum sandi diganti/di-reset tidak berlaku lagi
    if (k.sandiDiubah && payload.iat * 1000 < k.sandiDiubah.getTime() - 1000) {
      return res.status(401).json({ pesan: 'Sandi sudah diganti. Silakan masuk lagi.' });
    }
    req.karyawan = k;
    return next();
  } catch {
    return res.status(401).json({ pesan: 'Sesi berakhir. Silakan masuk lagi.' });
  }
}

/** Selama masih memakai sandi awal dari HRD, hanya boleh ganti sandi. */
export function wajibSandiSendiri(req, res, next) {
  if (req.karyawan?.wajibGantiSandi) {
    return res.status(403).json({ pesan: 'Ganti sandi awal Anda dulu.', kode: 'WAJIB_GANTI_SANDI' });
  }
  return next();
}
