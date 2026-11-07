// Tap lembur mandiri dari portal karyawan:
//   1. verifikasi wajah (vektor dibanding wajah acuan yang disetujui admin)
//   2. pindai QR dinamis dari HP petugas
//   3. tap pertama = tap in (mulai lembur), tap kedua = tap out → lembur dihitung jam aktual (PP 35/2021)
// Tap eksklusif (karyawan dengan izin admin): wajah + scan ID card sendiri, SEKALI scan, dihitung seperti
// scan petugas (5,5 / 14 jam hitung). Lokasi HP dicatat sebagai pengganti saksi petugas.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ah, HttpError, ringkasKaryawan } from '../lib/util.js';
import { dariTanggalDb, hitungLembur, hitungLemburAktual, jamWIB, jenisHari, keTanggalDb, waktuSekarang } from '../lib/lembur.js';
import { liburPada, tapPada } from '../lib/tapManual.js';
import { ambilAturan, jejakAturan } from '../lib/aturanLembur.js';
import { periksaQrMandiri } from '../lib/qrMandiri.js';
import { AMBANG_WAJAH, bacaFotoWajah, bacaVektor, jarakWajah } from '../lib/wajah.js';
import { kabariTapTercatat } from '../lib/notifikasi.js';
import { ambilLokasiPabrik, catatLokasi, skemaLokasiHp } from '../lib/lokasi.js';

const router = Router();
const MAKS_JAM_SESI = 20; // tap in lebih lama dari ini dianggap lupa tap out
const MIN_MENIT_SESI = 5;

// Batasi percobaan tap (mencegah tebak-tebakan wajah/QR)
const batasTap = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 20,
  keyGenerator: (req) => `k${req.karyawan.id}`,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { pesan: 'Terlalu banyak percobaan tap. Tunggu 5 menit.' },
});

/** Izin tap eksklusif yang masih berlaku, atau null. */
export function izinEksklusif(k, waktu = new Date()) {
  if (!k.eksklusifSampai || new Date(k.eksklusifSampai) < waktu) return null;
  return { sampai: k.eksklusifSampai, alasan: k.eksklusifAlasan };
}

function bentukSesi(s, waktu = new Date()) {
  if (!s) return null;
  return {
    id: s.id, tanggal: dariTanggalDb(s.tanggal), mulai: s.mulai, jamMulai: jamWIB(s.mulai),
    menitBerjalan: Math.max(0, Math.floor((waktu - s.mulai) / 60000)),
    petugas: s.petugas ? { nama: s.petugas.nama, area: s.petugas.area } : undefined,
  };
}

export function bentukLemburAktual(t) {
  return {
    id: t.id, tanggal: dariTanggalDb(t.tanggal), metode: t.metode, sumber: t.sumber,
    jamMulai: t.mulai ? jamWIB(t.mulai) : null, jamSelesai: t.selesai ? jamWIB(t.selesai) : null,
    menitLembur: t.menitLembur, jenisHari: t.jenisHari, jamHitung: t.jamHitung, upahSejam: t.upahSejam,
    nominal: t.nominal, rincian: t.rincianHitung?.rincian || null, peringatan: t.rincianHitung?.peringatan || [],
    lokasi: t.rincianHitung?.lokasi || null,
  };
}

// ---------- wajah acuan ----------

router.get('/wajah', ah(async (req, res) => {
  const w = await prisma.wajahKaryawan.findUnique({ where: { karyawanId: req.karyawan.id } });
  res.json(w ? { status: w.status, catatan: w.catatan, didaftarkan: w.updatedAt, diprosesPada: w.diprosesPada } : { status: 'BELUM' });
}));

const skemaDaftar = z.object({
  vektor: z.array(z.number()),
  foto: z.string().max(170_000),
  setuju: z.literal(true, { errorMap: () => ({ message: 'Centang persetujuan pemrosesan data wajah dulu.' }) }),
});

router.post('/wajah', ah(async (req, res) => {
  const d = skemaDaftar.parse(req.body);
  const vektor = bacaVektor(d.vektor);
  const foto = bacaFotoWajah(d.foto);
  const data = { vektor, foto: foto.buf, fotoMime: foto.mime, status: 'MENUNGGU', persetujuan: new Date(), catatan: null, diprosesOlehId: null, diprosesPada: null };
  await prisma.wajahKaryawan.upsert({ where: { karyawanId: req.karyawan.id }, update: data, create: { karyawanId: req.karyawan.id, ...data } });
  res.status(201).json({ status: 'MENUNGGU' });
}));

