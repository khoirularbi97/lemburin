import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bacaJam, petakanSpl, skorNama, tandaSama } from '../src/lib/petaSpl.js';

// Grid hasil deteksi pada contoh SPL asli (skala lebar 1000 px)
const baris = Array.from({ length: 36 }, (_, i) => Math.round(353 + i * ((1200 - 353) / 35)));
const KOL = { no: [32, 101], nama: [101, 364], bagian: [364, 489], mulai: [489, 593], selesai: [593, 695], alasan: [695, 867], ttd: [867, 964] };
const tabel = { baris, kolomPada: () => KOL };

// Bacaan tulisan tangan yang "masuk akal" untuk SPL contoh (sebagian salah ejaan, seperti hasil OCR)
const SPL = [
  ['Aryono', 'QC', '07.30', '18.30.', 'cek di line 2.'],
  ['Alfian Yusuf S', '', '', '/', ''],
  ['Doni martin', '', '', '', '/'],
  ['Dodi Setiawon', '', '', '', ''],
  ['Fajar widiyanto', '', '', '/', ''],
  ['Wirdianto Egi S', '', '', '', 'v'],
  ['Risal Mohamad A', '', '', '', ''],
  ['Jainal Bukhori', '', '', '', '/'],
  ['Salwana Qamarul A', '', '', '', ''],
  ['Pujio Siswoyo', '', '', '', 'Cek BIS Fiting'],
  ['Abdul Rahman', '', '', '', 'Cek BEJ'],
  ['A. Dani', '', 'v', '', '-'],
  ['Wahid', '', '', '', '~"'],
  ['Encep Sahrul S', '', '', '', 'BIS sortir'],
  ['Slamet Setiyadi', '', '', '', 'BIS Fiting'],
  ['Fiftian Yugo', '', '', '', '-'],
  ['Raji Handoyo', '', '', '', '-"'],
  ['Nazriel Irvansyal', '', '', '', 'O40 . Repair'],
  ['Tio Ferdianto', '/', '', '', '- " -'],
  ['Abdul Rostid', '', '', '', 'Control QC'],
  ['Bp. Hero Maryanto', '', '', '', ''],
  ['Bp. Bambang Tejo Kusumo', '', '', '', '"'],
];
const kata = [];
SPL.forEach((r, i) => {
  const y0 = baris[i] + 4; const y1 = baris[i + 1] - 4;
  ['nama', 'bagian', 'mulai', 'selesai', 'alasan'].forEach((k, j) => {
    if (!r[j]) return;
    let x = KOL[k][0] + 6;
    for (const w of r[j].split(' ')) {
      const lebar = w.length * 9;
      kata.push({ teks: w, kotak: [{ x, y: y0 }, { x: x + lebar, y: y0 }, { x: x + lebar, y: y1 }, { x, y: y1 }] });
      x += lebar + 6;
    }
  });
});

const BENAR = ['Aryono', 'Alfian Yusuf Saputra', 'Doni Martin', 'Dodi Setiawan', 'Fajar Widiyanto', 'Wirdianto Egi Saputra', 'Risal Mohamad Akbar', 'Jainal Bukhori', 'Salwana Qamarul Anwar', 'Pujio Siswoyo', 'Abdul Rahman', 'Ahmad Dani', 'Wahid', 'Encep Sahrul Saepudin', 'Slamet Setiyadi', 'Fiftian Yugo', 'Raji Handoyo', 'Nazriel Irvansyah', 'Tio Ferdianto', 'Abdul Rosyid', 'Hero Maryanto', 'Bambang Tejo Kusumo'];
const PENGECOH = ['Budi Santoso', 'Dewi Lestari', 'Rudi Hartono', 'Siti Rahmawati', 'Ahmad Fauzi', 'Yuni Kartika', 'Khoirul Arbi', 'Agus Salim', 'Andi Pratama', 'Dian Puspita', 'Eko Prasetyo', 'Hendra Gunawan', 'Abdul Rosid Hidayat', 'Doni Saputra', 'Dodi Kurniawan', 'Ahmad Daniel', 'Wahidin', 'Fajar Nugraha', 'Tio Pratama', 'Slamet Riyadi', 'Raji Hardiansyah', 'Hero Prasetyo', 'Bambang Susilo', 'Aryo Wibowo', 'Arif Rahman', 'Abdul Rahim', 'Rizal Fahmi', 'Jaenal Abidin', 'Yusuf Maulana', 'Egi Saputra'];
const KARYAWAN = [...BENAR, ...PENGECOH].map((nama, i) => ({ id: i + 1, nama }));

test('jam & tanda sama-dengan-atas', () => {
  assert.equal(bacaJam('18.30.'), '18:30');
  assert.equal(bacaJam('07,30'), '07:30');
  assert.equal(bacaJam('1830'), '18:30');
  assert.equal(bacaJam('/'), null);
  for (const t of ['', '/', '"', '-"', '- " -', 'v', '~"']) assert.equal(tandaSama(t), true, t);
  assert.equal(tandaSama('Cek BEJ'), false);
});

test('skor nama paham singkatan, inisial, dan sapaan', () => {
  assert.ok(skorNama('Alfian Yusuf S', 'Alfian Yusuf Saputra') > 0.85);
  assert.ok(skorNama('Bp. Hero Maryanto', 'Hero Maryanto') > 0.95);
  assert.ok(skorNama('A. Dani', 'Ahmad Dani') > 0.8);
  assert.ok(skorNama('A. Dani', 'Ahmad Dani') > skorNama('A. Dani', 'Ahmad Daniel'));
  assert.ok(skorNama('Dodi Setiawon', 'Dodi Setiawan') > skorNama('Dodi Setiawon', 'Dodi Kurniawan') + 0.2);
});

test('SPL contoh: baris, jam ikut atas, alasan, dan pencocokan', () => {
  const r = petakanSpl({ kata, tabel, teksStrip: 'Hari : Minggu\nTanggal : 15.02.2026' }, KARYAWAN);
  assert.equal(r.baris.length, 22);
  assert.equal(r.tanggal, '2026-02-15');
  assert.equal(r.jamUmum, '18:30');
  assert.ok(r.baris.every((b) => b.selesai === '18:30' && b.mulai === '07:30' && b.bagian === 'QC'));
  assert.equal(r.baris[1].alasan, 'cek di line 2.');
  assert.equal(r.baris[10].alasan, 'Cek BEJ');
  assert.equal(r.baris[11].alasan, 'Cek BEJ'); // "-" = sama dengan atas
  const benarTop1 = r.baris.filter((b, i) => b.saran[0].id === i + 1).length;
  const yakinBenar = r.baris.filter((b, i) => b.pilihan === i + 1).length;
  const yakinSalah = r.baris.filter((b, i) => b.pilihan && b.pilihan !== i + 1).length;
  console.log(`saran #1 benar ${benarTop1}/22, otomatis dicentang benar ${yakinBenar}, salah ${yakinSalah}`);
  r.baris.forEach((b, i) => { if (b.saran[0].id !== i + 1 || !b.pilihan) console.log('  ', b.namaTerbaca, '→', b.saran.map((s) => `${s.nama} ${s.skor.toFixed(2)}`).join(' | '), b.pilihan ? '' : '(ragu)'); });
  assert.ok(benarTop1 >= 20);
  assert.equal(yakinSalah, 0, 'tidak boleh ada centang otomatis yang salah');
  assert.ok(r.baris.every((b, i) => b.saran.some((s) => s.id === i + 1)), 'nama benar selalu ada di 3 saran');
});
