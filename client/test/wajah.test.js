// Mesin langkah pemeriksaan wajah hidup (tanpa kamera).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buatPemeriksa, rasioToleh } from '../src/lib/wajah.js';

const V = Array.from({ length: 128 }, (_, i) => Math.cos(i) * 0.1);
const lain = V.map((x) => -x);
const lurus = (v = V) => ({ rasio: 0.5, besar: 0.3, vektor: v });

test('rasio toleh dari titik rahang & hidung', () => {
  const p = Array.from({ length: 68 }, () => ({ x: 0, y: 0 }));
  p[0].x = 100; p[16].x = 200; p[30].x = 150;
  assert.equal(rasioToleh(p), 0.5);
  p[30].x = 120;
  assert.ok(rasioToleh(p) < 0.36);
});

test('alur lengkap: lurus → toleh kiri & kanan → lurus lagi = selesai', () => {
  const p = buatPemeriksa({ jumlahLurus: 3 });
  let t = 0;
  for (let i = 0; i < 3; i += 1) p.terima(lurus(), (t += 200));
  assert.equal(p.st.langkah, 'toleh');
  p.terima({ rasio: 0.3, besar: 0.15 }, (t += 200)); // wajah menoleh tampak kecil: tetap dihitung
  assert.equal(p.st.kiri, true);
  p.terima(null, (t += 200)); p.terima(null, (t += 200)); // sempat tak terdeteksi sebentar
  p.terima({ rasio: 0.7, besar: 0.15 }, (t += 200));
  assert.equal(p.st.langkah, 'akhir');
  p.terima(lurus(), (t += 200));
  assert.equal(p.st.langkah, 'selesai');
  assert.equal(p.st.vektor.length, 4);
});

test('foto diam (tidak pernah menoleh) tidak lolos', () => {
  const p = buatPemeriksa();
  let t = 0;
  for (let i = 0; i < 200; i += 1) p.terima(lurus(), (t += 200));
  assert.notEqual(p.st.langkah, 'selesai');
});

test('orang berganti setelah menoleh → ulang dari awal', () => {
  const p = buatPemeriksa({ jumlahLurus: 3 });
  let t = 0;
  for (let i = 0; i < 3; i += 1) p.terima(lurus(), (t += 200));
  p.terima({ rasio: 0.3, besar: 0.3 }, (t += 200));
  p.terima({ rasio: 0.7, besar: 0.3 }, (t += 200));
  p.terima(lurus(lain), (t += 200));
  assert.equal(p.st.langkah, 'cari');
  assert.equal(p.st.ulang, true);
});

test('wajah terlalu jauh diminta mendekat; hilang lama → ulang', () => {
  const p = buatPemeriksa();
  p.terima({ rasio: 0.5, besar: 0.1, vektor: V }, 100);
  assert.equal(p.st.dekat, true);
  assert.equal(p.st.vektor.length, 0);
  p.terima(lurus(), 300);
  for (let t = 400; t < 4000; t += 400) p.terima(null, t);
  assert.equal(p.st.langkah, 'cari');
});
