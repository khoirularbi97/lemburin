import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { kabariTapTercatat } from '../lib/notifikasi.js';
import { buatQrMandiri } from '../lib/qrMandiri.js';
import { ambilAturan } from '../lib/aturanLembur.js';
import { ah, ringkasKaryawan } from '../lib/util.js';
import {
  dariTanggalDb, hitungLembur, jamWIB, jenisHari, keTanggalDb, waktuJakarta,
} from '../lib/lembur.js';

const router = Router();

/**
 * Waktu scan. Default: jam server sekarang (WIB).
 * Untuk demo/pengujian, set IZINKAN_WAKTU_SIMULASI=true lalu kirim
 * body.simulasi = "YYYY-MM-DDTHH:mm". Jangan aktifkan di produksi.
 */
function waktuScan(simulasi) {
  if (process.env.IZINKAN_WAKTU_SIMULASI === 'true' && typeof simulasi === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(simulasi)) {
    const [tanggal, jam] = simulasi.split('T');
    return { tanggal, jam, simulasi: true };
  }
  return { ...waktuJakarta(), simulasi: false };
}

async function liburPada(tanggal) {
  const h = await prisma.hariLibur.findUnique({ where: { tanggal: keTanggalDb(tanggal) } });
  return h ? new Map([[tanggal, h.keterangan]]) : new Map();
}

async function catatDitolak({ tanggal, jam, karyawanId, alasan, petugasId }) {
  await prisma.tapDitolak.create({
    data: {
      tanggal: keTanggalDb(tanggal),
      waktu: new Date(`${tanggal}T${jam}:00+07:00`),
      karyawanId: karyawanId ?? null,
      alasan,
      petugasId,
    },
  });
}

function formatTap(t) {
  return {
    id: t.id,
    tanggal: dariTanggalDb(t.tanggal),
    jam: jamWIB(t.waktuTap),
    jenisHari: t.jenisHari,
    jamHitung: t.jamHitung,
    upahSejam: t.upahSejam,
    nominal: t.nominal,
  };
}

// QR dinamis untuk tap mandiri karyawan (ditampilkan di HP petugas/admin, berganti tiap 10 detik)
router.get('/qr-mandiri', ah(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ...buatQrMandiri(req.user.id), area: req.user.area, petugas: req.user.nama });
}));

// Siapa saja yang tap in / tap out lewat QR petugas ini hari ini (ditampilkan di bawah QR).
// Leader bisa langsung melihat kalau ada nama yang orangnya tidak ada di depannya.
router.get('/qr-mandiri/pemakai', ah(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const { tanggal } = waktuScan(req.query.simulasi);
  const tgl = keTanggalDb(tanggal);
  const [sesi, lembur] = await Promise.all([
    prisma.sesiLembur.findMany({ where: { petugasId: req.user.id }, include: { karyawan: true } }),
    prisma.lembur.findMany({ where: { tanggal: tgl, sumber: 'MANDIRI' }, include: { karyawan: true } }),
  ]);
  const kejadian = [];
  for (const s of sesi) kejadian.push({ jenis: 'TAP_IN', waktu: s.mulai, karyawan: ringkasKaryawan(s.karyawan) });
  for (const t of lembur) {
    if (t.rincianHitung?.petugasTapIn === req.user.id) kejadian.push({ jenis: 'TAP_IN', waktu: t.mulai, karyawan: ringkasKaryawan(t.karyawan) });
    if (t.petugasId === req.user.id) kejadian.push({ jenis: 'TAP_OUT', waktu: t.selesai, karyawan: ringkasKaryawan(t.karyawan), jamHitung: t.jamHitung });
  }
  kejadian.sort((a, b) => b.waktu - a.waktu);
  res.json({ tanggal, kejadian: kejadian.slice(0, 100).map((k) => ({ ...k, jam: jamWIB(k.waktu) })) });
}));

// Info hari ini untuk ditampilkan di layar scanner
router.get('/hari-ini', ah(async (req, res) => {
  const { tanggal, jam } = waktuScan(req.query.simulasi);
  const hari = jenisHari(tanggal, await liburPada(tanggal), await ambilAturan());
  res.json({ tanggal, jam, ...hari });
}));

const skemaScan = z.object({
  token: z.string().trim().min(1).max(200),
  simulasi: z.string().optional(),
});

