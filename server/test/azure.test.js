// Uji pembaca SPL lewat Azure memakai server Azure tiruan lokal.
import { after, before, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import bcrypt from 'bcryptjs';
import { buatFakePrisma } from './fakePrisma.js';
import { waktuJakarta } from '../src/lib/lembur.js';

const permintaan = [];
let jawabStatus = 200;
const azure = http.createServer((req, res) => {
  const potong = [];
  req.on('data', (c) => potong.push(c));
  req.on('end', () => {
    permintaan.push({ url: req.url, kunci: req.headers['ocp-apim-subscription-key'], tipe: req.headers['content-type'], ukuran: Buffer.concat(potong).length });
    if (jawabStatus !== 200) { res.writeHead(jawabStatus, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: { message: 'Access denied' } })); }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      metadata: { width: 800, height: 600 },
      readResult: { blocks: [{ lines: [{ text: 'Dodi Setiawan', boundingPolygon: [{ x: 10, y: 10 }, { x: 200, y: 10 }, { x: 200, y: 40 }, { x: 10, y: 40 }],
        words: [{ text: 'Dodi', boundingPolygon: [{ x: 10, y: 10 }, { x: 80, y: 10 }, { x: 80, y: 40 }, { x: 10, y: 40 }], confidence: 0.98 },
          { text: 'Setiawan', boundingPolygon: [{ x: 90, y: 10 }, { x: 200, y: 10 }, { x: 200, y: 40 }, { x: 90, y: 40 }], confidence: 0.91 }] }] }] },
    }));
  });
}).listen(0);
await new Promise((r) => azure.once('listening', r));

process.env.JWT_SECRET = 'rahasia-uji';
process.env.AZURE_VISION_ENDPOINT = `http://127.0.0.1:${azure.address().port}/`;
process.env.AZURE_VISION_KEY = 'kunci-uji';
process.env.AZURE_VISION_BATAS_BULANAN = '3';

const prisma = buatFakePrisma();
mock.module('@prisma/client', { namedExports: { Prisma: { PrismaClientKnownRequestError: class extends Error {} }, PrismaClient: class {} } });
mock.module('../src/lib/prisma.js', { namedExports: { prisma } });

let server; let base; let token;
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGP4DwABAQEAWk1v8QAAAABJRU5ErkJggg==';
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => null) };
}

before(async () => {
  prisma._db.user.push({ id: 1, username: 'petugas.qc', passwordHash: await bcrypt.hash('rahasia1', 4), nama: 'P', role: 'PETUGAS', area: 'QC', aktif: true });
  prisma._db.karyawan.push({ id: 1, nik: 'SNL-1', nama: 'Dodi Setiawan', departemen: 'QC', jabatan: 'Op', upahBulanan: 5_000_000, qrToken: 'L1', aktif: true });
  const { buatApp } = await import('../src/app.js');
  server = buatApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  token = (await api('/api/auth/login', { method: 'POST', body: { username: 'petugas.qc', password: 'rahasia1' } })).data.token;
});
after(() => { server?.close(); azure.close(); });

test('batas memberi tahu pembaca Azure aktif dan sisa kuota', async () => {
  const r = await api('/api/lembur-massal/batas');
  assert.equal(r.data.pembaca.jenis, 'AZURE');
  assert.equal(r.data.pembaca.sisa, 3);
});

test('potongan SPL dikirim ke Azure dan hasilnya diteruskan', async () => {
  const r = await api('/api/lembur-massal/baca-spl', { method: 'POST', body: { gambar: PNG } });
  assert.equal(r.status, 200);
  assert.equal(r.data.baris[0].teks, 'Dodi Setiawan');
  assert.equal(r.data.baris[0].kata[1].yakin, 0.91);
  assert.equal(r.data.pemakaian.jumlah, 1);
  const p = permintaan.at(-1);
  assert.match(p.url, /\/computervision\/imageanalysis:analyze\?api-version=2024-02-01&features=read$/);
  assert.equal(p.kunci, 'kunci-uji');
  assert.equal(p.tipe, 'application/octet-stream');
  assert.ok(p.ukuran > 10);
});

test('dibatasi: terlalu cepat, bukan gambar, dan kuota habis', async () => {
  assert.equal((await api('/api/lembur-massal/baca-spl', { method: 'POST', body: { gambar: PNG } })).status, 429);
  await tidur(3100);
  assert.equal((await api('/api/lembur-massal/baca-spl', { method: 'POST', body: { gambar: 'data:text/plain;base64,aGFp' } })).status, 400);
  await tidur(3100);
  assert.equal((await api('/api/lembur-massal/baca-spl', { method: 'POST', body: { gambar: PNG } })).status, 200);
  await tidur(3100);
  assert.equal((await api('/api/lembur-massal/baca-spl', { method: 'POST', body: { gambar: PNG } })).status, 200);
  await tidur(3100);
  const habis = await api('/api/lembur-massal/baca-spl', { method: 'POST', body: { gambar: PNG } });
  assert.equal(habis.status, 429);
  assert.equal(habis.data.kode, 'KUOTA_HABIS');
});

test('kunci Azure salah memberi pesan yang jelas', async () => {
  prisma._db.pemakaianOcr.length = 0;
  jawabStatus = 401;
  await tidur(3100);
  const r = await api('/api/lembur-massal/baca-spl', { method: 'POST', body: { gambar: PNG } });
  assert.equal(r.status, 502);
  assert.equal(r.data.kode, 'AZURE_KUNCI');
});

test('simpan dengan jam & alasan berbeda per karyawan', async () => {
  prisma._db.karyawan.push({ id: 2, nik: 'SNL-2', nama: 'Aryono', departemen: 'QC', jabatan: 'Op', upahBulanan: 5_000_000, qrToken: 'L2', aktif: true });
  const d = new Date(`${waktuJakarta().tanggal}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1);
  const r = await api('/api/lembur-massal', { method: 'POST', body: {
    tanggal: d.toISOString().slice(0, 10), jam: '18:30', alasan: 'Cek di line 2', karyawanIds: [1, 2],
    rincian: [{ karyawanId: 2, jam: '16:00', alasan: 'Sortir BIS' }],
  } });
  assert.equal(r.status, 201);
  const t1 = prisma._db.lembur.find((t) => t.karyawanId === 1);
  const t2 = prisma._db.lembur.find((t) => t.karyawanId === 2);
  assert.equal(t1.waktuTap.toISOString().slice(11, 16), '11:30'); // 18:30 WIB
  assert.equal(t2.waktuTap.toISOString().slice(11, 16), '09:00'); // 16:00 WIB
  assert.match(t1.alasan, /Cek di line 2/);
  assert.match(t2.alasan, /Sortir BIS/);
});
