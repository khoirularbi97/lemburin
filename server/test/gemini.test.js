// Uji pembaca SPL lewat Gemini memakai server Gemini tiruan lokal.
import { after, before, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import bcrypt from 'bcryptjs';
import { buatFakePrisma } from './fakePrisma.js';

const permintaan = [];
let mode = 'ok'; // ok | tolakThinking | kunciSalah | sibuk | rusak
const gemini = http.createServer((req, res) => {
  const potong = [];
  req.on('data', (c) => potong.push(c));
  req.on('end', () => {
    const body = JSON.parse(Buffer.concat(potong).toString() || '{}');
    permintaan.push({ url: req.url, kunci: req.headers['x-goog-api-key'], body });
    const kirim = (status, isi) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(isi)); };
    if (mode === 'kunciSalah') return kirim(400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } });
    if (mode === 'sibuk') return kirim(429, { error: { code: 429, message: 'Resource has been exhausted', status: 'RESOURCE_EXHAUSTED' } });
    if (mode === 'tolakThinking' && body.generationConfig?.thinkingConfig) {
      return kirim(400, { error: { code: 400, message: 'Thinking level is not supported for this model.', status: 'INVALID_ARGUMENT' } });
    }
    if (mode === 'rusak') return kirim(200, { candidates: [{ content: { parts: [{ text: 'maaf' }] }, finishReason: 'MAX_TOKENS' }] });
    const isi = {
      hari: 'Minggu', tanggal: '15.02.2026',
      baris: [
        { no: 1, nama: 'Aryono', bagian: 'QC', mulai: '07.30', selesai: '18.30.', alasan: 'cek di line 2.' },
        { no: 3, nama: 'Doni martin', bagian: '"', mulai: '"', selesai: '"', alasan: '"' },
        { no: 2, nama: 'Alfian Yusuf S', bagian: '"', mulai: '"', selesai: '/', alasan: '' },
        { no: 9, nama: 'di luar tabel', bagian: '', mulai: '', selesai: '', alasan: '' },
      ],
    };
    return kirim(200, {
      candidates: [{ content: { role: 'model', parts: [{ text: 'pikiran', thought: true }, { text: JSON.stringify(isi) }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 1400, candidatesTokenCount: 600, thoughtsTokenCount: 120 },
    });
  });
}).listen(0);
await new Promise((r) => gemini.once('listening', r));

process.env.JWT_SECRET = 'rahasia-uji';
process.env.GEMINI_ENDPOINT = `http://127.0.0.1:${gemini.address().port}`;
process.env.GEMINI_API_KEY = 'kunci-gemini-uji';
process.env.GEMINI_MODEL = 'gemini-uji-flash';
process.env.GEMINI_BATAS_HARIAN = '6';
// Azure juga diatur: Gemini harus tetap didahulukan
process.env.AZURE_VISION_ENDPOINT = 'http://127.0.0.1:9';
process.env.AZURE_VISION_KEY = 'tidak-dipakai';

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
const baca = () => api('/api/lembur-massal/baca-spl', { method: 'POST', body: { gambar: PNG, jumlahBaris: 4 } });

before(async () => {
  prisma._db.user.push({ id: 1, username: 'petugas.qc', passwordHash: await bcrypt.hash('rahasia1', 4), nama: 'P', role: 'PETUGAS', area: 'QC', aktif: true });
  const { buatApp } = await import('../src/app.js');
  server = buatApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  token = (await api('/api/auth/login', { method: 'POST', body: { username: 'petugas.qc', password: 'rahasia1' } })).data.token;
});
after(() => { server?.close(); gemini.close(); });

test('batas memberi tahu pembaca Gemini (didahulukan dari Azure) dan batas harian', async () => {
  const r = await api('/api/lembur-massal/batas');
  assert.equal(r.data.pembaca.jenis, 'GEMINI');
  assert.equal(r.data.pembaca.model, 'gemini-uji-flash');
  assert.equal(r.data.pembaca.periode, 'hari');
  assert.equal(r.data.pembaca.sisa, 6);
});

test('potongan SPL dikirim ke Gemini dengan skema JSON, hasil dirapikan per baris', async () => {
  const r = await baca();
  assert.equal(r.status, 200);
  assert.equal(r.data.jenis, 'GEMINI');
  assert.equal(r.data.tanggal, '15.02.2026');
  assert.equal(r.data.baris.length, 4);
  assert.deepEqual(r.data.baris.map((b) => b.nama), ['Aryono', 'Alfian Yusuf S', 'Doni martin', '']);
  assert.equal(r.data.baris[1].selesai, '/');
  assert.deepEqual(r.data.token, { masuk: 1400, keluar: 720 });
  assert.equal(r.data.pemakaian.jumlah, 1);
  const p = permintaan.at(-1);
  assert.equal(p.url, '/v1beta/models/gemini-uji-flash:generateContent');
  assert.equal(p.kunci, 'kunci-gemini-uji');
  const parts = p.body.contents[0].parts;
  assert.equal(parts[0].inline_data.mime_type, 'image/png');
  assert.ok(parts[0].inline_data.data.length > 10);
  assert.match(parts[1].text, /berisi 4 baris/);
  assert.equal(p.body.generationConfig.responseMimeType, 'application/json');
  assert.equal(p.body.generationConfig.responseSchema.properties.baris.type, 'ARRAY');
  assert.equal(p.body.generationConfig.temperature, 0);
});

test('tanpa jumlahBaris = foto utuh, dan model yang menolak pengaturan thinking diulang tanpa itu', async () => {
  await tidur(3100);
  const utuh = await api('/api/lembur-massal/baca-spl', { method: 'POST', body: { gambar: PNG } });
  assert.equal(utuh.status, 200);
  assert.match(permintaan.at(-1).body.contents[0].parts[1].text, /foto layar komputer/);
  mode = 'tolakThinking';
  await tidur(3100);
  const n = permintaan.length;
  const r = await baca();
  assert.equal(r.status, 200);
  assert.equal(permintaan.length - n, 2);
  assert.ok(!permintaan.at(-1).body.generationConfig.thinkingConfig);
});

test('kunci salah, sibuk, dan jawaban rusak memberi pesan yang jelas', async () => {
  mode = 'kunciSalah'; await tidur(3100);
  let r = await baca();
  assert.equal(r.status, 502); assert.equal(r.data.kode, 'GEMINI_KUNCI');
  mode = 'sibuk'; await tidur(3100);
  r = await baca();
  assert.equal(r.status, 429); assert.equal(r.data.kode, 'GEMINI_SIBUK');
  mode = 'rusak'; await tidur(3100);
  r = await baca();
  assert.equal(r.status, 502); assert.match(r.data.error || r.data.pesan || JSON.stringify(r.data), /MAX_TOKENS/);
});

test('batas harian tercapai: tidak lagi memanggil Gemini', async () => {
  mode = 'ok'; await tidur(3100);
  const n = permintaan.length;
  const r = await baca();
  assert.equal(r.status, 429);
  assert.equal(r.data.kode, 'KUOTA_HABIS');
  assert.equal(permintaan.length, n);
});
