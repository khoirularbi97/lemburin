// Tap eksklusif: karyawan dengan izin admin scan ID card sendiri SEKALI (+ wajah) → dihitung seperti scan petugas.
// Lokasi HP hanya dicatat (tidak memblokir) dan dibandingkan dengan titik pabrik.
import { before, after, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { buatFakePrisma } from './fakePrisma.js';

process.env.JWT_SECRET = 'rahasia-uji-eksklusif';
process.env.IZINKAN_WAKTU_SIMULASI = 'true';
const prisma = buatFakePrisma();
mock.module('@prisma/client', { namedExports: { Prisma: { PrismaClientKnownRequestError: class extends Error {} }, PrismaClient: class {} } });
mock.module('../src/lib/prisma.js', { namedExports: { prisma } });
const { catatLokasi, jarakMeter } = await import('../src/lib/lokasi.js');

let server; let base; let tAdmin; let tPetugas; let tBudi; let tSiti;
async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => null) };
}
const WAJAH = Array.from({ length: 128 }, (_, i) => Math.sin(i) * 0.1);
const LAIN = WAJAH.map((x) => -x);
const PABRIK = { nama: 'PT Sanly Cikarang', lat: -6.3005, lng: 107.1520, radiusM: 300 };
const DEKAT = { lat: -6.3007, lng: 107.1522, akurasi: 25 }; // ±30 m
const JAUH = { lat: -6.2600, lng: 107.1520, akurasi: 20 }; // ±4,5 km
const besok = () => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
const tapE = (body, token = tBudi) => api('/api/portal/tap-eksklusif', { method: 'POST', token, body: { hidup: true, vektor: WAJAH, ...body } });

before(async () => {
  const hash = await bcrypt.hash('rahasia1', 4);
  prisma._db.user.push(
    { id: 1, username: 'admin', passwordHash: hash, nama: 'Admin', role: 'ADMIN', area: 'Semua', aktif: true },
    { id: 2, username: 'petugas.qc', passwordHash: hash, nama: 'Leader QC', role: 'PETUGAS', area: 'QC', aktif: true },
  );
  const k = (id, nik, nama) => ({ id, nik, nama, departemen: 'QC', jabatan: 'Operator', upahBulanan: 5_190_000, qrToken: `LMB-K${id}`, aktif: true, sandiHash: hash, wajibGantiSandi: false, perluCetakUlang: false });
  prisma._db.karyawan.push(k(1, 'SNL-1', 'Budi QC'), k(2, 'SNL-2', 'Siti QC'));
  for (const id of [1, 2]) prisma._db.wajahKaryawan.push({ karyawanId: id, vektor: WAJAH, foto: Buffer.from('x'), fotoMime: 'image/webp', status: 'DISETUJUI', updatedAt: new Date() });
  prisma._db.qrTokenLama.push({ id: 1, token: 'LMB-LAMA1', karyawanId: 1 });
  const { buatApp } = await import('../src/app.js');
  server = buatApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const staf = async (u) => (await api('/api/auth/login', { method: 'POST', body: { username: u, password: 'rahasia1' } })).data.token;
  tAdmin = await staf('admin'); tPetugas = await staf('petugas.qc');
  const kar = async (nik) => (await api('/api/portal/login', { method: 'POST', body: { nik, sandi: 'rahasia1' } })).data.token;
  tBudi = await kar('SNL-1'); tSiti = await kar('SNL-2');
});
after(() => server?.close());

test('jarak & catatan lokasi: hanya ditandai jauh bila di luar radius setelah akurasi GPS', () => {
  assert.ok(Math.abs(jarakMeter(PABRIK, JAUH) - 4502) < 20);
  assert.equal(catatLokasi(DEKAT, PABRIK).jauh, false);
  assert.equal(catatLokasi(JAUH, PABRIK).jauh, true);
  assert.equal(catatLokasi({ lat: -6.3040, lng: 107.152, akurasi: 200 }, PABRIK).jauh, false); // 390 m, akurasi 200 m
  assert.deepEqual(Object.keys(catatLokasi({ gagal: 'Izin lokasi ditolak' }, PABRIK)).sort(), ['gagal', 'waktu']);
  assert.equal(catatLokasi(DEKAT, null).jarakM, undefined); // titik pabrik belum diatur → koordinat saja
});

test('tanpa izin admin, tap eksklusif ditolak', async () => {
  const r = await tapE({ kartu: 'LMB-K1', lokasi: DEKAT, simulasi: '2026-11-04T16:00' });
  assert.equal(r.status, 403);
  assert.equal(r.data.kode, 'TANPA_IZIN_EKSKLUSIF');
  assert.equal((await api('/api/portal/tap', { token: tBudi })).data.eksklusif, null);
});

test('admin memberi izin (alasan wajib, tanggal tidak boleh lewat); petugas tidak boleh', async () => {
  assert.equal((await api('/api/mandiri/eksklusif/1', { method: 'PUT', token: tPetugas, body: { sampai: besok(), alasan: 'Shift malam' } })).status, 403);
  assert.equal((await api('/api/mandiri/eksklusif/1', { method: 'PUT', token: tAdmin, body: { sampai: besok() } })).status, 400);
  assert.equal((await api('/api/mandiri/eksklusif/1', { method: 'PUT', token: tAdmin, body: { sampai: '2026-01-01', alasan: 'Shift malam' } })).status, 400);
  const r = await api('/api/mandiri/eksklusif/1', { method: 'PUT', token: tAdmin, body: { sampai: besok(), alasan: 'Lembur sendirian shift malam' } });
  assert.equal(r.status, 200);
  const st = await api('/api/portal/tap', { token: tBudi });
  assert.equal(st.data.eksklusif.alasan, 'Lembur sendirian shift malam');
  assert.equal((await api('/api/mandiri/lokasi-pabrik', { method: 'PUT', token: tAdmin, body: { lokasiPabrik: PABRIK } })).data.lokasiPabrik.radiusM, 300);
});

