// Tap lembur mandiri: wajah disetujui admin → pindai QR dinamis petugas → tap in / tap out (PP 35/2021).
import { before, after, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { buatFakePrisma } from './fakePrisma.js';

process.env.JWT_SECRET = 'rahasia-uji';
process.env.IZINKAN_WAKTU_SIMULASI = 'true';

const prisma = buatFakePrisma();
mock.module('@prisma/client', { namedExports: { Prisma: { PrismaClientKnownRequestError: class extends Error {} }, PrismaClient: class {} } });
mock.module('../src/lib/prisma.js', { namedExports: { prisma } });

const { buatQrMandiri } = await import('../src/lib/qrMandiri.js');

let server; let base;
async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => null) };
}
const WAJAH = Array.from({ length: 128 }, (_, i) => Math.sin(i) * 0.1);
const MIRIP = WAJAH.map((x, i) => x + (i % 2 ? 0.01 : -0.01)); // jarak ≈ 0,11
const LAIN = WAJAH.map((x) => -x); // jarak jauh
const FOTO = `data:image/webp;base64,${Buffer.from('foto-wajah-kecil').toString('base64')}`;
let tAdmin; let tPetugas; let tGudang; let tKaryawan; let tKaryawan2;

before(async () => {
  const hash = await bcrypt.hash('rahasia1', 4);
  prisma._db.user.push(
    { id: 1, username: 'admin', passwordHash: hash, nama: 'Admin', role: 'ADMIN', area: 'Semua', aktif: true },
    { id: 2, username: 'petugas.qc', passwordHash: hash, nama: 'Leader QC', role: 'PETUGAS', area: 'QC', aktif: true },
    { id: 3, username: 'petugas.gudang', passwordHash: hash, nama: 'Leader Gudang', role: 'PETUGAS', area: 'Gudang', aktif: true },
  );
  const k = (id, nik, nama, dep) => ({ id, nik, nama, departemen: dep, jabatan: 'Operator', upahBulanan: 5_190_000, qrToken: `Q${id}`, aktif: true, sandiHash: hash, wajibGantiSandi: false, perluCetakUlang: false });
  prisma._db.karyawan.push(k(1, 'SNL-1', 'Budi QC', 'QC'), k(2, 'SNL-2', 'Siti QC', 'QC'), k(3, 'SNL-3', 'Andi QC', 'QC'));
  const { buatApp } = await import('../src/app.js');
  server = buatApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const staf = async (u) => (await api('/api/auth/login', { method: 'POST', body: { username: u, password: 'rahasia1' } })).data.token;
  tAdmin = await staf('admin'); tPetugas = await staf('petugas.qc'); tGudang = await staf('petugas.gudang');
  tKaryawan = (await api('/api/portal/login', { method: 'POST', body: { nik: 'SNL-1', sandi: 'rahasia1' } })).data.token;
  tKaryawan2 = (await api('/api/portal/login', { method: 'POST', body: { nik: 'SNL-2', sandi: 'rahasia1' } })).data.token;
});
after(() => server?.close());

const qrPetugas = async (token = tPetugas) => (await api('/api/scan/qr-mandiri', { token })).data.isi;
const tap = (body, token = tKaryawan) => api('/api/portal/tap', { method: 'POST', token, body: { hidup: true, ...body } });

test('QR dinamis untuk petugas berganti dan bertanda tangan', async () => {
  const r = await api('/api/scan/qr-mandiri', { token: tPetugas });
  assert.equal(r.status, 200);
  assert.match(r.data.isi, /^LQM1\.2\.\d+\.[\w-]{22}$/);
  assert.equal(r.data.periodeDetik, 10);
  assert.equal((await api('/api/scan/qr-mandiri', { token: tKaryawan })).status, 401); // karyawan tidak boleh
});

test('daftar wajah wajib persetujuan, lalu menunggu admin', async () => {
  let r = await api('/api/portal/wajah', { method: 'POST', token: tKaryawan, body: { vektor: WAJAH, foto: FOTO } });
  assert.equal(r.status, 400);
  r = await api('/api/portal/wajah', { method: 'POST', token: tKaryawan, body: { vektor: WAJAH.slice(1), foto: FOTO, setuju: true } });
  assert.equal(r.status, 400); // vektor harus 128 angka
  r = await api('/api/portal/wajah', { method: 'POST', token: tKaryawan, body: { vektor: WAJAH, foto: FOTO, setuju: true } });
  assert.equal(r.status, 201);
  assert.equal((await api('/api/portal/wajah', { token: tKaryawan })).data.status, 'MENUNGGU');
  r = await tap({ qr: await qrPetugas(), vektor: WAJAH, simulasi: '2026-11-04T16:05' });
  assert.equal(r.status, 403);
  assert.equal(r.data.kode, 'WAJAH_BELUM');
});