// Cabut persetujuan: data wajah dihapus, tap mandiri tidak bisa dipakai sampai daftar ulang
router.delete('/wajah', ah(async (req, res) => {
  await prisma.wajahKaryawan.deleteMany({ where: { karyawanId: req.karyawan.id } });
  res.status(204).end();
}));

// ---------- status & tap ----------

router.get('/tap', ah(async (req, res) => {
  const k = req.karyawan;
  const { tanggal, waktu } = waktuSekarang(req.query.simulasi);
  const [wajah, sesi, hariIni, libur] = await Promise.all([
    prisma.wajahKaryawan.findUnique({ where: { karyawanId: k.id } }),
    prisma.sesiLembur.findUnique({ where: { karyawanId: k.id }, include: { petugas: { select: { nama: true, area: true } } } }),
    tapPada(prisma, k.id, tanggal),
    liburPada(prisma, tanggal),
  ]);
  const aturan = await ambilAturan();
  const hari = jenisHari(tanggal, libur, aturan);
  // Untuk perkiraan jam hitung yang berjalan: status libur di tanggal tap in
  const liburSesi = sesi ? await liburPada(prisma, dariTanggalDb(sesi.tanggal)) : null;
  res.json({
    wajah: wajah?.status || 'BELUM',
    wajahCatatan: wajah?.catatan || null,
    sesi: sesi ? { ...bentukSesi(sesi, waktu), libur: liburSesi.get(dariTanggalDb(sesi.tanggal)) ?? null } : null,
    hariIni: { tanggal, label: hari.label, keterangan: hari.keterangan, jenis: hari.jenis, lembur: hariIni ? bentukLemburAktual(hariIni) : null },
    aturan,
    eksklusif: izinEksklusif(k, new Date()),
    upahSejam: Math.round(k.upahBulanan / 173),
    waktuServer: waktu,
  });
}));

const skemaTap = z.object({
  qr: z.string().trim().min(1).max(200),
  vektor: z.array(z.number()),
  // Pemeriksaan "wajah hidup" (menoleh) dilakukan di HP; tanpa itu tap ditolak
  hidup: z.literal(true, { errorMap: () => ({ message: 'Verifikasi wajah belum selesai. Ikuti petunjuk menoleh.' }) }),
  simulasi: z.string().optional(),
});

/** Cocokkan wajah dengan wajah acuan yang disetujui. Mengembalikan jarak (tidak dikirim ke HP). */
async function periksaWajah(k, vektor) {
  const acuan = await prisma.wajahKaryawan.findUnique({ where: { karyawanId: k.id } });
  if (!acuan || acuan.status !== 'DISETUJUI') {
    throw new HttpError(403, acuan?.status === 'MENUNGGU' ? 'Wajah Anda masih menunggu persetujuan HRD.' : 'Daftarkan wajah Anda dulu di menu Tap.', { kode: 'WAJAH_BELUM' });
  }
  const jarak = jarakWajah(bacaVektor(vektor), acuan.vektor);
  if (jarak > AMBANG_WAJAH) {
    throw new HttpError(403, 'Wajah tidak cocok dengan wajah terdaftar. Cari tempat terang, lepas masker/kacamata gelap, lalu ulangi.', { kode: 'WAJAH_TIDAK_COCOK' });
  }
  return jarak;
}

/**
 * Tap in (belum ada sesi) atau tap out (ada sesi) setelah identitas terverifikasi.
 * @param {{k, tanggal, waktu, jarak, petugasId}} o
 */
