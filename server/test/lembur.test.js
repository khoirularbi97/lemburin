import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  batasPeriode, cekTanggalManual, hitungLembur, labelRentang, periodeDari, rentangPeriode, jenisHari, rentangBulan, upahSejam, waktuJakarta,
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

test('periode lembur 21 s/d 20 bulan berikutnya', () => {
  assert.equal(periodeDari('2026-10-20'), '2026-10');
  assert.equal(periodeDari('2026-10-21'), '2026-11');
  assert.equal(periodeDari('2026-11-02'), '2026-11');
  assert.equal(periodeDari('2026-12-25'), '2027-01'); // lewat tahun
  assert.deepEqual(batasPeriode('2026-11'), { mulai: '2026-10-21', selesai: '2026-11-20' });
  assert.deepEqual(batasPeriode('2027-01'), { mulai: '2026-12-21', selesai: '2027-01-20' });
  const { gte, lt } = rentangPeriode('2026-03');
  assert.equal(gte.toISOString().slice(0, 10), '2026-02-21');
  assert.equal(lt.toISOString().slice(0, 10), '2026-03-21');
  assert.equal(labelRentang('2026-11'), '21 Okt – 20 Nov 2026');
  assert.equal(labelRentang('2027-01'), '21 Des 2026 – 20 Jan 2027');
});

test('tap manual: periode berjalan dan periode lalu saja, tidak boleh masa depan', () => {
  // 2 Nov 2026 → periode Nov (21 Okt–20 Nov), periode lalu Okt (21 Sep–20 Okt)
  const hariIni = '2026-11-02';
  assert.equal(cekTanggalManual('2026-10-20', hariIni).ok, true);
  assert.equal(cekTanggalManual('2026-09-21', hariIni).ok, true);
  assert.equal(cekTanggalManual('2026-09-20', hariIni).ok, false);
  assert.equal(cekTanggalManual('2026-11-03', hariIni).ok, false);
  assert.equal(cekTanggalManual('2026-13-01', hariIni).ok, false);
  // 25 Nov → sudah periode Des, periode lalu Nov (mulai 21 Okt)
  assert.equal(cekTanggalManual('2026-10-21', '2026-11-25').ok, true);
  assert.equal(cekTanggalManual('2026-10-20', '2026-11-25').ok, false);
});

test('tap manual di awal tahun boleh mundur ke periode Desember', () => {
  // 5 Jan 2027 → periode Jan (21 Des–20 Jan), periode lalu Des (21 Nov–20 Des)
  assert.equal(cekTanggalManual('2026-11-21', '2027-01-05').ok, true);
  assert.equal(cekTanggalManual('2026-11-20', '2027-01-05').ok, false);
});
