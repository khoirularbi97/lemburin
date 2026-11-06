// Slip lembur bulanan (PDF A4) untuk karyawan.
import PDFDocument from 'pdfkit';
import { ATURAN, labelRentang } from './lembur.js';

const NAVY = '#12152B';
const TEAL = '#0B6E5E';
const ABU = '#4F5670';
const GARIS = '#DADEEB';

const rp = (n) => `Rp${Math.round(n || 0).toLocaleString('id-ID')}`;
const jamFmt = (n) => Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: 1 });
const namaBulan = (ym) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const tglPanjang = (s) => new Date(`${s}T12:00:00Z`).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Ringkas daftar tap satu bulan. Murni, dipakai portal & slip. */
export function ringkasTap(taps) {
  const total = { tap: 0, tapKerja: 0, tapLibur: 0, jamHitung: 0, nominal: 0 };
  for (const t of taps) {
    total.tap += 1;
    if (t.jenisHari === 'KERJA') total.tapKerja += 1; else total.tapLibur += 1;
    total.jamHitung += t.jamHitung;
    total.nominal += t.nominal;
  }
  return total;
}

/**
 * @param {object} o
 * @param {{nama:string,nik:string,departemen:string,jabatan:string}} o.karyawan
 * @param {string} o.bulan  YYYY-MM
 * @param {Array<{tanggal:string,jam:string,jenisHari:string,jamHitung:number,upahSejam:number,nominal:number,manual:boolean}>} o.taps
 * @param {string} o.perusahaan
 * @param {string} o.dicetak  teks waktu cetak
 * @returns {PDFKit.PDFDocument} stream PDF (panggil .end() sudah dilakukan)
 */
