import { Router } from 'express';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ah, HttpError, ringkasKaryawan } from '../lib/util.js';
import {
  dariTanggalDb, jamWIB, labelRentang, periodeDari, polaBulan, rentangPeriode, upahSejam, waktuJakarta,
} from '../lib/lembur.js';
import { buatTapManual, wajibTanggalManual } from '../lib/tapManual.js';
import { kabariTapTercatat } from '../lib/notifikasi.js';

const router = Router();

async function hitungRekap(bulan, departemen) {
  const where = { tanggal: rentangPeriode(bulan) };
  if (departemen) where.karyawan = { departemen };
  const taps = await prisma.lembur.findMany({
    where,
    include: { karyawan: true, petugas: { select: { username: true } }, spl: { select: { id: true, nomor: true, sumber: true, fotoMime: true, fotoDihapus: true } } },
    orderBy: [{ tanggal: 'asc' }, { waktuTap: 'asc' }],
  });

  const perKaryawan = new Map();
  for (const t of taps) {
    let r = perKaryawan.get(t.karyawanId);
    if (!r) {
      r = {
        karyawan: { ...ringkasKaryawan(t.karyawan), upahBulanan: t.karyawan.upahBulanan, upahSejam: upahSejam(t.karyawan.upahBulanan) },
        tapKerja: 0, tapLibur: 0, jamHitung: 0, nominal: 0, taps: [],
      };
      perKaryawan.set(t.karyawanId, r);
    }
    if (t.jenisHari === 'KERJA') r.tapKerja += 1; else r.tapLibur += 1;
    r.jamHitung += t.jamHitung;
    r.nominal += t.nominal;
    r.taps.push({
      id: t.id, tanggal: dariTanggalDb(t.tanggal), jam: jamWIB(t.waktuTap), jenisHari: t.jenisHari,
      jamHitung: t.jamHitung, upahSejam: t.upahSejam, nominal: t.nominal, petugas: t.petugas.username,
      manual: t.manual, alasan: t.alasan, metode: t.metode || 'TETAP', sumber: t.sumber || null,
      jamMulai: t.mulai ? jamWIB(t.mulai) : null, jamSelesai: t.selesai ? jamWIB(t.selesai) : null,
      menitLembur: t.menitLembur ?? null, rincian: t.rincianHitung?.rincian || null,
      spl: t.spl ? { id: t.spl.id, nomor: t.spl.nomor, sumber: t.spl.sumber, adaFoto: Boolean(t.spl.fotoMime) && !t.spl.fotoDihapus, fotoDihapus: Boolean(t.spl.fotoDihapus) } : null,
    });
  }

  const rows = [...perKaryawan.values()].sort((a, b) => b.nominal - a.nominal);
  const total = rows.reduce((s, r) => ({
    tapKerja: s.tapKerja + r.tapKerja,
    tapLibur: s.tapLibur + r.tapLibur,
    jamHitung: s.jamHitung + r.jamHitung,
    nominal: s.nominal + r.nominal,
  }), { tapKerja: 0, tapLibur: 0, jamHitung: 0, nominal: 0 });

  return { bulan, departemen: departemen || null, rows, total };
}

function bacaBulan(q) {
  const bulan = q.bulan || periodeDari(waktuJakarta().tanggal);
  if (!polaBulan(bulan)) throw new HttpError(400, 'Format bulan harus YYYY-MM');
  return bulan;
}

router.get('/', ah(async (req, res) => {
  res.json(await hitungRekap(bacaBulan(req.query), req.query.departemen));
}));

// Daftar bulan yang punya data, untuk dropdown periode
router.get('/bulan', ah(async (req, res) => {
  const rows = await prisma.$queryRaw`SELECT DISTINCT "tanggal" FROM "Lembur"`;
  const sekarang = periodeDari(waktuJakarta().tanggal);
  const set = new Set([sekarang, ...rows.map((r) => periodeDari(dariTanggalDb(r.tanggal)))]);
  res.json([...set].sort().reverse());
}));

