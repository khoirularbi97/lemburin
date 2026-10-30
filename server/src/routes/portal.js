// Portal karyawan: login NIK + sandi, lihat lembur sendiri, slip PDF,
// lapor tap terlewat, kartu QR cadangan, dan langganan notifikasi.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ah, cekSandiBaru, HttpError, ringkasKaryawan } from '../lib/util.js';
import {
  cekTanggalManual, dariTanggalDb, jamWIB, jenisHari, keTanggalDb, polaBulan, polaTanggal,
  rentangBulan, upahSejam, waktuJakarta,
} from '../lib/lembur.js';
import { liburPada, tapPada } from '../lib/tapManual.js';
import { buatSlip, ringkasTap } from '../lib/slip.js';
import { infoPush, kirimPushRinci, statusFcm } from '../lib/notifikasi.js';
import { buatJwtKaryawan, wajibKaryawan, wajibSandiSendiri } from '../middleware/auth.js';

const router = Router();

const batasLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { pesan: 'Terlalu banyak percobaan masuk. Coba lagi 15 menit lagi.' },
});

function profil(k) {
  return {
    ...ringkasKaryawan(k),
    upahBulanan: k.upahBulanan,
    upahSejam: upahSejam(k.upahBulanan),
    wajibGantiSandi: k.wajibGantiSandi,
    perluCetakUlang: k.perluCetakUlang,
  };
}

function bentukTap(t) {
  return {
    id: t.id, tanggal: dariTanggalDb(t.tanggal), jam: jamWIB(t.waktuTap), jenisHari: t.jenisHari,
    jamHitung: t.jamHitung, upahSejam: t.upahSejam, nominal: t.nominal, manual: t.manual,
  };
}

function bentukPengajuan(p) {
  return {
    id: p.id, tanggal: dariTanggalDb(p.tanggal), jam: p.jam, alasan: p.alasan, status: p.status,
    catatanAdmin: p.catatanAdmin, diprosesPada: p.diprosesPada, dibuat: p.createdAt,
    nominal: p.lembur?.nominal ?? null,
  };
}

const bulanIni = () => waktuJakarta().tanggal.slice(0, 7);
function bacaBulan(q) {
  const b = q.bulan || bulanIni();
  if (!polaBulan(b)) throw new HttpError(400, 'Format bulan harus YYYY-MM');
  return b;
}

async function tapBulan(karyawanId, bulan) {
  const taps = await prisma.lembur.findMany({
    where: { karyawanId, tanggal: rentangBulan(bulan) },
    orderBy: [{ tanggal: 'desc' }],
  });
  return taps.map(bentukTap);
}

// ---------- tanpa login ----------

const skemaLogin = z.object({ nik: z.string().trim().min(1), sandi: z.string().min(1) });

router.post('/login', batasLogin, ah(async (req, res) => {
  const { nik, sandi } = skemaLogin.parse(req.body);
  const k = await prisma.karyawan.findUnique({ where: { nik: nik.toUpperCase() } });
  const cocok = k?.sandiHash ? await bcrypt.compare(sandi, k.sandiHash) : false;
  if (!k || !cocok) {
    const belumAktif = k && !k.sandiHash;
    return res.status(401).json({
      pesan: belumAktif ? 'Akun portal Anda belum diaktifkan. Minta sandi awal ke HRD.' : 'NIK atau sandi salah.',
    });
  }
  if (!k.aktif) return res.status(403).json({ pesan: 'Akun Anda sedang nonaktif. Hubungi HRD.' });
  await prisma.karyawan.update({ where: { id: k.id }, data: { loginTerakhir: new Date() } });
  res.json({ token: buatJwtKaryawan(k), karyawan: profil(k) });
}));

// ---------- wajib login karyawan ----------

router.use(wajibKaryawan);

router.get('/saya', ah(async (req, res) => {
  res.json({ karyawan: profil(req.karyawan), push: infoPush() });
}));

router.post('/ganti-sandi', ah(async (req, res) => {
  const { sandiLama, sandiBaru } = z.object({ sandiLama: z.string().min(1), sandiBaru: z.string() }).parse(req.body);
  const k = req.karyawan;
  if (!(await bcrypt.compare(sandiLama, k.sandiHash))) throw new HttpError(400, 'Sandi lama salah.');
  const salah = cekSandiBaru(sandiBaru, { nik: k.nik, lama: sandiLama });
  if (salah) throw new HttpError(400, salah);
  const baru = await prisma.karyawan.update({
    where: { id: k.id },
    data: { sandiHash: await bcrypt.hash(sandiBaru, 10), wajibGantiSandi: false, sandiDiubah: new Date() },
  });
  // Token lama otomatis tidak berlaku (sandiDiubah), jadi kirim token baru
  res.json({ token: buatJwtKaryawan(baru), karyawan: profil(baru) });
}));

