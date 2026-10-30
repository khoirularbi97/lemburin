// Uji pengiriman Web Push ke endpoint lokal (tanpa layanan push sungguhan).
import { after, before, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import webpush from 'web-push';
import { buatFakePrisma } from './fakePrisma.js';

const kunci = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = kunci.publicKey;
process.env.VAPID_PRIVATE_KEY = kunci.privateKey;
process.env.VAPID_SUBJECT = 'mailto:uji@lemburin.local';

const prisma = buatFakePrisma();
mock.module('../src/lib/prisma.js', { namedExports: { prisma } });
const { infoPush, kirimKeKaryawan } = await import('../src/lib/notifikasi.js');

const masuk = [];
let jawab = 201;
let server;
let base;

function kunciBrowser() {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  return { p256dh: ecdh.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') };
}

// web-push selalu memakai HTTPS: buat sertifikat sementara untuk server lokal
function sertifikat() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lemburin-push-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=127.0.0.1',
    '-keyout', path.join(dir, 'k.pem'), '-out', path.join(dir, 'c.pem')], { stdio: 'ignore' });
  return { key: fs.readFileSync(path.join(dir, 'k.pem')), cert: fs.readFileSync(path.join(dir, 'c.pem')) };
}

before(async () => {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // hanya di uji ini, sertifikat buatan sendiri
  server = https.createServer(sertifikat(), (req, res) => {
    const potong = [];
    req.on('data', (c) => potong.push(c));
    req.on('end', () => { masuk.push({ url: req.url, headers: req.headers, body: Buffer.concat(potong) }); res.writeHead(jawab); res.end(); });
  }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `https://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('kunci publik VAPID dibagikan ke portal', () => {
  const i = infoPush();
  assert.equal(i.web, true);
  assert.equal(i.kunciPublik, kunci.publicKey);
  assert.equal(i.fcm, false);
});

test('notifikasi terenkripsi terkirim ke semua perangkat karyawan', async () => {
  const k = kunciBrowser();
  prisma._db.langgananPush.push(
    { id: 1, karyawanId: 7, jenis: 'WEB', endpoint: `${base}/hp`, ...k },
    { id: 2, karyawanId: 7, jenis: 'WEB', endpoint: `${base}/laptop`, ...kunciBrowser() },
    { id: 3, karyawanId: 8, jenis: 'WEB', endpoint: `${base}/orang-lain`, ...kunciBrowser() },
  );
  const n = await kirimKeKaryawan(7, { judul: 'Lembur tercatat', isi: 'Kam, 29 Okt · Rp158.961', url: '/portal', tag: 'tap-1' });
  assert.equal(n, 2);
  assert.deepEqual(masuk.map((m) => m.url).sort(), ['/hp', '/laptop']);
  const m = masuk[0];
  assert.equal(m.headers['content-encoding'], 'aes128gcm');
  assert.match(m.headers.authorization, /^vapid t=.+, k=/);
  assert.ok(m.body.length > 50, 'isi terenkripsi');
  assert.ok(!m.body.toString().includes('Lembur tercatat'), 'isi tidak boleh terkirim polos');
  assert.ok(prisma._db.langgananPush.find((l) => l.id === 1).terakhirDipakai instanceof Date);
});

test('perangkat yang sudah berhenti langganan (410) dihapus', async () => {
  jawab = 410;
  const n = await kirimKeKaryawan(8, { judul: 'x', isi: 'y' });
  assert.equal(n, 0);
  assert.equal(prisma._db.langgananPush.some((l) => l.karyawanId === 8), false);
  assert.equal(prisma._db.langgananPush.filter((l) => l.karyawanId === 7).length, 2);
});