test('kartu orang lain, kartu lama, dan wajah lain ditolak', async () => {
  let r = await tapE({ kartu: 'LMB-K2', lokasi: DEKAT, simulasi: '2026-11-04T16:00' });
  assert.equal(r.data.kode, 'KARTU_BUKAN_MILIK');
  r = await tapE({ kartu: 'LMB-LAMA1', lokasi: DEKAT, simulasi: '2026-11-04T16:00' });
  assert.equal(r.status, 410);
  r = await tapE({ kartu: 'LMB-K1', vektor: LAIN, lokasi: DEKAT, simulasi: '2026-11-04T16:00' });
  assert.equal(r.data.kode, 'WAJAH_TIDAK_COCOK');
  r = await tapE({ kartu: 'LMB-K1', hidup: false, simulasi: '2026-11-04T16:00' });
  assert.equal(r.status, 400);
  assert.equal(prisma._db.sesiLembur.length, 0);
});

test('sekali scan: dihitung seperti scan petugas (5,5 / 14 jam), lokasi dicatat, penanggung jawab = admin pemberi izin', async () => {
  let r = await tapE({ kartu: 'LMB-K1', lokasi: DEKAT, simulasi: '2026-11-04T19:00' }); // Rabu
  assert.equal(r.status, 201);
  assert.equal(r.data.status, 'OK');
  assert.equal(r.data.lembur.sumber, 'EKSKLUSIF');
  assert.equal(r.data.lembur.jenisHari, 'KERJA');
  assert.equal(r.data.lembur.jamHitung, 5.5);
  assert.equal(r.data.lembur.nominal, Math.round(5.5 * Math.round(5_190_000 / 173)));
  assert.equal(r.data.lokasi.jauh, false);
  assert.equal(prisma._db.sesiLembur.length, 0); // tidak ada tap in / tap out
  const t = prisma._db.lembur.at(-1);
  assert.equal(t.petugasId, 1);
  assert.equal(t.metode ?? 'TETAP', 'TETAP');
  // scan kedua di hari yang sama ditolak
  r = await tapE({ kartu: 'LMB-K1', lokasi: DEKAT, simulasi: '2026-11-04T19:05' });
  assert.equal(r.status, 409);
  assert.equal(r.data.kode, 'SUDAH_TAP');
  // hari libur = 14 jam hitung; lokasi jauh tetap tercatat tapi ditandai
  r = await tapE({ kartu: 'LMB-K1', lokasi: JAUH, simulasi: '2026-11-08T09:00' }); // Minggu
  assert.equal(r.status, 201);
  assert.equal(r.data.lembur.jamHitung, 14);
  assert.equal(r.data.lokasi.jauh, true);
  const daftar = await api('/api/mandiri/eksklusif', { token: tAdmin });
  assert.equal(daftar.data.tap.length, 2);
  assert.equal(daftar.data.tap.find((x) => x.tanggal === '2026-11-08').lokasi.jarakM > 4000, true);
  assert.equal(daftar.data.izin[0].berlaku, true);
  assert.equal(daftar.data.lokasiPabrik.nama, 'PT Sanly Cikarang');
});

test('lokasi gagal tetap boleh tap (hanya dicatat); tap in mandiri yang terbuka harus ditutup dulu', async () => {
  const r = await tapE({ kartu: 'LMB-K1', lokasi: { gagal: 'Izin lokasi ditolak' }, simulasi: '2026-11-07T08:00' });
  assert.equal(r.status, 201);
  assert.equal(prisma._db.lembur.at(-1).rincianHitung.lokasi.gagal, 'Izin lokasi ditolak');
  prisma._db.sesiLembur.push({ id: 99, karyawanId: 1, tanggal: new Date('2026-11-09T00:00:00Z'), mulai: new Date(), petugasId: 2 });
  const s = await tapE({ kartu: 'LMB-K1', simulasi: '2026-11-09T08:00' });
  assert.equal(s.data.kode, 'ADA_TAP_IN');
  prisma._db.sesiLembur.length = 0;
});

test('izin berakhir atau dicabut → kembali wajib QR petugas', async () => {
  prisma._db.karyawan[0].eksklusifSampai = new Date(Date.now() - 60000);
  let r = await tapE({ kartu: 'LMB-K1', simulasi: '2026-11-07T08:00' });
  assert.equal(r.data.kode, 'TANPA_IZIN_EKSKLUSIF');
  assert.match(r.data.pesan, /berakhir/);
  assert.equal((await api('/api/mandiri/eksklusif/1', { method: 'DELETE', token: tAdmin })).status, 204);
  r = await tapE({ kartu: 'LMB-K1', simulasi: '2026-11-07T08:00' });
  assert.match(r.data.pesan, /tidak punya izin/);
  assert.equal((await tapE({ kartu: 'LMB-K2', simulasi: '2026-11-07T08:00' }, tSiti)).data.kode, 'TANPA_IZIN_EKSKLUSIF');
});