// Sisa rute hanya setelah sandi awal diganti
router.use(wajibSandiSendiri);

router.get('/ringkasan', ah(async (req, res) => {
  const k = req.karyawan;
  const bulan = bacaBulan(req.query);
  const { tanggal: hariIni } = waktuJakarta();

  const [taps, terakhir, menunggu, bulanAda, tapHariIni, libur] = await Promise.all([
    tapBulan(k.id, bulan),
    prisma.lembur.findFirst({ where: { karyawanId: k.id }, orderBy: { tanggal: 'desc' } }),
    prisma.pengajuanTap.count({ where: { karyawanId: k.id, status: 'MENUNGGU' } }),
    prisma.$queryRaw`SELECT DISTINCT to_char("tanggal", 'YYYY-MM') AS bulan FROM "Lembur" WHERE "karyawanId" = ${k.id} ORDER BY bulan DESC`,
    tapPada(prisma, k.id, hariIni),
    liburPada(prisma, hariIni),
  ]);
  const hari = jenisHari(hariIni, libur);

  res.json({
    bulan,
    bulanTersedia: [...new Set([bulanIni(), ...bulanAda.map((b) => b.bulan)])].sort().reverse(),
    total: ringkasTap(taps),
    taps,
    tapTerakhir: terakhir ? bentukTap(terakhir) : null,
    pengajuanMenunggu: menunggu,
    hariIni: { tanggal: hariIni, label: hari.label, keterangan: hari.keterangan, jam: hari.jam, tap: tapHariIni ? bentukTap(tapHariIni) : null },
  });
}));

// Kartu QR cadangan (kalau ID card tertinggal). Isinya sama dengan QR di kartu.
router.get('/qr', ah(async (req, res) => {
  const k = req.karyawan;
  res.set('Cache-Control', 'no-store');
  res.json({ qrToken: k.qrToken, perluCetakUlang: k.perluCetakUlang, karyawan: ringkasKaryawan(k) });
}));

