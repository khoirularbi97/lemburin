// Dua shift bergilir per grup + jam ganti hari 07.00 (lembur shift 2 lewat tengah malam).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hitungLemburAktual, jadwalShift, tanggalKerja } from '../src/lib/lembur.js';

const SHIFT = { aktif: true, gantiHari: '07:00', shift1: { masuk: '07:00', pulang: '16:00' }, shift2: { masuk: '16:00', pulang: '00:00' }, shift2Lembur: { masuk: '19:30', pulang: '03:30' }, acuanSenin: '2026-11-09', grupShift1: 'A', grup: ['A', 'B'] };
const ATURAN = { polaKerja: 5, istirahat: [{ mulai: '12:00', selesai: '13:00' }], pembulatanMenit: 30, shift: SHIFT };
const hitung = (o) => hitungLemburAktual({ upahBulanan: 5_190_000, libur: new Map(), aturan: ATURAN, ...o });

test('rotasi mingguan per grup', () => {
  assert.equal(jadwalShift({ grup: 'A', tanggal: '2026-11-09', aturan: ATURAN }).kode, 'S1'); // Senin acuan
  assert.equal(jadwalShift({ grup: 'A', tanggal: '2026-11-15', aturan: ATURAN }).kode, 'S1'); // Minggu, minggu yang sama
  assert.equal(jadwalShift({ grup: 'B', tanggal: '2026-11-11', aturan: ATURAN }).kode, 'S2');
  assert.equal(jadwalShift({ grup: 'A', tanggal: '2026-11-16', aturan: ATURAN }).kode, 'S2'); // minggu berikutnya bergantian
  assert.equal(jadwalShift({ grup: 'B', tanggal: '2026-11-16', aturan: ATURAN }).kode, 'S1');
  assert.equal(jadwalShift({ grup: 'A', tanggal: '2026-11-04', aturan: ATURAN }).kode, 'S2'); // minggu sebelum acuan
  assert.equal(jadwalShift({ grup: 'B', tanggal: '2026-11-11', aturan: ATURAN, shift1Lembur: true }).masuk, '19:30');
  assert.equal(jadwalShift({ grup: null, tanggal: '2026-11-11', aturan: ATURAN }), null);
  assert.equal(jadwalShift({ grup: 'A', tanggal: '2026-11-11', aturan: { shift: { ...SHIFT, aktif: false } } }), null);
});

test('tanggal kerja: sebelum 07.00 ikut hari sebelumnya', () => {
  assert.equal(tanggalKerja('2026-11-14', '01:30', ATURAN), '2026-11-13');
  assert.equal(tanggalKerja('2026-11-14', '06:59', ATURAN), '2026-11-13');
  assert.equal(tanggalKerja('2026-11-14', '07:00', ATURAN), '2026-11-14');
  assert.equal(tanggalKerja('2026-11-14', '01:30', { shift: { ...SHIFT, aktif: false } }), '2026-11-14');
});

test('shift 1 lembur setelah 16.00', () => {
  const s1 = jadwalShift({ grup: 'A', tanggal: '2026-11-11', aturan: ATURAN });
  const h = hitung({ tanggal: '2026-11-11', mulai: '16:00', selesai: '19:30', jamKerja: s1 });
  assert.equal(h.jamLembur, 3.5);
  assert.equal(h.jamHitung, 6.5); // 1×1,5 + 2,5×2
  assert.equal(h.mulaiDihitung, '16:00');
  // tap in lebih awal: jam kerja shift tidak dihitung
  assert.equal(hitung({ tanggal: '2026-11-11', mulai: '14:00', selesai: '18:00', jamKerja: s1 }).jamLembur, 2);
});

test('shift 2 normal (16.00–24.00): lembur setelah tengah malam ikut hari kerja yang sama', () => {
  const s2 = jadwalShift({ grup: 'B', tanggal: '2026-11-13', aturan: ATURAN }); // Jumat
  const h = hitung({ tanggal: '2026-11-13', mulai: '00:00', selesai: '03:00', jamKerja: s2 });
  assert.equal(h.jenisHari, 'KERJA'); // tetap hari kerja Jumat walau sudah Sabtu dini hari
  assert.equal(h.jamLembur, 3);
  assert.equal(h.jamHitung, 5.5);
  assert.equal(h.lewatTengahMalam, true);
  // tap in masih di jam shift → hanya setelah 00.00 yang dihitung
  const h2 = hitung({ tanggal: '2026-11-13', mulai: '22:00', selesai: '02:00', jamKerja: s2 });
  assert.equal(h2.jamLembur, 2);
  assert.match(h2.peringatan[0], /16:00–00:00/);
});

test('shift 2 saat shift 1 lembur (19.30–03.30)', () => {
  const s2l = jadwalShift({ grup: 'B', tanggal: '2026-11-11', aturan: ATURAN, shift1Lembur: true });
  assert.equal(hitung({ tanggal: '2026-11-11', mulai: '03:30', selesai: '06:30', jamKerja: s2l }).jamLembur, 3);
  assert.equal(hitung({ tanggal: '2026-11-11', mulai: '00:00', selesai: '05:00', jamKerja: s2l }).jamLembur, 1.5);
  // lembur sebelum masuk (datang lebih awal)
  assert.equal(hitung({ tanggal: '2026-11-11', mulai: '17:30', selesai: '19:30', jamKerja: s2l }).jamLembur, 2);
});

test('hari libur: semua jam dihitung (istirahat dipotong), shift tidak berpengaruh', () => {
  const s2 = jadwalShift({ grup: 'B', tanggal: '2026-11-15', aturan: ATURAN });
  const h = hitung({ tanggal: '2026-11-15', mulai: '08:00', selesai: '17:00', jamKerja: s2 });
  assert.equal(h.jenisHari, 'LIBUR');
  assert.equal(h.jamLembur, 8);
  assert.equal(h.jamHitung, 16);
});
