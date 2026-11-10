// Shift lewat API: scan dini hari masuk hari kerja sebelumnya, penanda "shift 1 lembur", input massal per shift.
import { after, before, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { buatFakePrisma } from './fakePrisma.js';

process.env.JWT_SECRET = 'rahasia-uji-shift';
process.env.IZINKAN_WAKTU_SIMULASI = 'true';
const prisma = buatFakePrisma();
mock.module('@prisma/client', { namedExports: { Prisma: { PrismaClientKnownRequestError: class extends Error {} }, PrismaClient: class {} } });
mock.module('../src/lib/prisma.js', { namedExports: { prisma } });
const { ATURAN_AKTUAL_BAWAAN, waktuJakarta } = await import('../src/lib/lembur.js');

let server; let base; let tAdmin; let tPetugas;
async function api(path, { method = 'GET', body, token = tAdmin } = {}) {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => null) };
}
const tambah = (t, n) => { const d = new Date(`${t}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// Tanggal input massal harus dalam batas manual: pakai hari kerja (Senin–Jumat) terakhir sebelum hari ini
let kerja = tambah(waktuJakarta().tanggal, -1);
while ([0, 6].includes(new Date(`${kerja}T00:00:00Z`).getUTCDay())) kerja = tambah(kerja, -1);
const senin = tambah(kerja, -((new Date(`${kerja}T00:00:00Z`).getUTCDay() + 6) % 7));
const SHIFT = { aktif: true, gantiHari: '07:00', shift1: { masuk: '07:00', pulang: '16:00' }, shift2: { masuk: '16:00', pulang: '00:00' }, shift2Lembur: { masuk: '19:30', pulang: '03:30' }, acuanSenin: senin, grupShift1: 'A', grup: ['A', 'B'] };

before(async () => {
  const hash = await bcrypt.hash('rahasia1', 4);
  prisma._db.user.push(
    { id: 1, username: 'admin', passwordHash: hash, nama: 'Admin', role: 'ADMIN', area: 'Semua', aktif: true },
    { id: 2, username: 'petugas.qc', passwordHash: hash, nama: 'Leader', role: 'PETUGAS', area: 'QC', aktif: true },
  );
  const k = (id, grup) => ({ id, nik: `SNL-${id}`, nama: `Karyawan ${grup}`, departemen: 'QC', jabatan: 'Operator', upahBulanan: 5_190_000, qrToken: `LMB-${id}`, aktif: true, grup, perluCetakUlang: false });
  prisma._db.karyawan.push(k(1, 'A'), k(2, 'B'));
  const { buatApp } = await import('../src/app.js');
  server = buatApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const masuk = async (u) => (await api('/api/auth/login', { method: 'POST', body: { username: u, password: 'rahasia1' }, token: null })).data.token;
  tAdmin = await masuk('admin'); tPetugas = await masuk('petugas.qc');
});
after(() => server?.close());

test('admin mengaktifkan shift; acuan rotasi wajib hari Senin', async () => {
  const salah = await api('/api/mandiri/aturan', { method: 'PUT', body: { ...ATURAN_AKTUAL_BAWAAN, shift: { ...SHIFT, acuanSenin: tambah(senin, 1) } } });
  assert.equal(salah.status, 400);
  const r = await api('/api/mandiri/aturan', { method: 'PUT', body: { ...ATURAN_AKTUAL_BAWAAN, shift: SHIFT } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.aturan.shift.aktif, true);
});

test('scan petugas jam 01.30 dihitung untuk hari kerja sebelumnya', async () => {
  const sabtu = tambah(senin, 5);
  const info = await api(`/api/scan/hari-ini?simulasi=${sabtu}T01:30`, { token: tPetugas });
  assert.equal(info.data.tanggal, tambah(senin, 4)); // Jumat
  assert.equal(info.data.jenis, 'KERJA');
  assert.equal(info.data.tanggalKalender, sabtu);
  assert.equal(info.data.shift.grup.B.kode, 'S2');
  const r = await api('/api/scan', { method: 'POST', token: tPetugas, body: { token: 'LMB-2', simulasi: `${sabtu}T01:30` } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.tap.jenisHari, 'KERJA');
  assert.equal(r.data.tap.jamHitung, 5.5);
  assert.equal(r.data.tap.tanggal, tambah(senin, 4));
  // waktu tap tetap jam sebenarnya (Sabtu 01.30)
  assert.equal(prisma._db.lembur.at(-1).waktuTap.toISOString(), new Date(`${sabtu}T01:30:00+07:00`).toISOString());
  // Sabtu jam 09.00 = lembur hari Sabtu sendiri (14 jam), tidak bentrok
  const r2 = await api('/api/scan', { method: 'POST', token: tPetugas, body: { token: 'LMB-2', simulasi: `${sabtu}T09:00` } });
  assert.equal(r2.status, 201);
  assert.equal(r2.data.tap.jamHitung, 14);
});

test('petugas menandai shift 1 lembur → shift 2 menjadi 19.30–03.30', async () => {
  const awal = await api(`/api/shift/hari?tanggal=${kerja}`, { token: tPetugas });
  assert.equal(awal.data.shift.shift1Lembur, false);
  const r = await api('/api/shift/hari', { method: 'PUT', token: tPetugas, body: { tanggal: kerja, shift1Lembur: true } });
  assert.equal(r.status, 200);
  assert.equal(r.data.shift.grup.B.masuk, '19:30');
  assert.equal(r.data.shift.grup.A.kode, 'S1');
  const m = await api(`/api/lembur-massal/karyawan?tanggal=${kerja}`, { token: tPetugas });
  assert.equal(m.data.shift.shift1Lembur, true);
  assert.equal(m.data.karyawan.find((k) => k.id === 2).grup, 'B');
});

test('input massal jam mulai–selesai memakai jam shift masing-masing karyawan', async () => {
  // Shift 1 (grup A) lembur 16.00–19.30 = 3,5 jam
  let r = await api('/api/lembur-massal', { method: 'POST', body: { tanggal: kerja, mulai: '16:00', jam: '19:30', alasan: 'Lembur shift 1', karyawanIds: [1] } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  let t = prisma._db.lembur.at(-1);
  assert.equal(t.menitLembur, 210);
  assert.equal(t.jamHitung, 6.5);
  assert.equal(t.rincianHitung.shift.kode, 'S1');
  // Shift 2 (grup B, shift 1 lembur → pulang 03.30) lembur 03.30–06.30 = 3 jam, tercatat dini hari tanggal berikutnya
  r = await api('/api/lembur-massal', { method: 'POST', body: { tanggal: kerja, mulai: '03:30', jam: '06:30', alasan: 'Lembur shift 2', karyawanIds: [2] } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  t = prisma._db.lembur.at(-1);
  assert.equal(t.menitLembur, 180);
  assert.equal(t.rincianHitung.shift.kode, 'S2L');
  assert.equal(t.mulai.toISOString(), new Date(`${tambah(kerja, 1)}T03:30:00+07:00`).toISOString());
  assert.equal(t.selesai.toISOString(), new Date(`${tambah(kerja, 1)}T06:30:00+07:00`).toISOString());
});
