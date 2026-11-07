// Model Groq dipensiunkan / GROQ_MODEL salah → server mencari model vision pengganti sendiri.
// Juga: foto utuh tanpa jumlahBaris (tabel tidak terpotong otomatis di HP) tetap dibaca.
import { after, before, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import bcrypt from 'bcryptjs';
import { buatFakePrisma } from './fakePrisma.js';

const dipakai = [];
let perintahTerakhir = '';
const groq = http.createServer((req, res) => {
  const potong = [];
  req.on('data', (c) => potong.push(c));
  req.on('end', () => {
    const kirim = (status, isi) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(isi)); };
    if (req.method === 'GET' && req.url === '/openai/v1/models') {
      return kirim(200, { data: [{ id: 'openai/gpt-oss-120b', active: true }, { id: 'qwen/qwen3.9-27b', active: true }, { id: 'qwen/qwen3.6-27b', active: false }] });
    }
    const body = JSON.parse(Buffer.concat(potong).toString() || '{}');
    dipakai.push(body.model);
    perintahTerakhir = body.messages?.[1]?.content?.[0]?.text || '';
    if (body.model !== 'qwen/qwen3.9-27b') return kirim(404, { error: { message: `The model \`${body.model}\` has been decommissioned and is no longer supported.`, code: 'model_decommissioned' } });
    return kirim(200, { choices: [{ message: { content: JSON.stringify({ hari: 'Minggu', tanggal: '15.02.2026', baris: [
      { no: 1, nama: 'Pujo Setiawan', bagian: 'QC', mulai: '07.30', selesai: '18.30', alasan: 'Sortir' },
      { no: 2, nama: 'Arbi', bagian: '"', mulai: '"', selesai: '"', alasan: '"' },
      { no: 3, nama: 'Malik Abdullah', bagian: '"', mulai: '"', selesai: '"', alasan: '"' },
    ] }) }, finish_reason: 'stop' }] });
  });
}).listen(0);
await new Promise((r) => groq.once('listening', r));

process.env.JWT_SECRET = 'rahasia-uji';
process.env.GROQ_ENDPOINT = `http://127.0.0.1:${groq.address().port}`;
process.env.GROQ_API_KEY = 'gsk_uji';
process.env.GROQ_MODEL = 'qwen/qwen3.6-27b'; // sudah dipensiunkan Groq
const prisma = buatFakePrisma();
mock.module('@prisma/client', { namedExports: { Prisma: { PrismaClientKnownRequestError: class extends Error {} }, PrismaClient: class {} } });
mock.module('../src/lib/prisma.js', { namedExports: { prisma } });

let server; let base; let token;
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
const baca = (body) => fetch(`${base}/api/lembur-massal/baca-spl`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
before(async () => {
  prisma._db.user.push({ id: 1, username: 'admin', passwordHash: await bcrypt.hash('rahasia1', 4), nama: 'A', role: 'ADMIN', area: 'Semua', aktif: true });
  const { buatApp } = await import('../src/app.js');
  server = buatApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  token = (await (await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'rahasia1' }) })).json()).token;
});
after(() => { server?.close(); groq.close(); });

test('model dipensiunkan → coba model bawaan → cari Qwen 27B terbaru dari daftar model Groq', async () => {
  const res = await baca({ gambar: JPG, jumlahBaris: 3 });
  const d = await res.json();
  assert.equal(res.status, 200, JSON.stringify(d));
  assert.deepEqual(dipakai, ['qwen/qwen3.6-27b', 'qwen/qwen3.8-27b', 'qwen/qwen3.9-27b']);
  assert.equal(d.model, 'qwen/qwen3.9-27b');
  const b = await (await fetch(`${base}/api/lembur-massal/batas`, { headers: { Authorization: `Bearer ${token}` } })).json();
  assert.equal(b.pembaca.model, 'qwen/qwen3.9-27b');
});

test('foto utuh tanpa jumlahBaris: perintah membaca seluruh tabel, jumlah baris mengikuti hasil', async () => {
  await new Promise((r) => setTimeout(r, 3100)); // jeda antar-baca per pengguna
  const res = await baca({ gambar: JPG });
  const d = await res.json();
  assert.equal(res.status, 200, JSON.stringify(d));
  assert.match(perintahTerakhir, /foto layar komputer/);
  assert.equal(d.baris.length, 3);
  assert.equal(d.baris[0].nama, 'Pujo Setiawan');
  assert.equal(dipakai.at(-1), 'qwen/qwen3.9-27b'); // model pengganti diingat
});
