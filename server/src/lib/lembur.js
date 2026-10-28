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

export function polaBulan(bulan) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(bulan);
}

export function polaTanggal(tanggal) {
  return /^\d{4}-\d{2}-\d{2}$/.test(tanggal) && !Number.isNaN(Date.parse(`${tanggal}T00:00:00Z`));
}
