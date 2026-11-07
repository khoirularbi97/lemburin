// Uji pembaca SPL lewat Groq memakai server Groq tiruan lokal.
import { after, before, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import bcrypt from 'bcryptjs';
import { buatFakePrisma } from './fakePrisma.js';

const permintaan = [];
let mode = 'ok'; // ok | tolakNalar | kunciSalah | harian | model | kosong
const groq = http.createServer((req, res) => {
  const potong = [];
  req.on('data', (c) => potong.push(c));
  req.on('end', () => {
    const body = JSON.parse(Buffer.concat(potong).toString() || '{}');
    permintaan.push({ url: req.url, auth: req.headers.authorization, body });
    const kirim = (status, isi) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(isi)); };
    if (mode === 'kunciSalah') return kirim(401, { error: { message: 'Invalid API Key', type: 'invalid_request_error', code: 'invalid_api_key' } });
    if (mode === 'harian') return kirim(429, { error: { message: 'Rate limit reached for model on requests per day (RPD): Limit 1000, Used 1000', code: 'rate_limit_exceeded' } });
    if (mode === 'model') return kirim(404, { error: { message: 'The model `x` does not exist or you do not have access to it.', code: 'model_not_found' } });
    if (mode === 'tolakNalar' && body.reasoning_format) return kirim(400, { error: { message: 'reasoning_format is not supported with this model', code: 'invalid_request_error' } });
    if (mode === 'kosong') return kirim(200, { choices: [{ message: { content: 'maaf tidak bisa' }, finish_reason: 'stop' }] });
    const isi = {
      hari: 'Minggu', tanggal: '15.02.2026',
      baris: [
        { no: 1, nama: 'Aryono', bagian: 'QC', mulai: '07.30', selesai: '18.30.', alasan: 'cek di line 2.' },
        { no: 2, nama: 'A. Dani', bagian: '"', mulai: '"', selesai: 20, alasan: '"' },
      ],
    };
    return kirim(200, {
      choices: [{ message: { role: 'assistant', content: `<think>baca tabel</think>\n\`\`\`json\n${JSON.stringify(isi)}\n\`\`\`` }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1300, completion_tokens: 500 },
    });
  });
}).listen(0);
await new Promise((r) => groq.once('listening', r));

process.env.JWT_SECRET = 'rahasia-uji';
process.env.GROQ_ENDPOINT = `http://127.0.0.1:${groq.address().port}`;
process.env.GROQ_API_KEY = 'gsk_uji';
process.env.GROQ_BATAS_HARIAN = '6';
// Gemini juga diatur: Groq harus didahulukan
process.env.GEMINI_API_KEY = 'tidak-dipakai';
process.env.GEMINI_ENDPOINT = 'http://127.0.0.1:9';

const prisma = buatFakePrisma();
mock.module('@prisma/client', { namedExports: { Prisma: { PrismaClientKnownRequestError: class extends Error {} }, PrismaClient: class {} } });
mock.module('../src/lib/prisma.js', { namedExports: { prisma } });

let server; let base; let token;
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => null) };
}
const baca = () => api('/api/lembur-massal/baca-spl', { method: 'POST', body: { gambar: JPG, jumlahBaris: 3 } });

before(async () => {
  prisma._db.user.push({ id: 1, username: 'admin', passwordHash: await bcrypt.hash('rahasia1', 4), nama: 'A', role: 'ADMIN', area: 'Semua', aktif: true });
  const { buatApp } = await import('../src/app.js');
  server = buatApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  token = (await api('/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'rahasia1' } })).data.token;
});
after(() => { server?.close(); groq.close(); });

test('Groq didahulukan dari Gemini dan melaporkan batas harian', async () => {
  const r = await api('/api/lembur-massal/batas');
  assert.equal(r.data.pembaca.jenis, 'GROQ');
  assert.equal(r.data.pembaca.model, 'qwen/qwen3.8-27b');
  assert.equal(r.data.pembaca.sisa, 6);
});

test('gambar dikirim sebagai pesan vision, jawaban <think>/```json dibersihkan', async () => {
  const r = await baca();
  assert.equal(r.status, 200);
  assert.equal(r.data.jenis, 'GROQ');
  assert.equal(r.data.tanggal, '15.02.2026');
  assert.deepEqual(r.data.baris.map((b) => b.nama), ['Aryono', 'A. Dani', '']);
  assert.equal(r.data.baris[1].selesai, '20'); // angka diubah jadi teks
  assert.deepEqual(r.data.token, { masuk: 1300, keluar: 500 });
  const p = permintaan.at(-1);
  assert.equal(p.url, '/openai/v1/chat/completions');
  assert.equal(p.auth, 'Bearer gsk_uji');
  assert.equal(p.body.model, 'qwen/qwen3.8-27b');
  assert.equal(p.body.response_format.type, 'json_object');
  assert.equal(p.body.reasoning_format, 'hidden');
  const isi = p.body.messages[1].content;
  assert.match(isi[0].text, /berisi 3 baris/);
  assert.match(isi[1].image_url.url, /^data:image\/jpeg;base64,\/9j\//);
});

test('model yang menolak reasoning_format diulang tanpa itu', async () => {
  mode = 'tolakNalar'; await tidur(3100);
  const n = permintaan.length;
  const r = await baca();
  assert.equal(r.status, 200);
  assert.equal(permintaan.length - n, 2);
  assert.equal(permintaan.at(-1).body.reasoning_format, undefined);
});

test('kunci salah, model tidak ada, jatah harian habis, jawaban bukan JSON', async () => {
  mode = 'kunciSalah'; await tidur(3100);
  let r = await baca(); assert.equal(r.status, 502); assert.equal(r.data.kode, 'GROQ_KUNCI');
  mode = 'model'; await tidur(3100);
  r = await baca(); assert.equal(r.status, 502); assert.equal(r.data.kode, 'GROQ_MODEL');
  mode = 'harian'; await tidur(3100);
  const n = permintaan.length;
  r = await baca(); assert.equal(r.status, 429); assert.equal(r.data.kode, 'KUOTA_HABIS');
  assert.equal(permintaan.length - n, 1); // jatah harian tidak dicoba ulang
  mode = 'kosong'; await tidur(3100);
  r = await baca(); assert.equal(r.status, 502); assert.equal(r.data.kode, 'GROQ_GAGAL');
});

test('batas harian lemburin tercapai: tidak lagi memanggil Groq', async () => {
  mode = 'ok'; await tidur(3100);
  const n = permintaan.length;
  const r = await baca();
  assert.equal(r.status, 429);
  assert.equal(r.data.kode, 'KUOTA_HABIS');
  assert.equal(permintaan.length, n);
});
