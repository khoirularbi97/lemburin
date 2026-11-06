// Uji edit/hapus pengguna & petugas dan hapus data karyawan, dengan Prisma tiruan.
import { after, before, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { buatFakePrisma } from './fakePrisma.js';

process.env.JWT_SECRET = 'rahasia-uji-hapus';
const prisma = buatFakePrisma();
class KnownError extends Error {}
mock.module('@prisma/client', { namedExports: { Prisma: { PrismaClientKnownRequestError: KnownError }, PrismaClient: class {} } });
mock.module('../src/lib/prisma.js', { namedExports: { prisma } });

let server; let base; let tAdmin;
async function api(path, { method = 'GET', body, token = tAdmin } = {}) {
  const res = await fetch(base + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json() };
}

before(async () => {
  const hash = await bcrypt.hash('admin123', 4);
  prisma._db.user.push(
    { id: 1, username: 'admin.hrd', passwordHash: hash, nama: 'Admin', role: 'ADMIN', area: 'Semua', aktif: true },
    { id: 2, username: 'petugas.line1', passwordHash: hash, nama: 'Petugas 1', role: 'PETUGAS', area: 'Painting Line 1', aktif: true },
    { id: 3, username: 'petugas.baru', passwordHash: hash, nama: 'Petugas Baru', role: 'PETUGAS', area: 'QC', aktif: true },
  );
  const k = { departemen: 'Painting Line 1', jabatan: 'Operator', upahBulanan: 5_000_000, aktif: true, perluCetakUlang: false, sandiHash: null, wajibGantiSandi: true };
  prisma._db.karyawan.push({ id: 1, nik: 'SNL-0142', nama: 'Budi Santoso', qrToken: 'LMB-A', ...k }, { id: 2, nik: 'SNL-0300', nama: 'Salah Input', qrToken: 'LMB-B', ...k });
  prisma._db.lembur.push({ id: 1, karyawanId: 1, petugasId: 2, tanggal: new Date('2026-11-02T00:00:00Z'), waktu: new Date(), jenis: 'KERJA', jamHitung: 5.5, upahSejam: 28902, nominal: 158961, manual: false });
  prisma._db.notifikasi.push({ id: 1, karyawanId: 1, judul: 'x', isi: 'y', dibaca: false });
  const { buatApp } = await import('../src/app.js');
  server = buatApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  tAdmin = (await api('/api/auth/login', { method: 'POST', body: { username: 'admin.hrd', password: 'admin123' } })).data.token;
});
after(() => server?.close());

test('edit pengguna: nama, area, username, peran', async () => {
  const r = await api('/api/pengguna/3', { method: 'PATCH', body: { nama: 'Petugas QC', area: 'Painting Line 2', username: 'Petugas.QC' } });
  assert.equal(r.status, 200);
  assert.equal(r.data.username, 'petugas.qc');
  assert.equal(r.data.area, 'Painting Line 2');
  const salah = await api('/api/pengguna/3', { method: 'PATCH', body: { username: 'a b' } });
  assert.equal(salah.status, 400);
});

test('admin tidak bisa menurunkan peran sendiri, dan admin aktif terakhir dijaga', async () => {
  const r = await api('/api/pengguna/1', { method: 'PATCH', body: { role: 'PETUGAS' } });
  assert.equal(r.status, 400);
  // jadikan petugas.qc admin, lalu turunkan lagi: boleh karena masih ada admin.hrd
  assert.equal((await api('/api/pengguna/3', { method: 'PATCH', body: { role: 'ADMIN' } })).data.area, 'Semua');
  assert.equal((await api('/api/pengguna/3', { method: 'PATCH', body: { role: 'PETUGAS', area: 'QC' } })).status, 200);
});

test('hapus pengguna: tidak bisa hapus diri sendiri atau akun yang punya riwayat tap', async () => {
  assert.equal((await api('/api/pengguna/1', { method: 'DELETE' })).status, 400);
  const r = await api('/api/pengguna/2', { method: 'DELETE' });
  assert.equal(r.status, 409);
  assert.equal(r.data.kode, 'PUNYA_RIWAYAT');
  assert.match(r.data.pesan, /1 tap lembur/);
  const ok = await api('/api/pengguna/3', { method: 'DELETE' });
  assert.equal(ok.status, 200);
  assert.equal(prisma._db.user.some((u) => u.id === 3), false);
});

test('akun yang dihapus langsung tidak bisa dipakai', async () => {
  const hash = await bcrypt.hash('x123456', 4);
  prisma._db.user.push({ id: 9, username: 'sementara', passwordHash: hash, nama: 'S', role: 'PETUGAS', area: 'QC', aktif: true });
  const t = (await api('/api/auth/login', { method: 'POST', body: { username: 'sementara', password: 'x123456' }, token: null })).data.token;
  assert.equal((await api('/api/pengguna/9', { method: 'DELETE' })).status, 200);
  assert.equal((await api('/api/scan/riwayat', { token: t })).status, 401);
});

test('hapus karyawan tanpa lembur langsung, dengan lembur wajib ketik NIK', async () => {
  const info = await api('/api/karyawan/1/ringkasan-hapus');
  assert.deepEqual(info.data, { lembur: 1, pengajuan: 0, sesi: 0, wajah: 0 });
  const tolak = await api('/api/karyawan/1', { method: 'DELETE' });
  assert.equal(tolak.status, 400);
  assert.equal(tolak.data.kode, 'PERLU_KONFIRMASI');
  assert.equal((await api('/api/karyawan/1', { method: 'DELETE', body: { konfirmasiNik: 'SNL-9999' } })).status, 400);
  const ok = await api('/api/karyawan/1', { method: 'DELETE', body: { konfirmasiNik: 'snl-0142' } });
  assert.equal(ok.status, 200);
  assert.equal(prisma._db.lembur.length, 0);
  assert.equal(prisma._db.notifikasi.length, 0);
  assert.equal((await api('/api/karyawan/2', { method: 'DELETE' })).status, 200);
  assert.equal(prisma._db.karyawan.length, 0);
  assert.equal((await api('/api/karyawan/2', { method: 'DELETE' })).status, 404);
});
