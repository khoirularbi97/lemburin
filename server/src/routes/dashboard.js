import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { ah, ringkasKaryawan } from '../lib/util.js';
import {
  dariTanggalDb, jamWIB, jenisHari, keTanggalDb, rentangBulan, waktuJakarta,
} from '../lib/lembur.js';

const router = Router();

router.get('/', ah(async (req, res) => {
  const { tanggal, jam } = waktuJakarta();
  const bulan = tanggal.slice(0, 7);
  const hariIniDb = keTanggalDb(tanggal);

  const [liburHariIni, hariIni, karyawanAktif, tapBulan, terbaru, ditolak, perluCetak, liburBerikut] = await Promise.all([
    prisma.hariLibur.findUnique({ where: { tanggal: hariIniDb } }),
    prisma.lembur.findMany({ where: { tanggal: hariIniDb } }),
    prisma.karyawan.count({ where: { aktif: true } }),
    prisma.lembur.findMany({ where: { tanggal: rentangBulan(bulan) }, include: { karyawan: { select: { departemen: true } } } }),
    prisma.lembur.findMany({
      take: 6, orderBy: { waktuTap: 'desc' },
      include: { karyawan: true, petugas: { select: { username: true } } },
    }),
    prisma.tapDitolak.findMany({ where: { tanggal: hariIniDb }, include: { karyawan: true }, orderBy: { waktu: 'desc' } }),
    prisma.karyawan.findMany({ where: { perluCetakUlang: true }, select: { id: true, nama: true } }),
    prisma.hariLibur.findFirst({ where: { tanggal: { gte: hariIniDb } }, orderBy: { tanggal: 'asc' } }),
  ]);

  const hari = jenisHari(tanggal, liburHariIni ? new Map([[tanggal, liburHariIni.keterangan]]) : new Map());

  const perDepartemen = {};
  let jamKerja = 0; let jamLibur = 0; let tapKerja = 0; let tapLibur = 0;
  for (const t of tapBulan) {
    perDepartemen[t.karyawan.departemen] = (perDepartemen[t.karyawan.departemen] || 0) + t.nominal;
    if (t.jenisHari === 'KERJA') { jamKerja += t.jamHitung; tapKerja += 1; } else { jamLibur += t.jamHitung; tapLibur += 1; }
  }

  res.json({
    tanggal, jam, hari,
    hariIni: {
      tap: hariIni.length,
      karyawanAktif,
      jamHitung: hariIni.reduce((s, t) => s + t.jamHitung, 0),
      nominal: hariIni.reduce((s, t) => s + t.nominal, 0),
    },
    bulan: {
      bulan,
      nominal: tapBulan.reduce((s, t) => s + t.nominal, 0),
      perDepartemen: Object.entries(perDepartemen).map(([departemen, nominal]) => ({ departemen, nominal }))
        .sort((a, b) => b.nominal - a.nominal),
      komposisi: { tapKerja, tapLibur, jamKerja, jamLibur },
    },
    terbaru: terbaru.map((t) => ({
      id: t.id, tanggal: dariTanggalDb(t.tanggal), jam: jamWIB(t.waktuTap), nominal: t.nominal,
      petugas: t.petugas.username, karyawan: ringkasKaryawan(t.karyawan),
    })),
    perhatian: {
      ditolak: ditolak.map((d) => ({ jam: jamWIB(d.waktu), alasan: d.alasan, karyawan: d.karyawan?.nama || null })),
      perluCetak: perluCetak,
      liburBerikutnya: liburBerikut ? { tanggal: dariTanggalDb(liburBerikut.tanggal), keterangan: liburBerikut.keterangan } : null,
    },
  });
}));

export default router;