async function prosesTap(res, { k, tanggal, waktu, jarak, petugasId }) {
  const sesi = await prisma.sesiLembur.findUnique({ where: { karyawanId: k.id } });
  if (!sesi) {
    const ada = await tapPada(prisma, k.id, tanggal);
    if (ada) throw new HttpError(409, 'Lembur hari ini sudah tercatat. Satu karyawan satu lembur per hari.', { kode: 'SUDAH_TAP' });
    const baru = await prisma.sesiLembur.create({
      data: { karyawanId: k.id, tanggal: keTanggalDb(tanggal), mulai: waktu, petugasId, jarakWajah: jarak },
      include: { petugas: { select: { nama: true, area: true } } },
    });
    return res.status(201).json({
      status: 'TAP_IN', pesan: `Tap in ${jamWIB(waktu)} WIB. Selamat bekerja — jangan lupa tap out saat selesai.`,
      sesi: bentukSesi(baru, waktu), karyawan: ringkasKaryawan(k),
    });
  }

  const menit = Math.floor((waktu - sesi.mulai) / 60000);
  if (menit < MIN_MENIT_SESI) {
    throw new HttpError(409, `Baru ${Math.max(0, menit)} menit sejak tap in. Tap out bisa dilakukan setelah ${MIN_MENIT_SESI} menit.`, { kode: 'TERLALU_CEPAT' });
  }
  if (menit > MAKS_JAM_SESI * 60) {
    throw new HttpError(409, `Tap in tanggal ${dariTanggalDb(sesi.tanggal)} jam ${jamWIB(sesi.mulai)} belum di-tap out lebih dari ${MAKS_JAM_SESI} jam. Hubungi HRD untuk mencatatnya.`, { kode: 'SESI_KEDALUWARSA' });
  }
  const tglLembur = dariTanggalDb(sesi.tanggal);
  const aturan = await ambilAturan();
  const h = hitungLemburAktual({
    upahBulanan: k.upahBulanan, tanggal: tglLembur, libur: await liburPada(prisma, tglLembur),
    mulai: jamWIB(sesi.mulai), selesai: jamWIB(waktu), aturan,
  });

  if (h.menitLembur <= 0) {
    await prisma.sesiLembur.delete({ where: { id: sesi.id } });
    return res.json({
      status: 'TIDAK_DIHITUNG', hitung: h,
      pesan: h.jenisHari === 'KERJA'
        ? `Tidak ada jam lembur: lembur hari kerja dihitung mulai ${h.mulaiDihitung} dan minimal ${aturan.pembulatanMenit} menit.`
        : `Belum ada jam lembur yang terhitung (minimal ${aturan.pembulatanMenit} menit).`,
    });
  }

  let tap;
  try {
    tap = await prisma.$transaction(async (tx) => {
      const t = await tx.lembur.create({
        data: {
          karyawanId: k.id, tanggal: keTanggalDb(tglLembur), waktuTap: waktu, jenisHari: h.jenisHari,
          jamHitung: h.jamHitung, upahSejam: h.upahSejam, nominal: h.nominal, petugasId,
          metode: 'AKTUAL', sumber: 'MANDIRI', mulai: sesi.mulai, selesai: waktu, menitLembur: h.menitLembur, jarakWajah: jarak,
          rincianHitung: {
            rincian: h.rincian, mulaiDihitung: h.mulaiDihitung, menitKotor: h.menitKotor, menitIstirahat: h.menitIstirahat,
            peringatan: h.peringatan, aturan: jejakAturan(aturan), petugasTapIn: sesi.petugasId,
          },
        },
      });
      await tx.sesiLembur.delete({ where: { id: sesi.id } });
      return t;
    });
  } catch (e) {
    if (e.code === 'P2002') throw new HttpError(409, 'Lembur tanggal itu sudah tercatat dengan cara lain (scan kartu/input HRD).', { kode: 'SUDAH_TAP' });
    throw e;
  }
  kabariTapTercatat(k, tap);
  res.status(201).json({
    status: 'TAP_OUT',
    pesan: `Tap out ${jamWIB(waktu)} WIB. Lembur ${Math.floor(h.menitLembur / 60)} jam ${h.menitLembur % 60} menit tercatat.`,
    lembur: bentukLemburAktual(tap), hitung: h, karyawan: ringkasKaryawan(k),
  });
}

router.post('/tap', batasTap, ah(async (req, res) => {
  const k = req.karyawan;
  const d = skemaTap.parse(req.body);
  const { tanggal, waktu } = waktuSekarang(d.simulasi);

  // 1. Wajah
  const jarak = await periksaWajah(k, d.vektor);

  // 2. QR petugas
  const qr = periksaQrMandiri(d.qr);
  if (!qr.ok) throw new HttpError(400, qr.pesan, { kode: qr.kode });
  const petugas = await prisma.user.findUnique({ where: { id: qr.userId } });
  if (!petugas || !petugas.aktif) throw new HttpError(400, 'QR berasal dari akun petugas yang tidak aktif.', { kode: 'QR_PETUGAS_NONAKTIF' });
  if (petugas.role !== 'ADMIN' && petugas.area !== 'Semua' && petugas.area !== k.departemen) {
    throw new HttpError(403, `QR ini milik petugas area ${petugas.area}. Pindai QR petugas area ${k.departemen}.`, { kode: 'QR_BEDA_AREA' });
  }

  // 3. Tap in atau tap out
  return prosesTap(res, { k, tanggal, waktu, jarak, petugasId: petugas.id });
}));

