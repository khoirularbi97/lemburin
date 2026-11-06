// Hitungan jam aktual sesuai PP 35/2021 Pasal 31.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bagiTarif, hitungLemburAktual, jenisHari } from '../src/lib/lembur.js';

const UPAH = 5_190_000; // upah sejam = 30.000
const hitung = (tanggal, mulai, selesai, aturan = {}, libur = new Map()) => hitungLemburAktual({
  upahBulanan: UPAH, tanggal, mulai, selesai, libur,
  aturan: { istirahat: [], pembulatanMenit: 1, jamPulang: '16:00', ...aturan },
});
// 2026-11-04 Rabu, 2026-11-07 Sabtu, 2026-11-08 Minggu

test('hari kerja: jam pertama 1,5x, berikutnya 2x', () => {
  const r = hitung('2026-11-04', '16:00', '19:00');
  assert.equal(r.jenisHari, 'KERJA');
  assert.equal(r.jamLembur, 3);
  assert.equal(r.jamHitung, 5.5); // sama dengan aturan tetap lama
  assert.deepEqual(r.rincian, [{ jam: 1, kali: 1.5 }, { jam: 2, kali: 2 }]);
  assert.equal(r.upahSejam, 30000);
  assert.equal(r.nominal, 165000);
  assert.deepEqual(r.peringatan, []);
});

test('hari kerja: kurang dari 1 jam, dan lembur baru dihitung sejak jam pulang', () => {
  assert.equal(hitung('2026-11-04', '16:00', '16:30').jamHitung, 0.75);
  const r = hitung('2026-11-04', '07:30', '18:00');
  assert.equal(r.mulaiDihitung, '16:00');
  assert.equal(r.jamLembur, 2);
  assert.equal(r.jamHitung, 3.5);
  assert.match(r.peringatan[0], /jam pulang 16:00/);
  // Tap out sebelum jam pulang: tidak ada lembur
  assert.equal(hitung('2026-11-04', '08:00', '15:00').jamHitung, 0);
});

test('hari kerja lebih dari 4 jam diberi peringatan Pasal 26', () => {
  const r = hitung('2026-11-04', '16:00', '21:00');
  assert.equal(r.jamHitung, 1.5 + 4 * 2);
  assert.ok(r.peringatan.some((p) => /4 jam/.test(p)));
});

test('pola 5 hari kerja, hari libur: 8 jam 2x, jam 9 3x, jam 10–12 4x', () => {
  assert.equal(hitung('2026-11-07', '07:00', '14:00').jamHitung, 14); // 7 jam = 14 (sama aturan lama)
  assert.equal(hitung('2026-11-07', '07:00', '17:00').jamHitung, 23); // 10 jam = 8x2 + 3 + 4 (contoh resmi)
  assert.equal(hitung('2026-11-08', '07:00', '19:00').jamHitung, 16 + 3 + 12); // 12 jam
});

test('pola 6 hari kerja, hari libur: 7 jam 2x, jam 8 3x, jam 9–11 4x', () => {
  const p6 = { polaKerja: 6 };
  assert.equal(hitung('2026-11-08', '07:00', '15:00', p6).jamHitung, 17); // 8 jam (contoh resmi)
  assert.equal(hitung('2026-11-08', '07:00', '18:00', p6).jamHitung, 14 + 3 + 12); // 11 jam
  // Sabtu di pola 6 adalah hari kerja (terpendek) → dihitung sejak jam pulang Sabtu
  const sabtu = hitung('2026-11-07', '13:00', '16:30', { ...p6, jamPulangTerpendek: '13:30' });
  assert.equal(sabtu.jenisHari, 'KERJA');
  assert.equal(sabtu.jamLembur, 3);
  assert.equal(sabtu.jamHitung, 5.5);
});

test('pola 6: libur resmi jatuh di hari kerja terpendek → 5 jam 2x, jam 6 3x, jam 7–9 4x', () => {
  const libur = new Map([['2026-11-07', 'Libur nasional']]);
  const r = hitung('2026-11-07', '07:00', '15:00', { polaKerja: 6 }, libur);
  assert.equal(r.jenisHari, 'LIBUR');
  assert.equal(r.jamHitung, 10 + 3 + 8); // 8 jam
  // Libur resmi di hari kerja biasa (Rabu) memakai tabel 7/8/9–11
  const rabu = hitung('2026-11-04', '07:00', '15:00', { polaKerja: 6 }, new Map([['2026-11-04', 'Libur']]));
  assert.equal(rabu.jamHitung, 17);
});

test('jam istirahat dipotong, termasuk lembur lewat tengah malam', () => {
  const r = hitung('2026-11-07', '07:00', '16:00', { istirahat: [{ mulai: '12:00', selesai: '13:00' }] });
  assert.equal(r.menitIstirahat, 60);
  assert.equal(r.jamLembur, 8);
  assert.equal(r.jamHitung, 16);
  const malam = hitung('2026-11-04', '22:00', '02:00', { jamPulang: '16:00', istirahat: [{ mulai: '00:00', selesai: '00:30' }] });
  assert.equal(malam.lewatTengahMalam, true);
  assert.equal(malam.menitKotor, 240);
  assert.equal(malam.menitLembur, 210);
});

test('pembulatan ke bawah per 30 menit', () => {
  const r = hitung('2026-11-04', '16:00', '18:50', { pembulatanMenit: 30 });
  assert.equal(r.menitLembur, 150);
  assert.equal(r.jamHitung, 1.5 + 1.5 * 2);
});

test('pola kerja menentukan hari libur mingguan', () => {
  assert.equal(jenisHari('2026-11-07').jenis, 'LIBUR');
  assert.equal(jenisHari('2026-11-07', new Map(), { polaKerja: 6 }).jenis, 'KERJA');
  assert.equal(jenisHari('2026-11-08', new Map(), { polaKerja: 6 }).jenis, 'LIBUR');
});

test('bagiTarif: jam di atas batas tetap 4x', () => {
  assert.deepEqual(bagiTarif(13, [[8, 2], [1, 3], [3, 4]]).rincian.at(-1), { jam: 4, kali: 4 });
});
