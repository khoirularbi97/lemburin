// Input lembur massal: centang banyak karyawan sekaligus, atau dari foto SPL.
// Boleh dipakai admin (semua karyawan) dan petugas (hanya departemen areanya;
// petugas dengan area "Semua" boleh semua karyawan).
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ah, HttpError } from '../lib/util.js';
import { batasManual, hitungLembur, jamWIB, keTanggalDb, polaTanggal, upahSejam } from '../lib/lembur.js';
import { ambilAturan } from '../lib/aturanLembur.js';
import { buatTapManual, liburPada, wajibTanggalManual } from '../lib/tapManual.js';
import { kabariTapTercatat } from '../lib/notifikasi.js';
import { azureAktif, bacaGambar, pemakaian } from '../lib/azureOcr.js';
import { bacaSplGemini, geminiAktif, modelGemini, pemakaianGemini } from '../lib/geminiOcr.js';
import { bacaSplGroq, groqAktif, modelGroq, pemakaianGroq } from '../lib/groqOcr.js';
import { bacaFoto as ambilFoto, bersihkanFotoLama, buangFoto, MASA_SIMPAN_BULAN, simpanFoto } from '../lib/fotoSpl.js';

const router = Router();
const MAKS_KARYAWAN = 300;
const MAKS_FOTO = 1_500_000; // byte; foto sudah dikompres di HP (grayscale WebP ±60–150 KB)

function lingkup(user) {
  if (user.role === 'ADMIN' || !user.area || user.area === 'Semua') return {};
  return { departemen: user.area };
}

// Batas tanggal yang boleh diinput (sama dengan tap manual)
router.get('/batas', ah(async (req, res) => {
  res.json({
    ...batasManual(),
    masaSimpanFotoBulan: MASA_SIMPAN_BULAN,
    // Urutan: Groq → Gemini → Azure → pembaca lokal di HP
    pembaca: groqAktif ? { jenis: 'GROQ', model: modelGroq, ...(await pemakaianGroq()) }
      : geminiAktif ? { jenis: 'GEMINI', model: modelGemini, ...(await pemakaianGemini()) }
      : azureAktif ? { jenis: 'AZURE', periode: 'bulan', ...(await pemakaian()) } : { jenis: 'LOKAL' },
  });
}));

// Baca potongan kolom SPL (Nama–Alasan + strip tanggal) lewat Groq, Gemini, atau Azure.
// Batas sederhana per pengguna supaya tidak menghabiskan kuota.
const terakhirBaca = new Map();
router.post('/baca-spl', ah(async (req, res) => {
  const { gambar, jumlahBaris } = z.object({ gambar: z.string().max(4_000_000), jumlahBaris: z.number().int().min(1).max(60).optional() }).parse(req.body);
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(gambar);
  if (!m) throw new HttpError(400, 'Gambar harus JPEG, PNG, atau WEBP.');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 3_000_000) throw new HttpError(413, 'Potongan SPL terlalu besar.');
  const t = terakhirBaca.get(req.user.id) || 0;
  if (Date.now() - t < 3000) throw new HttpError(429, 'Tunggu sebentar sebelum membaca lagi.');
  terakhirBaca.set(req.user.id, Date.now());
  if (groqAktif || geminiAktif) {
    if (!jumlahBaris) throw new HttpError(400, 'jumlahBaris wajib. Muat ulang aplikasi.');
  }
  if (groqAktif) {
    const hasil = await bacaSplGroq(buf, `image/${m[1]}`, jumlahBaris);
    return res.json({ ...hasil, pemakaian: await pemakaianGroq() });
  }
  if (geminiAktif) {
    const hasil = await bacaSplGemini(buf, `image/${m[1]}`, jumlahBaris);
    return res.json({ ...hasil, pemakaian: await pemakaianGemini() });
  }
  const hasil = await bacaGambar(buf);
  res.json({ jenis: 'AZURE', ...hasil, pemakaian: { periode: 'bulan', ...(await pemakaian()) } });
}));