// ---------- tap eksklusif: scan ID card sendiri ----------

const skemaEksklusif = z.object({
  kartu: z.string().trim().min(1).max(200),
  vektor: z.array(z.number()),
  hidup: z.literal(true, { errorMap: () => ({ message: 'Verifikasi wajah belum selesai. Ikuti petunjuk menoleh.' }) }),
  lokasi: skemaLokasiHp,
  simulasi: z.string().optional(),
});

router.post('/tap-eksklusif', batasTap, ah(async (req, res) => {
  const k = req.karyawan;
  const d = skemaEksklusif.parse(req.body);
  const { tanggal, waktu } = waktuSekarang(d.simulasi);

  // 0. Izin dari admin
  if (!izinEksklusif(k, new Date())) {
    throw new HttpError(403, k.eksklusifSampai
      ? 'Izin tap eksklusif Anda sudah berakhir. Pakai QR petugas, atau minta HRD memperpanjang izin.'
      : 'Anda tidak punya izin tap eksklusif. Pakai QR dari HP petugas.', { kode: 'TANPA_IZIN_EKSKLUSIF' });
  }
  // 1. Wajah
  const jarak = await periksaWajah(k, d.vektor);
  // 2. ID card harus milik akun yang login
  if (d.kartu !== k.qrToken) {
    const lama = await prisma.qrTokenLama.findUnique({ where: { token: d.kartu } });
    if (lama?.karyawanId === k.id) throw new HttpError(410, 'Kartu ini sudah diganti. Scan ID card terbaru Anda.', { kode: 'KARTU_LAMA' });
    throw new HttpError(403, 'Ini bukan ID card Anda. Tap eksklusif hanya bisa dengan kartu milik sendiri.', { kode: 'KARTU_BUKAN_MILIK' });
  }
  // 3. Satu karyawan satu lembur per hari; tap in mandiri yang masih berjalan harus ditutup dulu
  if (await prisma.sesiLembur.findUnique({ where: { karyawanId: k.id } })) {
    throw new HttpError(409, 'Anda sedang tap in mandiri (QR petugas). Tap out atau batalkan dulu tap in itu.', { kode: 'ADA_TAP_IN' });
  }
  // 4. Penanggung jawab = admin pemberi izin; lokasi dicatat (tidak memblokir)
  let petugasId = k.eksklusifOlehId;
  if (!petugasId || !(await prisma.user.findUnique({ where: { id: petugasId } }))) {
    petugasId = (await prisma.user.findFirst({ where: { role: 'ADMIN', aktif: true }, orderBy: { id: 'asc' } }))?.id;
  }
  if (!petugasId) throw new HttpError(500, 'Belum ada admin aktif.');
  const lokasi = catatLokasi(d.lokasi, await ambilLokasiPabrik(), waktu);

  // 5. Sekali scan, dihitung seperti scan petugas (hari kerja / hari libur, jam hitung tetap)
  const h = hitungLembur({ upahBulanan: k.upahBulanan, tanggal, libur: await liburPada(prisma, tanggal), aturan: await ambilAturan() });
  let tap;
  try {
    tap = await prisma.lembur.create({
      data: {
        karyawanId: k.id, tanggal: keTanggalDb(tanggal), waktuTap: waktu, jenisHari: h.jenisHari,
        jamHitung: h.jamHitung, upahSejam: h.upahSejam, nominal: h.nominal, petugasId,
        sumber: 'EKSKLUSIF', jarakWajah: jarak, rincianHitung: { lokasi },
      },
    });
  } catch (e) {
    if (e.code === 'P2002') throw new HttpError(409, 'Lembur hari ini sudah tercatat. Satu karyawan satu lembur per hari.', { kode: 'SUDAH_TAP' });
    throw e;
  }
  kabariTapTercatat(k, tap);
  res.status(201).json({
    status: 'OK',
    pesan: `Tap ${jamWIB(waktu)} WIB tercatat · ${h.label}${h.keterangan ? ` (${h.keterangan})` : ''}.`,
    lembur: { ...bentukLemburAktual(tap), jamTap: jamWIB(waktu) }, karyawan: ringkasKaryawan(k), lokasi,
  });
}));

// Batalkan tap in (mis. salah tap)
router.delete('/tap', ah(async (req, res) => {
  const r = await prisma.sesiLembur.deleteMany({ where: { karyawanId: req.karyawan.id } });
  if (!r.count) throw new HttpError(404, 'Tidak ada tap in yang berjalan.');
  res.status(204).end();
}));

export default router;