test('admin melihat foto dan menyetujui (tolak wajib alasan)', async () => {
  let r = await api('/api/mandiri/wajah', { token: tAdmin });
  assert.equal(r.data.menunggu, 1);
  assert.equal(r.data.list[0].karyawan.nama, 'Budi QC');
  const foto = await fetch(`${base}/api/mandiri/wajah/1/foto`, { headers: { Authorization: `Bearer ${tAdmin}` } });
  assert.equal(foto.headers.get('content-type'), 'image/webp');
  assert.equal((await api('/api/mandiri/wajah/1', { method: 'POST', token: tAdmin, body: { setuju: false } })).status, 400);
  assert.equal((await api('/api/mandiri/wajah', { token: tPetugas })).status, 403); // petugas tidak boleh
  r = await api('/api/mandiri/wajah/1', { method: 'POST', token: tAdmin, body: { setuju: true } });
  assert.equal(r.data.status, 'DISETUJUI');
});

test('wajah lain, QR palsu/kedaluwarsa, dan QR beda area ditolak', async () => {
  let r = await tap({ qr: await qrPetugas(), vektor: LAIN, simulasi: '2026-11-04T16:05' });
  assert.equal(r.data.kode, 'WAJAH_TIDAK_COCOK');
  assert.equal(r.data.jarak, undefined); // jarak tidak dibocorkan
  const qr = await qrPetugas();
  r = await tap({ qr: `${qr.slice(0, -2)}xx`, vektor: MIRIP });
  assert.equal(r.data.kode, 'QR_PALSU');
  r = await tap({ qr: buatQrMandiri(2, Date.now() - 25_000).isi, vektor: MIRIP }); // 2,5 periode lalu
  assert.equal(r.data.kode, 'QR_KEDALUWARSA');
  r = await tap({ qr: 'LMB-ABC', vektor: MIRIP });
  assert.equal(r.data.kode, 'QR_BUKAN_MANDIRI');
  r = await tap({ qr: await qrPetugas(tGudang), vektor: MIRIP });
  assert.equal(r.data.kode, 'QR_BEDA_AREA');
  r = await api('/api/portal/tap', { method: 'POST', token: tKaryawan, body: { qr: await qrPetugas(), vektor: MIRIP } });
  assert.equal(r.status, 400); // tanpa pemeriksaan wajah hidup
});

test('tap in → tap out: dihitung jam aktual sejak jam pulang, dibulatkan 30 menit', async () => {
  let r = await tap({ qr: await qrPetugas(), vektor: MIRIP, simulasi: '2026-11-04T16:05' });
  assert.equal(r.status, 201);
  assert.equal(r.data.status, 'TAP_IN');
  r = await api('/api/portal/tap?simulasi=2026-11-04T17:05', { token: tKaryawan });
  assert.equal(r.data.sesi.jamMulai, '16:05');
  assert.equal(r.data.sesi.menitBerjalan, 60);
  r = await tap({ qr: await qrPetugas(), vektor: MIRIP, simulasi: '2026-11-04T16:07' });
  assert.equal(r.data.kode, 'TERLALU_CEPAT');
  r = await tap({ qr: await qrPetugas(), vektor: MIRIP, simulasi: '2026-11-04T19:10' });
  assert.equal(r.status, 201);
  assert.equal(r.data.status, 'TAP_OUT');
  // Bawaan: jam pulang 16:30 → 16:30–19:10 = 160 menit → dibulatkan 150 menit = 2,5 jam
  assert.equal(r.data.hitung.mulaiDihitung, '16:30');
  assert.equal(r.data.lembur.menitLembur, 150);
  assert.equal(r.data.lembur.jamHitung, 4.5); // 1×1,5 + 1,5×2
  assert.equal(r.data.lembur.nominal, 4.5 * 30000);
  assert.equal(r.data.lembur.jamMulai, '16:05');
  const t = prisma._db.lembur.at(-1);
  assert.equal(t.metode, 'AKTUAL'); assert.equal(t.sumber, 'MANDIRI'); assert.ok(t.jarakWajah < 0.5);
  assert.equal(prisma._db.sesiLembur.length, 0);
  assert.ok(prisma._db.notifikasi.some((n) => /16:05–19:10/.test(n.isi)));
  r = await tap({ qr: await qrPetugas(), vektor: MIRIP, simulasi: '2026-11-04T20:00' });
  assert.equal(r.data.kode, 'SUDAH_TAP');
});

test('petugas melihat siapa yang tap lewat QR-nya hari ini', async () => {
  let r = await api('/api/scan/qr-mandiri/pemakai?simulasi=2026-11-04T20:00', { token: tPetugas });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.kejadian.map((k) => [k.jenis, k.jam, k.karyawan.nama]), [['TAP_OUT', '19:10', 'Budi QC'], ['TAP_IN', '16:05', 'Budi QC']]);
  r = await api('/api/scan/qr-mandiri/pemakai?simulasi=2026-11-04T20:00', { token: tGudang });
  assert.equal(r.data.kejadian.length, 0); // QR petugas lain tidak ikut
});