export function buatSlip({ karyawan, bulan, taps, perusahaan, dicetak }) {
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `Slip lembur ${karyawan.nama} ${bulan}`, Author: 'lemburin' } });
  const L = doc.page.width - 96; // lebar isi
  const x0 = 48;
  const total = ringkasTap(taps);

  // Kepala
  doc.rect(0, 0, doc.page.width, 112).fill(NAVY);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(20).text('SLIP LEMBUR', x0, 34);
  doc.font('Helvetica').fontSize(10).fillColor('#C5CAE6').text(perusahaan, x0, 60);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(14).text(namaBulan(bulan), x0, 34, { width: L, align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor('#C5CAE6').text(`Periode ${labelRentang(bulan)}`, x0, 60, { width: L, align: 'right' });

  // Data karyawan
  let y = 136;
  const kv = [['Nama', karyawan.nama], ['NIK', karyawan.nik], ['Departemen', karyawan.departemen], ['Jabatan', karyawan.jabatan]];
  kv.forEach(([k, v], i) => {
    const kx = x0 + (i % 2) * (L / 2);
    const ky = y + Math.floor(i / 2) * 34;
    doc.font('Helvetica').fontSize(8.5).fillColor(ABU).text(k.toUpperCase(), kx, ky);
    doc.font('Helvetica-Bold').fontSize(11.5).fillColor(NAVY).text(v || '-', kx, ky + 11, { width: L / 2 - 10 });
  });
  y += 84;

  // Ringkasan
  const kotak = [
    ['Tap hari kerja', `${total.tapKerja} × ${jamFmt(ATURAN.jamHariKerja)} jam`],
    ['Tap hari libur', `${total.tapLibur} × ${jamFmt(ATURAN.jamHariLibur)} jam`],
    ['Total jam hitung', `${jamFmt(total.jamHitung)} jam`],
  ];
  const lk = (L - 24) / 4;
  kotak.forEach(([k, v], i) => {
    const kx = x0 + i * (lk + 8);
    doc.roundedRect(kx, y, lk, 54, 8).fill('#F1F3FA');
    doc.font('Helvetica').fontSize(8.5).fillColor(ABU).text(k, kx + 10, y + 11, { width: lk - 20 });
    doc.font('Helvetica-Bold').fontSize(12).fillColor(NAVY).text(v, kx + 10, y + 27, { width: lk - 20 });
  });
  const tx = x0 + 3 * (lk + 8);
  doc.roundedRect(tx, y, lk, 54, 8).fill(TEAL);
  doc.font('Helvetica').fontSize(8.5).fillColor('#BFF2E5').text('Upah lembur', tx + 10, y + 11);
  doc.font('Helvetica-Bold').fontSize(12.5).fillColor('#FFFFFF').text(rp(total.nominal), tx + 10, y + 27, { width: lk - 20 });
  y += 78;

  // Tabel rincian
  const kol = [
    { j: 'No', w: 26, a: 'left' }, { j: 'Tanggal', w: 74, a: 'left' }, { j: 'Jam', w: 70, a: 'left' },
    { j: 'Jenis hari', w: 64, a: 'left' }, { j: 'Jam hitung', w: 62, a: 'right' }, { j: 'Upah sejam', w: 82, a: 'right' },
    { j: 'Nominal', w: L - 26 - 82 - 50 - 76 - 62 - 82, a: 'right' },
  ];
  const baris = (isi, yy, opsi = {}) => {
    let cx = x0;
    isi.forEach((t, i) => {
      doc.font(opsi.tebal ? 'Helvetica-Bold' : 'Helvetica').fontSize(opsi.kecil ? 8.5 : 9.5).fillColor(opsi.warna || NAVY)
        .text(String(t), cx + (i ? 4 : 0), yy, { width: kol[i].w - 8, align: kol[i].a, lineBreak: false });
      cx += kol[i].w;
    });
  };
  const kepalaTabel = () => {
    doc.rect(x0, y, L, 22).fill('#E9EBF3');
    baris(kol.map((k) => k.j), y + 7, { tebal: true, kecil: true, warna: ABU });
    y += 26;
  };
  kepalaTabel();

  if (!taps.length) {
    doc.font('Helvetica').fontSize(10).fillColor(ABU).text('Belum ada lembur di bulan ini.', x0, y + 6);
    y += 30;
  }
  taps.forEach((t, i) => {
    if (y > doc.page.height - 120) { doc.addPage(); y = 48; kepalaTabel(); }
    const jenis = t.jenisHari === 'KERJA' ? 'Hari kerja' : 'Libur';
    baris([i + 1, tglPanjang(t.tanggal), t.jamMulai ? `${t.jamMulai}–${t.jamSelesai}` : t.jam, jenis + (t.manual ? ' *' : ''), jamFmt(t.jamHitung), rp(t.upahSejam), rp(t.nominal)], y);
    y += 18;
    doc.moveTo(x0, y - 4).lineTo(x0 + L, y - 4).lineWidth(0.5).strokeColor(GARIS).stroke();
  });

  y += 4;
  doc.rect(x0, y, L, 24).fill('#E7F8F3');
  baris(['', 'Total', '', `${total.tap} tap`, jamFmt(total.jamHitung), '', rp(total.nominal)], y + 7, { tebal: true, warna: TEAL });
  y += 40;

  // Catatan
  if (y > doc.page.height - 130) { doc.addPage(); y = 48; }
  const catatan = [
    `Upah sejam = 1/${ATURAN.pembagi} × upah sebulan (PP No. 35 Tahun 2021).`,
    `Hari kerja: 1 tap = ${jamFmt(ATURAN.jamHariKerja)} jam hitung (3 jam lembur). Sabtu, Minggu & tanggal merah: 1 tap = ${jamFmt(ATURAN.jamHariLibur)} jam hitung (7 jam lembur).`,
    'Upah sejam mengikuti upah pada saat tap, jadi kenaikan gaji tidak mengubah lembur sebelumnya.',
  ];
  if (taps.some((t) => t.manual)) catatan.push('* Ditambahkan HRD secara manual (tap terlewat).');
  doc.font('Helvetica').fontSize(8.5).fillColor(ABU);
  catatan.forEach((c) => { doc.text(c, x0, y, { width: L }); y = doc.y + 3; });

  doc.fontSize(8).fillColor('#8A90A8')
    .text(`Dicetak ${dicetak} dari portal karyawan lemburin. Slip ini bukan bukti transfer gaji.`, x0, doc.page.height - 64, { width: L, align: 'center' });

  doc.end();
  return doc;
}