// Daftar karyawan yang boleh dipilih + status tap di tanggal itu
router.get('/karyawan', ah(async (req, res) => {
  const tanggal = String(req.query.tanggal || '');
  if (!polaTanggal(tanggal)) throw new HttpError(400, 'Format tanggal harus YYYY-MM-DD');
  const admin = req.user.role === 'ADMIN';
  const [list, taps, libur] = await Promise.all([
    prisma.karyawan.findMany({ where: { aktif: true, ...lingkup(req.user) }, orderBy: { nama: 'asc' } }),
    prisma.lembur.findMany({ where: { tanggal: keTanggalDb(tanggal) }, include: { petugas: { select: { username: true } } } }),
    liburPada(prisma, tanggal),
  ]);
  const tapPer = new Map(taps.map((t) => [t.karyawanId, t]));
  const aturan = await ambilAturan();
  const contoh = hitungLembur({ upahBulanan: 1730, tanggal, libur, aturan });
  res.json({
    tanggal,
    hari: { jenis: contoh.jenisHari, label: contoh.label, keterangan: contoh.keterangan, jam: contoh.jamHitung },
    // Untuk pratinjau hitungan jam aktual di layar (hasil akhir tetap dihitung server)
    aturan,
    libur: libur.has(tanggal) ? libur.get(tanggal) || 'Hari libur' : null,
    lingkup: lingkup(req.user).departemen || 'Semua',
    karyawan: list.map((k) => {
      const t = tapPer.get(k.id);
      return {
        id: k.id, nik: k.nik, nama: k.nama, departemen: k.departemen, jabatan: k.jabatan,
        // Upah hanya untuk admin; petugas cukup melihat jam hitung
        ...(admin ? { nominal: hitungLembur({ upahBulanan: k.upahBulanan, tanggal, libur, aturan }).nominal, upahSejam: upahSejam(k.upahBulanan) } : {}),
        sudahTap: t ? { jam: jamWIB(t.waktuTap), manual: t.manual, oleh: t.petugas.username } : null,
      };
    }),
  });
}));

const skema = z.object({
  tanggal: z.string().refine(polaTanggal, 'Format tanggal harus YYYY-MM-DD'),
  jam: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format jam harus HH:mm'),
  // Jam mulai lembur: kalau diisi, lembur dihitung jam aktual mulai–selesai (PP 35/2021)
  mulai: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format jam mulai harus HH:mm').optional().nullable(),
  nomorSpl: z.string().trim().max(60).optional().nullable(),
  alasan: z.string().trim().min(3, 'Isi keterangan pekerjaan, minimal 3 huruf').max(200),
  karyawanIds: z.array(z.coerce.number().int().positive()).min(1, 'Pilih minimal satu karyawan').max(MAKS_KARYAWAN),
  sumber: z.enum(['CENTANG', 'FOTO']).default('CENTANG'),
  foto: z.string().max(4_000_000).optional().nullable(), // data URL JPEG/PNG/WEBP
  teksOcr: z.string().max(20_000).optional().nullable(),
  // Jam/alasan berbeda per karyawan (dari baris SPL). Kosong = pakai jam & alasan umum.
  rincian: z.array(z.object({
    karyawanId: z.coerce.number().int().positive(),
    jam: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().nullable(),
    mulai: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().nullable(),
    alasan: z.string().trim().max(200).optional().nullable(),
  })).max(MAKS_KARYAWAN).optional(),
});

function bacaFoto(dataUrl) {
  if (!dataUrl) return null;
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new HttpError(400, 'Foto SPL harus gambar JPEG, PNG, atau WEBP.');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > MAKS_FOTO) throw new HttpError(413, 'Foto SPL terlalu besar (maks 1,5 MB).');
  return { mime: m[1], buf };
}