router.get('/slip', ah(async (req, res) => {
  const k = req.karyawan;
  const bulan = bacaBulan(req.query);
  const taps = (await tapBulan(k.id, bulan)).reverse(); // urut tanggal naik
  const sekarang = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'long', timeStyle: 'short' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="slip-lembur-${k.nik}-${bulan}.pdf"`);
  buatSlip({
    karyawan: ringkasKaryawan(k),
    bulan,
    taps,
    perusahaan: process.env.NAMA_PERUSAHAAN || 'Nama perusahaan',
    dicetak: `${sekarang} WIB`,
  }).pipe(res);
}));

// ---------- pengajuan tap terlewat ----------

router.get('/pengajuan', ah(async (req, res) => {
  const list = await prisma.pengajuanTap.findMany({
    where: { karyawanId: req.karyawan.id },
    include: { lembur: { select: { nominal: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(list.map(bentukPengajuan));
}));

const skemaPengajuan = z.object({
  tanggal: z.string().refine(polaTanggal, 'Format tanggal harus YYYY-MM-DD'),
  jam: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format jam harus HH:mm'),
  alasan: z.string().trim().min(5, 'Ceritakan singkat, minimal 5 huruf').max(300),
});

router.post('/pengajuan', ah(async (req, res) => {
  const k = req.karyawan;
  const data = skemaPengajuan.parse(req.body);
  const cek = cekTanggalManual(data.tanggal);
  if (!cek.ok) throw new HttpError(400, cek.pesan);
  if (await tapPada(prisma, k.id, data.tanggal)) throw new HttpError(409, 'Lembur di tanggal itu sudah tercatat. Cek di Riwayat.');
  const dobel = await prisma.pengajuanTap.findFirst({
    where: { karyawanId: k.id, tanggal: keTanggalDb(data.tanggal), status: 'MENUNGGU' },
  });
  if (dobel) throw new HttpError(409, 'Anda sudah mengajukan tanggal itu dan masih menunggu HRD.');
  const terbuka = await prisma.pengajuanTap.count({ where: { karyawanId: k.id, status: 'MENUNGGU' } });
  if (terbuka >= 10) throw new HttpError(429, 'Masih ada 10 pengajuan menunggu. Tunggu HRD memprosesnya dulu.');

  const p = await prisma.pengajuanTap.create({
    data: { karyawanId: k.id, tanggal: keTanggalDb(data.tanggal), jam: data.jam, alasan: data.alasan },
  });
  res.status(201).json(bentukPengajuan(p));
}));

router.delete('/pengajuan/:id', ah(async (req, res) => {
  const p = await prisma.pengajuanTap.findFirst({ where: { id: Number(req.params.id), karyawanId: req.karyawan.id } });
  if (!p) throw new HttpError(404, 'Pengajuan tidak ditemukan.');
  if (p.status !== 'MENUNGGU') throw new HttpError(409, 'Pengajuan yang sudah diproses tidak bisa dibatalkan.');
  const baru = await prisma.pengajuanTap.update({ where: { id: p.id }, data: { status: 'DIBATALKAN' } });
  res.json(bentukPengajuan(baru));
}));

// ---------- notifikasi ----------

// Kotak masuk (ikon lonceng)
router.get('/notifikasi/jumlah', ah(async (req, res) => {
  res.json({ belumDibaca: await prisma.notifikasi.count({ where: { karyawanId: req.karyawan.id, dibaca: false } }) });
}));

router.get('/notifikasi', ah(async (req, res) => {
  const list = await prisma.notifikasi.findMany({
    where: { karyawanId: req.karyawan.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(list.map((n) => ({ id: n.id, judul: n.judul, isi: n.isi, url: n.url, dibaca: n.dibaca, waktu: n.createdAt })));
}));

router.post('/notifikasi/baca', ah(async (req, res) => {
  await prisma.notifikasi.updateMany({ where: { karyawanId: req.karyawan.id, dibaca: false }, data: { dibaca: true } });
  res.json({ ok: true });
}));

const skemaLangganan = z.discriminatedUnion('jenis', [
  z.object({
    jenis: z.literal('WEB'),
    endpoint: z.string().url().max(1000),
    keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
    perangkat: z.string().max(120).optional(),
  }),
  z.object({
    jenis: z.literal('FCM'),
    token: z.string().min(20).max(4096),
    perangkat: z.string().max(120).optional(),
  }),
]);

router.post('/push/langganan', ah(async (req, res) => {
  const d = skemaLangganan.parse(req.body);
  const info = infoPush();
  if (d.jenis === 'WEB' && !info.web) throw new HttpError(503, 'Notifikasi belum diaktifkan di server.');
  if (d.jenis === 'FCM' && !info.fcm) throw new HttpError(503, 'Notifikasi aplikasi belum diaktifkan di server.');
  const endpoint = d.jenis === 'WEB' ? d.endpoint : d.token;
  const data = {
    karyawanId: req.karyawan.id,
    jenis: d.jenis,
    endpoint,
    p256dh: d.jenis === 'WEB' ? d.keys.p256dh : null,
    auth: d.jenis === 'WEB' ? d.keys.auth : null,
    perangkat: d.perangkat || null,
  };
  // Endpoint yang sama bisa pindah pemilik (HP dipakai bergantian): ambil alih
  await prisma.langgananPush.upsert({ where: { endpoint }, update: data, create: data });
  res.status(201).json({ ok: true });
}));

router.delete('/push/langganan', ah(async (req, res) => {
  const { endpoint } = z.object({ endpoint: z.string().min(10) }).parse(req.body);
  await prisma.langgananPush.deleteMany({ where: { endpoint, karyawanId: req.karyawan.id } });
  res.status(204).end();
}));

router.post('/push/tes', ah(async (req, res) => {
  const r = await kirimPushRinci(req.karyawan.id, {
    judul: 'Notifikasi lemburin aktif',
    isi: 'Anda akan diberi tahu setiap kali lembur tercatat.',
    url: '/portal',
    tag: 'tes',
  });
  res.json(r);
}));

// Diagnosa: kondisi server + perangkat terdaftar milik karyawan ini
router.get('/push/status', ah(async (req, res) => {
  const [fcm, perangkat] = await Promise.all([
    statusFcm(),
    prisma.langgananPush.findMany({ where: { karyawanId: req.karyawan.id }, orderBy: { createdAt: 'desc' } }),
  ]);
  res.json({
    server: { web: infoPush().web, fcm },
    perangkat: perangkat.map((l) => ({ jenis: l.jenis, perangkat: l.perangkat, sejak: l.createdAt, terakhirDipakai: l.terakhirDipakai })),
  });
}));

export default router;
