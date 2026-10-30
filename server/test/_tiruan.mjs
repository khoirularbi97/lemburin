// Jalankan API lemburin dengan Prisma tiruan untuk uji tampilan
import { mock } from 'node:test';
import { createRequire } from 'node:module';
const bcrypt = createRequire('/home/claude/lembur-qr/server/package.json')('bcryptjs');
const S = '/home/claude/lembur-qr/server';
const { buatFakePrisma } = await import('./fakePrisma.js');
process.env.JWT_SECRET = 'uji';
process.env.CORS_ORIGIN = 'http://localhost:4173';
process.env.IZINKAN_WAKTU_SIMULASI = 'true';
const prisma = buatFakePrisma();
mock.module('@prisma/client', { namedExports: { Prisma: { PrismaClientKnownRequestError: class extends Error {} }, PrismaClient: class {} } });
mock.module(`../src/lib/prisma.js`, { namedExports: { prisma } });
const hash = await bcrypt.hash('admin123', 4);
prisma._db.user.push(
  { id: 1, username: 'admin.hrd', passwordHash: hash, nama: 'Admin HRD', role: 'ADMIN', area: 'Semua', aktif: true },
  { id: 2, username: 'petugas.line1', passwordHash: hash, nama: 'Leader Line 1', role: 'PETUGAS', area: 'Painting Line 1', aktif: true },
);
const orang = [['SNL-0142', 'Budi Santoso', 'Painting Line 1', 5_000_000], ['SNL-0118', 'Ahmad Fauzi', 'Injection', 5_000_000]];
orang.forEach(([nik, nama, departemen, upahBulanan], i) => prisma._db.karyawan.push({
  id: i + 1, nik, nama, departemen, jabatan: 'Operator', upahBulanan, qrToken: `LMB-TES${i}`, aktif: true, perluCetakUlang: false,
  sandiHash: hash, wajibGantiSandi: false, sandiDiubah: null, loginTerakhir: null, createdAt: new Date(), updatedAt: new Date(),
}));
// Riwayat contoh Oktober untuk Budi
const d0 = new Date(); 
for (let d = 1; d <= 27; d++) {
  const t = `2026-10-${String(d).padStart(2, '0')}`;
  const w = new Date(`${t}T00:00:00Z`).getUTCDay();
  if (d % 3 === 0 || d === 20) continue;
  const lib = w === 0 || w === 6;
  prisma._db.lembur.push({ id: d, karyawanId: 1, tanggal: new Date(`${t}T00:00:00Z`), waktuTap: new Date(`${t}T17:0${d % 10}:00+07:00`), jenisHari: lib ? 'LIBUR' : 'KERJA', jamHitung: lib ? 14 : 5.5, upahSejam: 28902, nominal: Math.round((lib ? 14 : 5.5) * 28902), petugasId: 2, manual: false, alasan: null, createdAt: d0 });
}
const { buatApp } = await import('../src/app.js');
buatApp().listen(4000, () => console.log('API tiruan di :4000'));