test('riwayat portal menampilkan jam mulai–selesai', async () => {
  const r = await api('/api/portal/ringkasan?bulan=2026-11', { token: tKaryawan });
  const t = r.data.taps.find((x) => x.tanggal === '2026-11-04');
  assert.equal(t.metode, 'AKTUAL');
  assert.equal(t.jamMulai, '16:05');
  assert.equal(t.jamSelesai, '19:10');
  assert.deepEqual(t.rincian, [{ jam: 1, kali: 1.5 }, { jam: 1.5, kali: 2 }]);
});

test('admin mengubah aturan: pola 6 hari, hari Minggu 8 jam dipotong istirahat 1 jam = 14', async () => {
  const r0 = await api('/api/mandiri/aturan', { method: 'PUT', token: tAdmin, body: { polaKerja: 7 } });
  assert.equal(r0.status, 400);
  const r1 = await api('/api/mandiri/aturan', {
    method: 'PUT', token: tAdmin,
    body: { polaKerja: 6, hariTerpendek: 6, jamPulang: '16:00', jamPulangTerpendek: '13:30', istirahat: [{ mulai: '12:00', selesai: '13:00' }], pembulatanMenit: 1 },
  });
  assert.equal(r1.status, 200);
  assert.equal(r1.data.aturan.polaKerja, 6);
  let r = await tap({ qr: await qrPetugas(), vektor: MIRIP, simulasi: '2026-11-08T07:00' });
  assert.equal(r.data.status, 'TAP_IN');
  r = await tap({ qr: await qrPetugas(), vektor: MIRIP, simulasi: '2026-11-08T15:00' });
  assert.equal(r.data.status, 'TAP_OUT');
  assert.equal(r.data.lembur.jenisHari, 'LIBUR');
  assert.equal(r.data.lembur.menitLembur, 7 * 60);
  assert.equal(r.data.lembur.jamHitung, 14);
});

test('tap out sebelum jam pulang tidak membuat lembur; batal tap in & sesi di admin', async () => {
  // Karyawan 2 mendaftar & disetujui
  await api('/api/portal/wajah', { method: 'POST', token: tKaryawan2, body: { vektor: WAJAH, foto: FOTO, setuju: true } });
  await api('/api/mandiri/wajah/2', { method: 'POST', token: tAdmin, body: { setuju: true } });
  let r = await tap({ qr: await qrPetugas(), vektor: MIRIP, simulasi: '2026-11-05T14:00' }, tKaryawan2);
  assert.equal(r.data.status, 'TAP_IN');
  r = await tap({ qr: await qrPetugas(), vektor: MIRIP, simulasi: '2026-11-05T15:30' }, tKaryawan2);
  assert.equal(r.data.status, 'TIDAK_DIHITUNG');
  assert.equal(prisma._db.lembur.filter((t) => t.karyawanId === 2).length, 0);
  r = await tap({ qr: await qrPetugas(), vektor: MIRIP, simulasi: '2026-11-05T16:10' }, tKaryawan2);
  assert.equal(r.data.status, 'TAP_IN');
  r = await api('/api/mandiri/sesi', { token: tAdmin });
  assert.equal(r.data.length, 1);
  assert.equal(r.data[0].karyawan.nama, 'Siti QC');
  assert.equal((await api('/api/portal/tap', { method: 'DELETE', token: tKaryawan2 })).status, 204);
  assert.equal((await api('/api/mandiri/sesi', { token: tAdmin })).data.length, 0);
});

test('input massal dengan jam mulai: dihitung jam aktual PP 35/2021', async () => {
  const r = await api('/api/lembur-massal', {
    method: 'POST', token: tAdmin,
    body: { tanggal: '2026-11-04', mulai: '07:30', jam: '18:30', alasan: 'Repair line', karyawanIds: [3] },
  });
  assert.equal(r.status, 201);
  // Aturan sekarang: jam pulang 16:00, per menit → 16:00–18:30 = 2,5 jam → 4,5 jam hitung
  assert.equal(r.data.hasil[0].jamHitung, 4.5);
  assert.equal(r.data.hasil[0].menitLembur, 150);
  const t = prisma._db.lembur.find((x) => x.karyawanId === 3);
  assert.equal(t.metode, 'AKTUAL'); assert.equal(t.sumber, 'MASSAL');
  assert.equal(t.selesai.toISOString(), '2026-11-04T11:30:00.000Z');
  // Jam mulai–selesai yang tidak menghasilkan lembur ditolak per karyawan
  const r2 = await api('/api/lembur-massal', {
    method: 'POST', token: tAdmin,
    body: { tanggal: '2026-11-05', mulai: '07:30', jam: '15:00', alasan: 'Repair line', karyawanIds: [3] },
  });
  assert.equal(r2.status, 409);
  assert.match(r2.data.hasil[0].pesan, /tidak ada jam lembur/);
});