router.get('/export', ah(async (req, res) => {
  const bulan = bacaBulan(req.query);
  const { rows, total } = await hitungRekap(bulan, req.query.departemen);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'lemburin';
  const rp = '#,##0';

  const ws = wb.addWorksheet('Rekap');
  ws.addRow([`Rekap Lembur periode ${new Date(`${bulan}-15T12:00:00Z`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' })} (${labelRentang(bulan)})${req.query.departemen ? ` · ${req.query.departemen}` : ''}`]).font = { bold: true, size: 14 };
  ws.addRow(['Hari kerja 5,5 jam hitung per tap; Sabtu, Minggu & tanggal merah 14 jam hitung; upah sejam = 1/173 × upah sebulan']);
  ws.addRow([]);
  const head = ws.addRow(['Karyawan', 'NIK', 'Departemen', 'Upah sebulan', 'Upah sejam', 'Tap hari kerja', 'Tap libur', 'Jam hitung', 'Upah lembur']);
  head.font = { bold: true };
  for (const r of rows) {
    ws.addRow([r.karyawan.nama, r.karyawan.nik, r.karyawan.departemen, r.karyawan.upahBulanan, r.karyawan.upahSejam, r.tapKerja, r.tapLibur, r.jamHitung, r.nominal]);
  }
  ws.addRow(['Total', '', '', '', '', total.tapKerja, total.tapLibur, total.jamHitung, total.nominal]).font = { bold: true };
  ws.columns.forEach((c, i) => { c.width = [24, 12, 18, 15, 12, 14, 10, 12, 15][i]; });
  [4, 5, 9].forEach((i) => { ws.getColumn(i).numFmt = rp; });

  const wd = wb.addWorksheet('Detail tap');
  wd.addRow(['Tanggal', 'Jam tap', 'Mulai', 'Selesai', 'Menit lembur', 'Rincian tarif', 'Karyawan', 'NIK', 'Departemen', 'Jenis hari', 'Jam hitung', 'Upah sejam', 'Nominal', 'Sumber', 'Dicatat oleh', 'Alasan manual']).font = { bold: true };
  for (const r of rows) {
    for (const t of r.taps) {
      const sumber = t.sumber === 'MANDIRI' ? 'Tap mandiri (wajah + QR)' : t.spl ? (t.spl.sumber === 'FOTO' ? 'Foto SPL' : 'Input massal') : t.manual ? 'Manual' : 'Scan QR';
      const rinci = t.rincian ? t.rincian.map((x) => `${x.jam}j×${x.kali}`).join(' + ') : 'Tetap (5,5 / 14)';
      wd.addRow([t.tanggal, t.jam, t.jamMulai || '', t.jamSelesai || '', t.menitLembur ?? '', rinci, r.karyawan.nama, r.karyawan.nik, r.karyawan.departemen, t.jenisHari === 'KERJA' ? 'Hari kerja' : 'Libur', t.jamHitung, t.upahSejam, t.nominal, sumber, t.petugas, t.alasan || '']);
    }
  }
  wd.columns.forEach((c, i) => { c.width = [12, 9, 8, 8, 11, 22, 24, 12, 18, 12, 11, 12, 12, 20, 16, 36][i]; });
  [12, 13].forEach((i) => { wd.getColumn(i).numFmt = rp; });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="rekap-lembur-${bulan}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}));

// Tap manual oleh admin, untuk lembur yang lupa di-tap (mis. kemarin tanggal 20).
// Hanya admin (router ini sudah dijaga wajibPeran('ADMIN')).
const skemaManual = z.object({
  karyawanId: z.coerce.number().int().positive(),
  tanggal: z.string(),
  jam: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format jam harus HH:mm'),
  alasan: z.string().trim().min(5, 'Alasan minimal 5 huruf').max(200),
});

router.post('/tap', ah(async (req, res) => {
  const data = skemaManual.parse(req.body);
  wajibTanggalManual(data.tanggal);
  const karyawan = await prisma.karyawan.findUnique({ where: { id: data.karyawanId } });
  if (!karyawan) throw new HttpError(404, 'Karyawan tidak ditemukan');

  const { tap, hasil } = await buatTapManual(prisma, { karyawan, tanggal: data.tanggal, jam: data.jam, alasan: data.alasan, adminId: req.user.id });
  kabariTapTercatat(karyawan, tap, { manual: true });

  res.status(201).json({
    karyawan: ringkasKaryawan(karyawan),
    label: hasil.label + (hasil.keterangan ? ` · ${hasil.keterangan}` : ''),
    tap: {
      id: tap.id, tanggal: data.tanggal, jam: data.jam, jenisHari: tap.jenisHari, jamHitung: tap.jamHitung,
      upahSejam: tap.upahSejam, nominal: tap.nominal, manual: true, alasan: tap.alasan, petugas: req.user.username,
    },
  });
}));

// Koreksi: hapus tap yang keliru
router.delete('/tap/:id', ah(async (req, res) => {
  await prisma.lembur.delete({ where: { id: Number(req.params.id) } });
  res.status(204).end();
}));

export default router;
