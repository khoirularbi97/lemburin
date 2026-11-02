// Aturan perhitungan lembur. Semua fungsi di sini murni (tanpa database)
// supaya mudah diuji.
//
// Dasar: PP No. 35 Tahun 2021
//   upah sejam = 1/173 x upah sebulan
//   Hari kerja  : 1 tap = 5,5 jam hitung (3 jam aktual: 1x1,5 + 2x2)
//   Hari libur  : 1 tap = 14 jam hitung  (7 jam aktual x 2)

export const ATURAN = Object.freeze({
  jamHariKerja: 5.5,
  jamHariLibur: 14,
  pembagi: 173,
  zonaWaktu: 'Asia/Jakarta',
  // Periode lembur perusahaan: tanggal 21 sampai tanggal 20 bulan berikutnya.
  // Periode diberi nama bulan tempat ia berakhir: "November 2026" = 21 Okt – 20 Nov 2026.
  // Ganti lewat env TANGGAL_TUTUP_PERIODE (1–28). Samakan dengan TANGGAL_TUTUP di client/src/format.js.
  tanggalTutup: Math.min(28, Math.max(1, Number(process.env.TANGGAL_TUTUP_PERIODE) || 20)),
});

/** Tanggal (YYYY-MM-DD) dan jam (HH:mm) sekarang menurut WIB. */
export function waktuJakarta(date = new Date()) {
  const tanggal = date.toLocaleDateString('sv-SE', { timeZone: ATURAN.zonaWaktu });
  const jam = date.toLocaleTimeString('en-GB', {
    timeZone: ATURAN.zonaWaktu,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return { tanggal, jam };
}

/** 0 = Minggu ... 6 = Sabtu */
export function hariDalamMinggu(tanggal) {
  return new Date(`${tanggal}T00:00:00Z`).getUTCDay();
}

/**
 * @param {string} tanggal  YYYY-MM-DD
 * @param {Map<string,string>|Set<string>} libur  tanggal libur (Map: tanggal -> keterangan)
 */
export function jenisHari(tanggal, libur = new Map()) {
  if (libur.has(tanggal)) {
    const ket = libur instanceof Map ? libur.get(tanggal) : '';
    return { jenis: 'LIBUR', label: 'Hari libur', keterangan: ket || '', jam: ATURAN.jamHariLibur };
  }
  const d = hariDalamMinggu(tanggal);
  if (d === 0 || d === 6) {
    return { jenis: 'LIBUR', label: d === 6 ? 'Sabtu' : 'Minggu', keterangan: '', jam: ATURAN.jamHariLibur };
  }
  return { jenis: 'KERJA', label: 'Hari kerja', keterangan: '', jam: ATURAN.jamHariKerja };
}

export function upahSejam(upahBulanan) {
  return Math.round(upahBulanan / ATURAN.pembagi);
}

export function hitungLembur({ upahBulanan, tanggal, libur }) {
  const hari = jenisHari(tanggal, libur);
  const sejam = upahSejam(upahBulanan);
  return {
    jenisHari: hari.jenis,
    label: hari.label,
    keterangan: hari.keterangan,
    jamHitung: hari.jam,
    upahSejam: sejam,
    nominal: Math.round(hari.jam * sejam),
  };
}

/** 'YYYY-MM-DD' -> Date untuk kolom @db.Date */
export function keTanggalDb(tanggal) {
  return new Date(`${tanggal}T00:00:00.000Z`);
}

/** Date dari kolom @db.Date -> 'YYYY-MM-DD' */
export function dariTanggalDb(date) {
  return date.toISOString().slice(0, 10);
}

/** Jam WIB (HH:mm) dari sebuah timestamp */
export function jamWIB(date) {
  return waktuJakarta(date).jam;
}

/** Rentang tanggal satu bulan untuk filter Prisma. bulan = 'YYYY-MM' */
export function rentangBulan(bulan) {
  const [y, m] = bulan.split('-').map(Number);
  const gte = new Date(Date.UTC(y, m - 1, 1));
  const lt = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1));
  return { gte, lt };
}

const ymd = (d) => d.toISOString().slice(0, 10);

/** Kode periode (YYYY-MM) untuk sebuah tanggal. Lewat tanggal tutup → periode bulan berikutnya. */
export function periodeDari(tanggal, tutup = ATURAN.tanggalTutup) {
  const [y, m, d] = tanggal.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + (d > tutup ? 1 : 0), 1));
  return t.toISOString().slice(0, 7);
}

/** Tanggal pertama & terakhir sebuah periode, 'YYYY-MM-DD'. */
export function batasPeriode(kode, tutup = ATURAN.tanggalTutup) {
  const [y, m] = kode.split('-').map(Number);
  return { mulai: ymd(new Date(Date.UTC(y, m - 2, tutup + 1))), selesai: ymd(new Date(Date.UTC(y, m - 1, tutup))) };
}

/** Rentang periode untuk filter Prisma (gte mulai, lt hari setelah selesai). */
export function rentangPeriode(kode, tutup = ATURAN.tanggalTutup) {
  const [y, m] = kode.split('-').map(Number);
  return { gte: new Date(Date.UTC(y, m - 2, tutup + 1)), lt: new Date(Date.UTC(y, m - 1, tutup + 1)) };
}

/** Kode periode sebelumnya. */
export function periodeSebelum(kode) {
  const [y, m] = kode.split('-').map(Number);
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
}

/** "21 Okt – 20 Nov 2026" */
export function labelRentang(kode) {
  const { mulai, selesai } = batasPeriode(kode);
  const f = (s, tahun) => new Date(`${s}T12:00:00Z`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', ...(tahun ? { year: 'numeric' } : {}), timeZone: 'UTC' });
  return `${f(mulai, mulai.slice(0, 4) !== selesai.slice(0, 4))} – ${f(selesai, true)}`;
}

/** Batas tanggal tap manual & pengajuan: awal periode lalu sampai hari ini. */
export function batasManual(hariIni = waktuJakarta().tanggal) {
  return { min: batasPeriode(periodeSebelum(periodeDari(hariIni))).mulai, max: hariIni };
}

/**
 * Batas tanggal tap manual: tidak boleh di masa depan, dan paling lama
 * mundur sampai awal periode lalu (supaya periode yang sudah dibayar tidak berubah).
 * @returns {{ok: true} | {ok: false, pesan: string}}
 */
export function cekTanggalManual(tanggal, hariIni = waktuJakarta().tanggal) {
  if (!polaTanggal(tanggal)) return { ok: false, pesan: 'Format tanggal harus YYYY-MM-DD.' };
  if (tanggal > hariIni) return { ok: false, pesan: 'Tanggal lembur tidak boleh di masa depan.' };
  const awal = batasManual(hariIni).min;
  const tgl = (s) => new Date(`${s}T12:00:00Z`).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  if (tanggal < awal) return { ok: false, pesan: `Tap manual hanya bisa untuk ${tgl(awal)} sampai hari ini (periode berjalan dan periode lalu).` };
  return { ok: true, awal };
}

export function polaBulan(bulan) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(bulan);
}

export function polaTanggal(tanggal) {
  return /^\d{4}-\d{2}-\d{2}$/.test(tanggal) && !Number.isNaN(Date.parse(`${tanggal}T00:00:00Z`));
}
