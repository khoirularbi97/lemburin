import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hitungLembur, jenisHari, rentangBulan, upahSejam, waktuJakarta,
} from '../src/lib/lembur.js';

const libur = new Map([['2026-12-25', 'Hari Raya Natal']]);

test('upah sejam = 1/173 x upah sebulan, dibulatkan', () => {
  assert.equal(upahSejam(5_000_000), 28_902);
  assert.equal(upahSejam(5_400_000), 31_214);
});

test('hari kerja: 5,5 jam hitung', () => {
  const h = hitungLembur({ upahBulanan: 5_000_000, tanggal: '2026-10-29', libur }); // Kamis
  assert.equal(h.jenisHari, 'KERJA');
  assert.equal(h.jamHitung, 5.5);
  assert.equal(h.nominal, 158_961);
});

test('Sabtu dan Minggu: 14 jam hitung', () => {
  assert.equal(jenisHari('2026-10-31').label, 'Sabtu');
  assert.equal(jenisHari('2026-11-01').label, 'Minggu');
  const h = hitungLembur({ upahBulanan: 5_000_000, tanggal: '2026-10-31', libur });
  assert.equal(h.jamHitung, 14);
  assert.equal(h.nominal, 404_628);
});

test('tanggal merah di hari kerja: 14 jam hitung', () => {
  const h = hitungLembur({ upahBulanan: 5_000_000, tanggal: '2026-12-25', libur }); // Jumat
  assert.equal(h.jenisHari, 'LIBUR');
  assert.equal(h.keterangan, 'Hari Raya Natal');
  assert.equal(h.jamHitung, 14);
});

test('tanggal mengikuti WIB, bukan UTC', () => {
  // 23:30 UTC hari Jumat = 06:30 WIB hari Sabtu
  const { tanggal, jam } = waktuJakarta(new Date('2026-10-30T23:30:00Z'));
  assert.equal(tanggal, '2026-10-31');
  assert.equal(jam, '06:30');
});

test('rentang bulan Desember melompat ke Januari', () => {
  const { gte, lt } = rentangBulan('2026-12');
  assert.equal(gte.toISOString().slice(0, 10), '2026-12-01');
  assert.equal(lt.toISOString().slice(0, 10), '2027-01-01');
});
