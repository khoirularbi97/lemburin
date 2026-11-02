import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bacaSpl, cariJamSelesai, cariNomor, cariTanggal } from '../src/lib/bacaSpl.js';

const KARYAWAN = [
  { id: 1, nik: 'SNL-0063', nama: 'Dewi Lestari' },
  { id: 2, nik: 'SNL-0142', nama: 'Budi Santoso' },
  { id: 3, nik: 'SNL-0156', nama: 'Rudi Hartono' },
  { id: 4, nik: 'SNL-0087', nama: 'Siti Rahmawati' },
  { id: 5, nik: 'SNL-0118', nama: 'Ahmad Fauzi' },
  { id: 6, nik: 'SNL-0171', nama: 'Yuni Kartika' },
];

// Teks asli hasil tesseract.js dari contoh foto SPL (lihat README)
const OCR = `SURAT PERINTAH LEMBUR
No: SPL/045/QC/X1/2026
Hari / Tanggal : Selasa, 03-11-2026
Jam lembur: 16.00 s/d 19.00
Departemen : QC
Pekerjaan : Sortir part bumper reject
No NIK Nama Jabatan Paraf
1 SNL-0063 Dewi Lestari Inspector
2 SNL-0142 Budi Santoso Operator
3 SNL-0156 Rudi Hartono Operator
4 Siti Rahmawati Operator
Cikarang, 03 November 2026
Supervisor QC`;

test('membaca kepala SPL', () => {
  const r = bacaSpl(OCR, KARYAWAN);
  assert.equal(r.nomor, 'SPL/045/QC/XI/2026');
  assert.equal(r.tanggal, '2026-11-03');
  assert.equal(r.jam, '19:00');
  assert.equal(r.keterangan, 'Sortir part bumper reject');
});

test('mencentang karyawan yang tercantum, tidak yang lain', () => {
  const r = bacaSpl(OCR, KARYAWAN);
  assert.deepEqual(r.cocok.map((c) => c.id).sort(), [1, 2, 3, 4]);
  assert.equal(r.cocok.find((c) => c.id === 2).alasan, 'NIK & nama cocok');
  assert.match(r.cocok.find((c) => c.id === 4).alasan, /Nama mirip/);
});

test('toleran salah baca OCR', () => {
  const t = 'l SNL-OI42 Budl Sant0so Operator\n2 SNL 0063 Dewi Lestan';
  const ids = bacaSpl(t, KARYAWAN).cocok.map((c) => c.id).sort();
  assert.deepEqual(ids, [1, 2]);
});

test('variasi format tanggal & jam', () => {
  assert.equal(cariTanggal('Tanggal: 3 Nopember 2026'), '2026-11-03');
  assert.equal(cariTanggal('Tgl 21/10/26'), '2026-10-21');
  assert.equal(cariTanggal('tanggal 31-02-2026\n01.11.2026'), '2026-11-01');
  assert.equal(cariJamSelesai('Pukul 16:30 - 20:00 WIB'), '20:00');
  assert.equal(cariJamSelesai('tidak ada jam'), null);
  assert.equal(cariNomor('Nomor SPL : 12/HRD/2026'), '12/HRD/2026');
});

test('nama yang tidak ada tidak ikut tercentang', () => {
  const r = bacaSpl('1 Joko Widodo Operator\n2 Ahmad Fauzan Staff', KARYAWAN);
  assert.ok(!r.cocok.some((c) => c.id === 2 || c.id === 6));
});