router.post('/', ah(async (req, res) => {
  const d = skema.parse(req.body);
  wajibTanggalManual(d.tanggal);
  if (d.sumber === 'FOTO' && !d.foto) throw new HttpError(400, 'Foto SPL wajib dilampirkan untuk input dari foto.');
  const foto = bacaFoto(d.foto);
  const ids = [...new Set(d.karyawanIds)];

  const karyawan = await prisma.karyawan.findMany({ where: { id: { in: ids } } });
  const perId = new Map(karyawan.map((k) => [k.id, k]));
  const area = lingkup(req.user).departemen;

  // Foto diunggah dulu ke Neon Object Storage; kalau gagal, tidak ada lembur yang tercatat
  let kolomFoto = {};
  if (foto) {
    try {
      kolomFoto = await simpanFoto(foto);
    } catch (e) {
      console.error('[foto-spl] unggah gagal:', e.name, e.message);
      throw new HttpError(502, 'Foto SPL gagal diunggah ke penyimpanan. Coba lagi sebentar.');
    }
  }
  let spl;
  try {
    spl = await prisma.spl.create({
      data: {
        nomor: d.nomorSpl || null,
        tanggal: keTanggalDb(d.tanggal),
        jamSelesai: d.jam,
        alasan: d.alasan,
        sumber: d.sumber,
        ...kolomFoto,
        teksOcr: d.teksOcr || null,
        dibuatOlehId: req.user.id,
      },
    });
  } catch (e) {
    await buangFoto(kolomFoto);
    throw e;
  }

  const rinci = new Map((d.rincian || []).map((r) => [r.karyawanId, r]));
  const keterangan = (alasan) => `${d.nomorSpl ? `SPL ${d.nomorSpl}: ` : 'Input massal: '}${alasan || d.alasan}`.slice(0, 300);
  const hasil = [];
  // Satu per satu supaya satu karyawan yang gagal (mis. sudah tap) tidak membatalkan yang lain
  for (const id of ids) {
    const k = perId.get(id);
    if (!k) { hasil.push({ karyawanId: id, status: 'GAGAL', pesan: 'Karyawan tidak ditemukan.' }); continue; }
    const r = { karyawanId: id, nama: k.nama, nik: k.nik };
    if (area && k.departemen !== area) { hasil.push({ ...r, status: 'GAGAL', pesan: `Di luar area Anda (${area}).` }); continue; }
    try {
      const r2 = rinci.get(id);
      const { tap } = await buatTapManual(prisma, {
        karyawan: k, tanggal: d.tanggal, jam: r2?.jam || d.jam, mulai: r2?.mulai || d.mulai || null,
        alasan: keterangan(r2?.alasan), adminId: req.user.id, splId: spl.id, sumber: 'MASSAL',
      });
      kabariTapTercatat(k, tap, { manual: true });
      hasil.push({ ...r, status: 'OK', jamHitung: tap.jamHitung, menitLembur: tap.menitLembur ?? null, ...(req.user.role === 'ADMIN' ? { nominal: tap.nominal } : {}) });
    } catch (e) {
      if (e.code === 'P2002') hasil.push({ ...r, status: 'SUDAH_TAP', pesan: 'Sudah punya tap di tanggal itu.' });
      else if (e.status) hasil.push({ ...r, status: e.extra?.kode === 'SUDAH_TAP' ? 'SUDAH_TAP' : 'GAGAL', pesan: e.message });
      else if (e.message?.startsWith('Jam mulai')) hasil.push({ ...r, status: 'GAGAL', pesan: e.message });
      else throw e;
    }
  }

  const ok = hasil.filter((h) => h.status === 'OK');
  if (!ok.length) { // tidak ada yang tercatat: buang SPL & fotonya
    await prisma.spl.delete({ where: { id: spl.id } });
    await buangFoto(kolomFoto);
  }
  bersihkanFotoLama().catch(() => {});
  res.status(ok.length ? 201 : 409).json({
    splId: ok.length ? spl.id : null,
    tercatat: ok.length,
    dilewati: hasil.length - ok.length,
    ...(req.user.role === 'ADMIN' ? { totalNominal: ok.reduce((s, h) => s + h.nominal, 0) } : {}),
    hasil,
  });
}));

// Foto SPL (bukti). Admin, atau petugas yang membuatnya.
router.get('/spl/:id/foto', ah(async (req, res) => {
  const spl = await prisma.spl.findUnique({ where: { id: Number(req.params.id) } });
  if (!spl) throw new HttpError(404, 'SPL tidak ditemukan.');
  if (req.user.role !== 'ADMIN' && spl.dibuatOlehId !== req.user.id) throw new HttpError(403, 'Anda tidak punya akses ke foto ini.');
  if (spl.fotoDihapus) throw new HttpError(410, `Foto SPL sudah dihapus otomatis (lebih dari ${MASA_SIMPAN_BULAN} bulan).`);
  const f = await ambilFoto(spl);
  if (!f) throw new HttpError(404, 'Foto SPL tidak ada.');
  res.set('Content-Type', f.mime);
  res.set('Cache-Control', 'private, max-age=3600');
  if (Buffer.isBuffer(f.body)) return res.send(f.body);
  // Alirkan langsung dari Neon Object Storage tanpa ditampung di memori
  f.body.on('error', () => res.destroy());
  return f.body.pipe(res);
}));

export default router;
