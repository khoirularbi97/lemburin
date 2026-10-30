// Uji alur portal karyawan & pengajuan lewat HTTP, dengan Prisma tiruan.
// Jalankan: npm test (memakai --experimental-test-module-mocks)
import { after, before, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { buatFakePrisma } from './fakePrisma.js';
import { waktuJakarta } from '../src/lib/lembur.js';

process.env.JWT_SECRET = 'rahasia-uji';
const prisma = buatFakePrisma();
class KnownError extends Error {}
mock.module('@prisma/client', { namedExports: { Prisma: { PrismaClientKnownRequestError: KnownError }, PrismaClient: class {} } });
mock.module('../src/lib/prisma.js', { namedExports: { prisma } });

let server;
let base;
const hariIni = waktuJakarta().tanggal;
const kemarin = (() => { const d = new Date(`${hariIni}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })();

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const tipe = res.headers.get('content-type') || '';
  const data = tipe.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
  return { status: res.status, data };
}

before(async () => {
  const hash = await bcrypt.hash('admin123', 4);
  prisma._db.user.push(
    { id: 1, username: 'admin.hrd', passwordHash: hash, nama: 'Admin', role: 'ADMIN', area: 'Semua', aktif: true },
    { id: 2, username: 'petugas.line1', passwordHash: hash, nama: 'Petugas', role: 'PETUGAS', area: 'Line 1', aktif: true },
  );
  prisma._db.karyawan.push({
    id: 1, nik: 'SNL-0142', nama: 'Budi Santoso', departemen: 'Painting Line 1', jabatan: 'Operator',
    upahBulanan: 5_000_000, qrToken: 'LMB-AAAA', aktif: true, perluCetakUlang: false,
    sandiHash: null, wajibGantiSandi: true, sandiDiubah: null, loginTerakhir: null,
  });
  const { buatApp } = await import('../src/app.js');
  server = buatApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server?.close());

let tokenAdmin;
let tokenKaryawan;
let sandiAwal;

test('admin login dan mengaktifkan portal karyawan', async () => {
  const r = await api('/api/auth/login', { method: 'POST', body: { username: 'admin.hrd', password: 'admin123' } });
  assert.equal(r.status, 200);
  tokenAdmin = r.data.token;

  const belum = await api('/api/portal/login', { method: 'POST', body: { nik: 'snl-0142', sandi: 'apa saja' } });
  assert.equal(belum.status, 401);
  assert.match(belum.data.pesan, /belum diaktifkan/);

  const s = await api('/api/karyawan/1/sandi-portal', { method: 'POST', token: tokenAdmin });
  assert.equal(s.status, 200);
  assert.match(s.data.sandiAwal, /^[A-Z2-9]{8}$/);
  assert.equal(s.data.sandiHash, undefined, 'hash sandi tidak boleh bocor');
  assert.equal(s.data.portal.aktif, true);
  sandiAwal = s.data.sandiAwal;

  const daftar = await api('/api/karyawan', { token: tokenAdmin });
  assert.ok(daftar.data.every((k) => !('sandiHash' in k)));
});

test('karyawan login dengan sandi awal dan wajib ganti sandi', async () => {
  const salah = await api('/api/portal/login', { method: 'POST', body: { nik: 'SNL-0142', sandi: 'salah' } });
  assert.equal(salah.status, 401);

  const r = await api('/api/portal/login', { method: 'POST', body: { nik: 'snl-0142', sandi: sandiAwal } });
  assert.equal(r.status, 200);
  assert.equal(r.data.karyawan.wajibGantiSandi, true);
  tokenKaryawan = r.data.token;

  const terkunci = await api('/api/portal/ringkasan', { token: tokenKaryawan });
  assert.equal(terkunci.status, 403);
  assert.equal(terkunci.data.kode, 'WAJIB_GANTI_SANDI');

  const lemah = await api('/api/portal/ganti-sandi', { method: 'POST', token: tokenKaryawan, body: { sandiLama: sandiAwal, sandiBaru: 'pendek1' } });
  assert.equal(lemah.status, 400);
  const nik = await api('/api/portal/ganti-sandi', { method: 'POST', token: tokenKaryawan, body: { sandiLama: sandiAwal, sandiBaru: 'xSNL-0142x1' } });
  assert.equal(nik.status, 400);

  await new Promise((r2) => setTimeout(r2, 1100)); // supaya iat token lama < sandiDiubah
  const ok = await api('/api/portal/ganti-sandi', { method: 'POST', token: tokenKaryawan, body: { sandiLama: sandiAwal, sandiBaru: 'lemburBudi2026' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.karyawan.wajibGantiSandi, false);

  const lama = await api('/api/portal/saya', { token: tokenKaryawan });
  assert.equal(lama.status, 401, 'token sebelum ganti sandi harus ditolak');
  tokenKaryawan = ok.data.token;
});

test('token karyawan dan token staf tidak bisa saling dipakai', async () => {
  assert.equal((await api('/api/rekap', { token: tokenKaryawan })).status, 401);
  assert.equal((await api('/api/scan/hari-ini', { token: tokenKaryawan })).status, 401);
  assert.equal((await api('/api/portal/saya', { token: tokenAdmin })).status, 401);
});

test('scan petugas langsung muncul di portal karyawan', async () => {
  const p = await api('/api/auth/login', { method: 'POST', body: { username: 'petugas.line1', password: 'admin123' } });
  const scan = await api('/api/scan', { method: 'POST', token: p.data.token, body: { token: 'LMB-AAAA' } });
  assert.equal(scan.status, 201);

  const r = await api('/api/portal/ringkasan', { token: tokenKaryawan });
  assert.equal(r.status, 200);
  assert.equal(r.data.total.tap, 1);
  assert.equal(r.data.hariIni.tap.nominal, scan.data.tap.nominal);
  assert.equal(r.data.taps[0].tanggal, hariIni);
  assert.ok(r.data.bulanTersedia.includes(hariIni.slice(0, 7)));

  const qr = await api('/api/portal/qr', { token: tokenKaryawan });
  assert.equal(qr.data.qrToken, 'LMB-AAAA');
});

test('pengajuan tap terlewat: ajukan, tolak dobel, admin setujui jadi tap manual', async () => {
  const masaDepan = await api('/api/portal/pengajuan', { method: 'POST', token: tokenKaryawan, body: { tanggal: '2099-01-01', jam: '17:00', alasan: 'lupa tap kartu' } });
  assert.equal(masaDepan.status, 400);
  const sudahAda = await api('/api/portal/pengajuan', { method: 'POST', token: tokenKaryawan, body: { tanggal: hariIni, jam: '17:00', alasan: 'lupa tap kartu' } });
  assert.equal(sudahAda.status, 409);

  const aju = await api('/api/portal/pengajuan', { method: 'POST', token: tokenKaryawan, body: { tanggal: kemarin, jam: '18:30', alasan: 'Lupa tap, SPL 045' } });
  assert.equal(aju.status, 201);
  assert.equal(aju.data.status, 'MENUNGGU');
  const dobel = await api('/api/portal/pengajuan', { method: 'POST', token: tokenKaryawan, body: { tanggal: kemarin, jam: '18:30', alasan: 'Lupa tap, SPL 045' } });
  assert.equal(dobel.status, 409);

  const jumlah = await api('/api/pengajuan/jumlah', { token: tokenAdmin });
  assert.equal(jumlah.data.menunggu, 1);
  const daftar = await api('/api/pengajuan', { token: tokenAdmin });
  assert.equal(daftar.data[0].karyawan.nama, 'Budi Santoso');
  assert.ok(daftar.data[0].perkiraan.nominal > 0);
  assert.equal(daftar.data[0].kendala, null);

  const setuju = await api(`/api/pengajuan/${aju.data.id}/setujui`, { method: 'POST', token: tokenAdmin, body: {} });
  assert.equal(setuju.status, 200);
  assert.equal(setuju.data.tap.jam, '18:30');
  const lagi = await api(`/api/pengajuan/${aju.data.id}/setujui`, { method: 'POST', token: tokenAdmin, body: {} });
  assert.equal(lagi.status, 409);

  const tap = prisma._db.lembur.find((t) => t.manual);
  assert.equal(tap.petugasId, 1);
  assert.match(tap.alasan, /Pengajuan karyawan/);

  const milik = await api('/api/portal/pengajuan', { token: tokenKaryawan });
  assert.equal(milik.data[0].status, 'DISETUJUI');
  assert.equal(milik.data[0].nominal, tap.nominal);
});

test('pengajuan ditolak dan dibatalkan', async () => {
  const d = new Date(`${hariIni}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 2);
  const tgl = d.toISOString().slice(0, 10);
  const a = await api('/api/portal/pengajuan', { method: 'POST', token: tokenKaryawan, body: { tanggal: tgl, jam: '17:00', alasan: 'lembur stok opname' } });
  const tanpaCatatan = await api(`/api/pengajuan/${a.data.id}/tolak`, { method: 'POST', token: tokenAdmin, body: {} });
  assert.equal(tanpaCatatan.status, 400);
  const tolak = await api(`/api/pengajuan/${a.data.id}/tolak`, { method: 'POST', token: tokenAdmin, body: { catatan: 'Tidak ada SPL' } });
  assert.equal(tolak.status, 200);
  assert.equal((await api(`/api/portal/pengajuan/${a.data.id}`, { method: 'DELETE', token: tokenKaryawan })).status, 409);

  const b = await api('/api/portal/pengajuan', { method: 'POST', token: tokenKaryawan, body: { tanggal: tgl, jam: '17:00', alasan: 'coba lagi dengan SPL' } });
  assert.equal(b.status, 201);
  const batal = await api(`/api/portal/pengajuan/${b.data.id}`, { method: 'DELETE', token: tokenKaryawan });
  assert.equal(batal.data.status, 'DIBATALKAN');
});

test('slip lembur PDF', async () => {
  const r = await api(`/api/portal/slip?bulan=${hariIni.slice(0, 7)}`, { token: tokenKaryawan });
  assert.equal(r.status, 200);
  assert.equal(r.data.subarray(0, 5).toString(), '%PDF-');
  assert.ok(r.data.length > 2000);
});

test('langganan notifikasi ditolak kalau server belum punya kunci', async () => {
  const r = await api('/api/portal/push/langganan', {
    method: 'POST', token: tokenKaryawan,
    body: { jenis: 'WEB', endpoint: 'https://push.example.com/abc', keys: { p256dh: 'x'.repeat(20), auth: 'y'.repeat(10) } },
  });
  assert.equal(r.status, 503);
});

test('lonceng: notifikasi tersimpan di kotak masuk walau push belum aktif', async () => {
  await new Promise((r) => setTimeout(r, 50)); // notifikasi dikirim tanpa ditunggu
  const j = await api('/api/portal/notifikasi/jumlah', { token: tokenKaryawan });
  assert.ok(j.data.belumDibaca >= 3, `scan + disetujui + ditolak, dapat ${j.data.belumDibaca}`);
  const l = await api('/api/portal/notifikasi', { token: tokenKaryawan });
  const judul = l.data.map((n) => n.judul);
  assert.ok(judul.includes('Lembur tercatat'));
  assert.ok(judul.includes('Pengajuan lembur disetujui'));
  assert.ok(judul.includes('Pengajuan lembur ditolak'));
  assert.ok(new Date(l.data[0].waktu) >= new Date(l.data.at(-1).waktu), 'terbaru di atas');
  await api('/api/portal/notifikasi/baca', { method: 'POST', token: tokenKaryawan });
  assert.equal((await api('/api/portal/notifikasi/jumlah', { token: tokenKaryawan })).data.belumDibaca, 0);
});

test('karyawan dinonaktifkan tidak bisa memakai portal', async () => {
  await api('/api/karyawan/1/aktif', { method: 'PATCH', token: tokenAdmin, body: { aktif: false } });
  assert.equal((await api('/api/portal/saya', { token: tokenKaryawan })).status, 401);
  const login = await api('/api/portal/login', { method: 'POST', body: { nik: 'SNL-0142', sandi: 'lemburBudi2026' } });
  assert.equal(login.status, 403);
});
