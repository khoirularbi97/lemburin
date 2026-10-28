import { Router } from 'express';
import ExcelJS from 'exceljs';
import { prisma } from '../lib/prisma.js';
import { ah, HttpError, ringkasKaryawan } from '../lib/util.js';
import {
  dariTanggalDb, jamWIB, polaBulan, rentangBulan, upahSejam, waktuJakarta,
} from '../lib/lembur.js';

const router = Router();

async function hitungRekap(bulan, departemen) {
  const where = { tanggal: rentangBulan(bulan) };
  if (departemen) where.karyawan = { departemen };
  const taps = await prisma.lembur.findMany({
    where,
    include: { karyawan: true, petugas: { select: { username: true } } },
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
  const bulan = q.bulan || waktuJakarta().tanggal.slice(0, 7);
  if (!polaBulan(bulan)) throw new HttpError(400, 'Format bulan harus YYYY-MM');
  return bulan;
}

router.get('/', ah(async (req, res) => {
  res.json(await hitungRekap(bacaBulan(req.query), req.query.departemen));
}));

// Daftar bulan yang punya data, untuk dropdown periode
router.get('/bulan', ah(async (req, res) => {
  const rows = await prisma.$queryRaw`SELECT DISTINCT to_char("tanggal", 'YYYY-MM') AS bulan FROM "Lembur" ORDER BY bulan DESC`;
  const sekarang = waktuJakarta().tanggal.slice(0, 7);
  const set = new Set([sekarang, ...rows.map((r) => r.bulan)]);
  res.json([...set].sort().reverse());
}));

router.get('/export', ah(async (req, res) => {
  const bulan = bacaBulan(req.query);
  const { rows, total } = await hitungRekap(bulan, req.query.departemen);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'lemburin';
  const rp = '#,##0';

  const ws = wb.addWorksheet('Rekap');
  ws.addRow([`Rekap Lembur ${bulan}${req.query.departemen ? ` · ${req.query.departemen}` : ''}`]).font = { bold: true, size: 14 };
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
  wd.addRow(['Tanggal', 'Jam tap', 'Karyawan', 'NIK', 'Departemen', 'Jenis hari', 'Jam hitung', 'Upah sejam', 'Nominal', 'Petugas']).font = { bold: true };
  for (const r of rows) {
    for (const t of r.taps) {
      wd.addRow([t.tanggal, t.jam, r.karyawan.nama, r.karyawan.nik, r.karyawan.departemen, t.jenisHari === 'KERJA' ? 'Hari kerja' : 'Libur', t.jamHitung, t.upahSejam, t.nominal, t.petugas]);
    }
  }
  wd.columns.forEach((c, i) => { c.width = [12, 9, 24, 12, 18, 12, 11, 12, 12, 16][i]; });
  [8, 9].forEach((i) => { wd.getColumn(i).numFmt = rp; });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="rekap-lembur-${bulan}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}));

// Koreksi: hapus tap yang keliru
router.delete('/tap/:id', ah(async (req, res) => {
  await prisma.lembur.delete({ where: { id: Number(req.params.id) } });
  res.status(204).end();
}));

export default router;
