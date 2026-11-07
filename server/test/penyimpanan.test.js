// Uji foto SPL ke "Neon Object Storage" memakai server S3 tiruan lokal (path-style),
// jadi konfigurasi AWS SDK yang sungguhan ikut teruji.
import { after, before, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import bcrypt from 'bcryptjs';
import { buatFakePrisma } from './fakePrisma.js';
import { waktuJakarta } from '../src/lib/lembur.js';

const objek = new Map(); // "/bucket/key" -> { body, tipe }
const log = [];
const bucketAda = new Set(); // bucket belum dibuat: unggahan pertama membuatnya otomatis
const s3 = http.createServer((req, res) => {
  const potong = [];
  req.on('data', (c) => potong.push(c));
  req.on('end', () => {
    const p = decodeURIComponent(req.url.split('?')[0]);
    log.push(`${req.method} ${p}`);
    if (!/^AWS4-HMAC-SHA256 Credential=UJI-KEY\//.test(req.headers.authorization || '')) { res.writeHead(403); return res.end(); }
    const bucket = p.split('/')[1];
    if (req.method === 'PUT' && p.replace(/\/$/, '') === `/${bucket}`) { bucketAda.add(bucket); res.writeHead(200); return res.end(); }
    if (!bucketAda.has(bucket)) { res.writeHead(404, { 'Content-Type': 'application/xml' }); return res.end('<Error><Code>NoSuchBucket</Code><Message>The specified bucket does not exist</Message></Error>'); }
    if (req.method === 'PUT') { objek.set(p, { body: Buffer.concat(potong), tipe: req.headers['content-type'] }); res.writeHead(200, { ETag: '"x"' }); return res.end(); }
    if (req.method === 'GET') {
      const o = objek.get(p);
      if (!o) { res.writeHead(404, { 'Content-Type': 'application/xml' }); return res.end('<Error><Code>NoSuchKey</Code></Error>'); }
      res.writeHead(200, { 'Content-Type': o.tipe, 'Content-Length': o.body.length }); return res.end(o.body);
    }
    if (req.method === 'DELETE') { objek.delete(p); res.writeHead(204); return res.end(); }
    res.writeHead(405); return res.end();
  });
}).listen(0);
await new Promise((r) => s3.once('listening', r));

process.env.JWT_SECRET = 'rahasia-uji';
process.env.AWS_ENDPOINT_URL_S3 = `http://127.0.0.1:${s3.address().port}`;
process.env.AWS_REGION = 'ap-southeast-1';
process.env.AWS_ACCESS_KEY_ID = 'UJI-KEY';
process.env.AWS_SECRET_ACCESS_KEY = 'uji-rahasia';
process.env.STORAGE_BUCKET = 'foto-spl';

const prisma = buatFakePrisma();
mock.module('@prisma/client', { namedExports: { Prisma: { PrismaClientKnownRequestError: class extends Error {} }, PrismaClient: class {} } });
mock.module('../src/lib/prisma.js', { namedExports: { prisma } });

let server; let base;
const hariIni = waktuJakarta().tanggal;
const kemarin = (() => { const d = new Date(`${hariIni}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })();
const WEBP = Buffer.from('UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAQAcJaQAA3AA/v3AgAA=', 'base64');

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(base + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const tipe = res.headers.get('content-type') || '';
  return { status: res.status, tipe, data: tipe.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) };
}
let token;

before(async () => {
  prisma._db.user.push({ id: 1, username: 'admin.hrd', passwordHash: await bcrypt.hash('rahasia1', 4), nama: 'Admin', role: 'ADMIN', area: 'Semua', aktif: true });
  prisma._db.karyawan.push(
    { id: 1, nik: 'SNL-1', nama: 'Dewi', departemen: 'QC', jabatan: 'Op', upahBulanan: 5_000_000, qrToken: 'L1', aktif: true },
    { id: 2, nik: 'SNL-2', nama: 'Budi', departemen: 'QC', jabatan: 'Op', upahBulanan: 5_000_000, qrToken: 'L2', aktif: true },
  );
  const { buatApp } = await import('../src/app.js');
  server = buatApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  token = (await api('/api/auth/login', { method: 'POST', body: { username: 'admin.hrd', password: 'rahasia1' } })).data.token;
});
after(() => { server?.close(); s3.close(); });

test('foto SPL diunggah ke object storage, bukan ke database', async () => {
  const r = await api('/api/lembur-massal', { method: 'POST', token, body: { tanggal: kemarin, jam: '19:00', alasan: 'Dari foto', karyawanIds: [1], sumber: 'FOTO', foto: `data:image/webp;base64,${WEBP.toString('base64')}` } });
  assert.equal(r.status, 201);
  const spl = prisma._db.spl.find((x) => x.id === r.data.splId);
  assert.equal(spl.foto, undefined, 'tidak ada byte foto di database');
  assert.match(spl.fotoKey, /^spl\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.webp$/);
  assert.equal(spl.fotoUkuran, WEBP.length);
  const o = objek.get(`/foto-spl/${spl.fotoKey}`);
  assert.ok(o, 'path-style: /bucket/key');
  assert.equal(o.tipe, 'image/webp');
  assert.deepEqual(o.body, WEBP);

  const f = await api(`/api/lembur-massal/spl/${spl.id}/foto`, { token });
  assert.equal(f.status, 200);
  assert.equal(f.tipe, 'image/webp');
  assert.deepEqual(f.data, WEBP);
});

test('kalau tidak ada lembur yang tercatat, foto ikut dihapus dari storage', async () => {
  const n = objek.size;
  const r = await api('/api/lembur-massal', { method: 'POST', token, body: { tanggal: kemarin, jam: '19:00', alasan: 'Dobel', karyawanIds: [1], sumber: 'FOTO', foto: `data:image/webp;base64,${WEBP.toString('base64')}` } });
  assert.equal(r.status, 409);
  assert.equal(objek.size, n);
  assert.ok(log.some((l) => l.startsWith('DELETE /foto-spl/spl/')));
});

test('foto lebih dari 13 bulan dihapus, data lembur tetap ada', async () => {
  const { bersihkanFotoLama } = await import('../src/lib/fotoSpl.js');
  const spl = prisma._db.spl[0];
  spl.createdAt = new Date(Date.now() - 400 * 24 * 3600 * 1000);
  const n = await bersihkanFotoLama({ paksa: true });
  assert.equal(n, 1);
  assert.equal(objek.size, 0);
  assert.ok(spl.fotoDihapus instanceof Date);
  assert.equal(spl.fotoKey, null);
  assert.ok(prisma._db.lembur.some((t) => t.splId === spl.id), 'tap lembur tidak ikut terhapus');
  const f = await api(`/api/lembur-massal/spl/${spl.id}/foto`, { token });
  assert.equal(f.status, 410);
});

test('storage mati: foto disimpan di database, lembur tetap tercatat, admin diberi tahu penyebabnya', async () => {
  const sebelum = prisma._db.lembur.length;
  s3.close();
  const r = await api('/api/lembur-massal', { method: 'POST', token, body: { tanggal: kemarin, jam: '19:00', alasan: 'Storage mati', karyawanIds: [2], sumber: 'FOTO', foto: `data:image/webp;base64,${WEBP.toString('base64')}` } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(prisma._db.lembur.length, sebelum + 1);
  assert.match(r.data.peringatanFoto, /tidak bisa dihubungi/);
  const spl = prisma._db.spl.find((x) => x.id === r.data.splId);
  assert.equal(spl.fotoKey ?? null, null);
  assert.ok(Buffer.from(spl.foto).equals(WEBP));
  const f = await api(`/api/lembur-massal/spl/${spl.id}/foto`, { token });
  assert.equal(f.status, 200);
  assert.ok(f.data.equals(WEBP));
});

test('bucket yang belum ada dibuat otomatis saat unggahan pertama', () => {
  assert.ok(log.some((l) => /^PUT \/foto-spl\/?$/.test(l)), log.join(', '));
});

test('penjelasan galat penyimpanan untuk admin', async () => {
  const { jelaskanGalat } = await import('../src/lib/penyimpanan.js');
  assert.match(jelaskanGalat({ name: 'InvalidAccessKeyId', $metadata: { httpStatusCode: 403 } }), /AWS_ACCESS_KEY_ID/);
  assert.match(jelaskanGalat({ name: 'SignatureDoesNotMatch', $metadata: { httpStatusCode: 403 } }), /AWS_SECRET_ACCESS_KEY/);
  assert.match(jelaskanGalat({ name: 'AccessDenied', $metadata: { httpStatusCode: 403 } }), /storage:write/);
  assert.match(jelaskanGalat({ name: 'AuthorizationHeaderMalformed' }), /AWS_REGION/);
  assert.match(jelaskanGalat({ name: 'Error', code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND br-x' }), /tidak bisa dihubungi/);
});
