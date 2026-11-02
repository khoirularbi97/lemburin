// Uji input lembur massal (centang daftar / foto SPL) lewat HTTP dengan Prisma tiruan.
import { after, before, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { buatFakePrisma } from './fakePrisma.js';
import { batasManual, waktuJakarta } from '../src/lib/lembur.js';

process.env.JWT_SECRET = 'rahasia-uji';
const prisma = buatFakePrisma();
mock.module('@prisma/client', { namedExports: { Prisma: { PrismaClientKnownRequestError: class extends Error {} }, PrismaClient: class {} } });
mock.module('../src/lib/prisma.js', { namedExports: { prisma } });

let server; let base;
const hariIni = waktuJakarta().tanggal;
const kemarin = (() => { const d = new Date(`${hariIni}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })();
// 1x1 JPEG kecil
const FOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const tipe = res.headers.get('content-type') || '';
  return { status: res.status, data: tipe.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()), tipe };
}
const login = async (username) => (await api('/api/auth/login', { method: 'POST', body: { username, password: 'rahasia1' } })).data.token;

before(async () => {
  const hash = await bcrypt.hash('rahasia1', 4);
  prisma._db.user.push(
    { id: 1, username: 'admin.hrd', passwordHash: hash, nama: 'Admin', role: 'ADMIN', area: 'Semua', aktif: true },
    { id: 2, username: 'petugas.qc', passwordHash: hash, nama: 'Leader QC', role: 'PETUGAS', area: 'QC', aktif: true },
  );
  const k = (id, nik, nama, departemen, aktif = true) => ({ id, nik, nama, departemen, jabatan: 'Operator', upahBulanan: 5_000_000, qrToken: `LMB-${id}`, aktif, perluCetakUlang: false });
  prisma._db.karyawan.push(k(1, 'SNL-0063', 'Dewi Lestari', 'QC'), k(2, 'SNL-0142', 'Budi Santoso', 'Painting Line 1'), k(3, 'SNL-0200', 'Khoirul Arbi', 'QC'), k(4, 'SNL-0300', 'Nonaktif', 'QC', false));
  const { buatApp } = await import('../src/app.js');
  server = buatApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server?.close());

test('petugas hanya melihat karyawan aktif di areanya, tanpa upah', async () => {
  const t = await login('petugas.qc');
  const r = await api(`/api/lembur-massal/karyawan?tanggal=${kemarin}`, { token: t });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.karyawan.map((k) => k.nama), ['Dewi Lestari', 'Khoirul Arbi']);
  assert.equal(r.data.karyawan[0].nominal, undefined);
  assert.equal(r.data.lingkup, 'QC');
  const b = await api('/api/lembur-massal/batas', { token: t });
  assert.deepEqual({ min: b.data.min, max: b.data.max }, batasManual());
  assert.equal(b.data.masaSimpanFotoBulan, 13);
});

test('admin centang beberapa karyawan sekaligus', async () => {
  const t = await login('admin.hrd');
  const daftar = await api(`/api/lembur-massal/karyawan?tanggal=${kemarin}`, { token: t });
  assert.equal(daftar.data.karyawan.length, 3);
  assert.ok(daftar.data.karyawan[0].nominal > 0);

  const r = await api('/api/lembur-massal', { method: 'POST', token: t, body: { tanggal: kemarin, jam: '19:00', nomorSpl: 'SPL/045', alasan: 'Sortir part', karyawanIds: [1, 2] } });
  assert.equal(r.status, 201);
  assert.equal(r.data.tercatat, 2);
  assert.ok(r.data.totalNominal > 0);
  const taps = prisma._db.lembur.filter((x) => x.splId === r.data.splId);
  assert.equal(taps.length, 2);
  assert.ok(taps.every((x) => x.manual && x.petugasId === 1 && /SPL\/045/.test(x.alasan)));

  const lagi = await api(`/api/lembur-massal/karyawan?tanggal=${kemarin}`, { token: t });
  assert.equal(lagi.data.karyawan.find((k) => k.id === 1).sudahTap.jam, '19:00');

  const rekap = await api(`/api/rekap?bulan=${daftar.data.tanggal && (await import('../src/lib/lembur.js')).periodeDari(kemarin)}`, { token: t });
  const tap = rekap.data.rows.flatMap((x) => x.taps).find((x) => x.spl);
  assert.equal(tap.spl.nomor, 'SPL/045');
});

test('yang sudah tap, nonaktif, atau di luar area dilewati, sisanya tetap tercatat', async () => {
  const t = await login('petugas.qc');
  const r = await api('/api/lembur-massal', { method: 'POST', token: t, body: { tanggal: kemarin, jam: '18:00', alasan: 'Lembur QC', karyawanIds: [1, 2, 3, 4] } });
  assert.equal(r.status, 201);
  const s = Object.fromEntries(r.data.hasil.map((h) => [h.karyawanId, h.status]));
  assert.deepEqual(s, { 1: 'SUDAH_TAP', 2: 'GAGAL', 3: 'OK', 4: 'GAGAL' });
  assert.equal(r.data.totalNominal, undefined, 'petugas tidak melihat nominal');
  assert.equal(prisma._db.lembur.find((x) => x.karyawanId === 3).petugasId, 2);
});

test('kalau tidak ada yang tercatat, SPL tidak disimpan', async () => {
  const t = await login('admin.hrd');
  const n = prisma._db.spl.length;
  const r = await api('/api/lembur-massal', { method: 'POST', token: t, body: { tanggal: kemarin, jam: '18:00', alasan: 'Dobel', karyawanIds: [1] } });
  assert.equal(r.status, 409);
  assert.equal(prisma._db.spl.length, n);
});

test('foto SPL disimpan dan hanya bisa dibuka admin atau pembuatnya', async () => {
  const tp = await login('petugas.qc');
  const d = new Date(`${hariIni}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 2);
  const tgl = d.toISOString().slice(0, 10);
  const tanpa = await api('/api/lembur-massal', { method: 'POST', token: tp, body: { tanggal: tgl, jam: '19:00', alasan: 'Dari foto', karyawanIds: [1], sumber: 'FOTO' } });
  assert.equal(tanpa.status, 400);
  const salah = await api('/api/lembur-massal', { method: 'POST', token: tp, body: { tanggal: tgl, jam: '19:00', alasan: 'Dari foto', karyawanIds: [1], sumber: 'FOTO', foto: 'data:text/html;base64,PGI+' } });
  assert.equal(salah.status, 400);
  const r = await api('/api/lembur-massal', { method: 'POST', token: tp, body: { tanggal: tgl, jam: '19:00', alasan: 'Dari foto', karyawanIds: [1, 3], sumber: 'FOTO', foto: FOTO, teksOcr: 'SURAT PERINTAH LEMBUR' } });
  assert.equal(r.data.tercatat, 2);
  const f = await api(`/api/lembur-massal/spl/${r.data.splId}/foto`, { token: tp });
  assert.equal(f.status, 200);
  assert.equal(f.tipe, 'image/jpeg');
  const fa = await api(`/api/lembur-massal/spl/${r.data.splId}/foto`, { token: await login('admin.hrd') });
  assert.equal(fa.status, 200);
});

test('tanggal di luar batas dan masa depan ditolak', async () => {
  const t = await login('admin.hrd');
  const r = await api('/api/lembur-massal', { method: 'POST', token: t, body: { tanggal: '2099-01-01', jam: '18:00', alasan: 'Lembur', karyawanIds: [1] } });
  assert.equal(r.status, 400);
  const lama = await api('/api/lembur-massal', { method: 'POST', token: t, body: { tanggal: '2020-01-01', jam: '18:00', alasan: 'Lembur', karyawanIds: [1] } });
  assert.equal(lama.status, 400);
});
