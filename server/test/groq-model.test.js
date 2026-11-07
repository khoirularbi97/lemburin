// GROQ_MODEL di server berisi model yang tidak ada di Groq → otomatis beralih ke model bawaan.
import { after, before, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import bcrypt from 'bcryptjs';
import { buatFakePrisma } from './fakePrisma.js';

const dipakai = [];
const groq = http.createServer((req, res) => {
  const potong = [];
  req.on('data', (c) => potong.push(c));
  req.on('end', () => {
    const body = JSON.parse(Buffer.concat(potong).toString() || '{}');
    dipakai.push(body.model);
    res.writeHead(body.model === 'qwen/qwen3.6-27b' ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body.model === 'qwen/qwen3.6-27b'
      ? { choices: [{ message: { content: JSON.stringify({ hari: 'Minggu', tanggal: '15.02.2026', baris: [{ no: 1, nama: 'Aryono', mulai: '07.30', selesai: '18.30' }] }) }, finish_reason: 'stop' }] }
      : { error: { message: `The model \`${body.model}\` does not exist or you do not have access to it.`, code: 'model_not_found' } }));
  });
}).listen(0);
await new Promise((r) => groq.once('listening', r));

process.env.JWT_SECRET = 'rahasia-uji';
process.env.GROQ_ENDPOINT = `http://127.0.0.1:${groq.address().port}`;
process.env.GROQ_API_KEY = 'gsk_uji';
process.env.GROQ_MODEL = 'qwen/qwen3.8-27b'; // salah ketik di Render
const prisma = buatFakePrisma();
mock.module('@prisma/client', { namedExports: { Prisma: { PrismaClientKnownRequestError: class extends Error {} }, PrismaClient: class {} } });
mock.module('../src/lib/prisma.js', { namedExports: { prisma } });

let server; let base; let token;
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
before(async () => {
  prisma._db.user.push({ id: 1, username: 'admin', passwordHash: await bcrypt.hash('rahasia1', 4), nama: 'A', role: 'ADMIN', area: 'Semua', aktif: true });
  const { buatApp } = await import('../src/app.js');
  server = buatApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  token = (await (await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'rahasia1' }) })).json()).token;
});
after(() => { server?.close(); groq.close(); });

test('model salah di GROQ_MODEL → dicoba ulang dengan qwen/qwen3.6-27b dan berhasil', async () => {
  const res = await fetch(`${base}/api/lembur-massal/baca-spl`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ gambar: JPG, jumlahBaris: 1 }) });
  const d = await res.json();
  assert.equal(res.status, 200, JSON.stringify(d));
  assert.deepEqual(dipakai, ['qwen/qwen3.8-27b', 'qwen/qwen3.6-27b']);
  assert.equal(d.model, 'qwen/qwen3.6-27b');
  assert.equal(d.baris[0].nama, 'Aryono');
  const b = await (await fetch(`${base}/api/lembur-massal/batas`, { headers: { Authorization: `Bearer ${token}` } })).json();
  assert.equal(b.pembaca.model, 'qwen/qwen3.6-27b');
});