router.post('/', ah(async (req, res) => {
  const { token, simulasi } = skemaScan.parse(req.body);
  const { tanggal, jam } = waktuScan(simulasi);
  const petugasId = req.user.id;

  const karyawan = await prisma.karyawan.findUnique({ where: { qrToken: token } });

  if (!karyawan) {
    const lama = await prisma.qrTokenLama.findUnique({ where: { token }, include: { karyawan: true } });
    await catatDitolak({
      tanggal, jam, karyawanId: lama?.karyawanId, petugasId,
      alasan: lama ? 'QR lama (kartu sudah diganti)' : 'QR tidak dikenal',
    });
    return res.status(lama ? 410 : 404).json({
      status: 'DITOLAK',
      kode: lama ? 'QR_LAMA' : 'QR_TIDAK_DIKENAL',
      pesan: lama
        ? 'Kartu ini sudah diganti. Minta karyawan memakai ID card terbaru.'
        : 'Kode ini bukan QR lembur dari sistem.',
      karyawan: ringkasKaryawan(lama?.karyawan),
      jam,
    });
  }

  if (!karyawan.aktif) {
    await catatDitolak({ tanggal, jam, karyawanId: karyawan.id, petugasId, alasan: 'Karyawan nonaktif' });
    return res.status(403).json({
      status: 'DITOLAK', kode: 'KARYAWAN_NONAKTIF',
      pesan: 'Data karyawan ini sedang dinonaktifkan. Hubungi admin.',
      karyawan: ringkasKaryawan(karyawan), jam,
    });
  }

  const libur = await liburPada(tanggal);
  const hasil = hitungLembur({ upahBulanan: karyawan.upahBulanan, tanggal, libur, aturan: await ambilAturan() });

  try {
    const tap = await prisma.lembur.create({
      data: {
        karyawanId: karyawan.id,
        tanggal: keTanggalDb(tanggal),
        waktuTap: new Date(`${tanggal}T${jam}:00+07:00`),
        jenisHari: hasil.jenisHari,
        jamHitung: hasil.jamHitung,
        upahSejam: hasil.upahSejam,
        nominal: hasil.nominal,
        petugasId,
        sumber: 'KARTU',
      },
    });
    kabariTapTercatat(karyawan, tap); // notifikasi ke HP karyawan, tidak ditunggu
    return res.status(201).json({
      status: 'OK',
      karyawan: ringkasKaryawan(karyawan),
      tap: formatTap(tap),
      label: hasil.keterangan ? `${hasil.label} · ${hasil.keterangan}` : hasil.label,
    });
  } catch (err) {
    // Unique constraint (karyawanId, tanggal): sudah tap hari ini
    if (err.code !== 'P2002') throw err;
    const pertama = await prisma.lembur.findUnique({
      where: { karyawanId_tanggal: { karyawanId: karyawan.id, tanggal: keTanggalDb(tanggal) } },
      include: { petugas: { select: { username: true } } },
    });
    await catatDitolak({ tanggal, jam, karyawanId: karyawan.id, petugasId, alasan: 'Tap ganda' });
    return res.status(409).json({
      status: 'DITOLAK', kode: 'SUDAH_TAP',
      pesan: 'Satu karyawan hanya bisa tap lembur satu kali per hari. Tap ini tidak dihitung.',
      karyawan: ringkasKaryawan(karyawan),
      jam,
      tapPertama: pertama ? { jam: jamWIB(pertama.waktuTap), petugas: pertama.petugas.username } : null,
    });
  }
}));

// Riwayat petugas yang sedang login, untuk hari ini
router.get('/saya', ah(async (req, res) => {
  const { tanggal } = waktuScan(req.query.simulasi);
  const where = { tanggal: keTanggalDb(tanggal), petugasId: req.user.id };
  const [tercatat, ditolak] = await Promise.all([
    prisma.lembur.findMany({ where, include: { karyawan: true }, orderBy: { waktuTap: 'desc' } }),
    prisma.tapDitolak.findMany({ where, include: { karyawan: true }, orderBy: { waktu: 'desc' } }),
  ]);
  res.json({
    tanggal,
    tercatat: tercatat.map((t) => ({ ...formatTap(t), karyawan: ringkasKaryawan(t.karyawan) })),
    ditolak: ditolak.map((d) => ({
      id: d.id, jam: jamWIB(d.waktu), alasan: d.alasan, karyawan: ringkasKaryawan(d.karyawan),
    })),
  });
}));

export default router;
