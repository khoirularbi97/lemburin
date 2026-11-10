// SALINAN mesin hitung jam aktual dari server/src/lib/lembur.js, untuk pratinjau di layar.
// Hasil yang disimpan tetap dihitung server. test/hitungAktual.test.js memastikan keduanya sama.
const ATURAN = { jamHariKerja: 5.5, jamHariLibur: 14, pembagi: 173 };

// ---------- Hitungan jam aktual (tap in / tap out, input massal dengan jam mulai) ----------
// PP 35/2021 Pasal 31: upah sejam = 1/173 upah sebulan.
//   Hari kerja  : jam pertama 1,5x, jam berikutnya 2x. Batas 4 jam/hari & 18 jam/minggu (Pasal 26).
//   Hari istirahat mingguan / libur resmi:
//     pola 5 hari kerja : jam 1–8 2x, jam 9 3x, jam 10–12 4x
//     pola 6 hari kerja : jam 1–7 2x, jam 8 3x, jam 9–11 4x
//     pola 6, libur resmi jatuh di hari kerja terpendek: jam 1–5 2x, jam 6 3x, jam 7–9 4x
export const SHIFT_BAWAAN = Object.freeze({
  aktif: false,
  // Scan / tap sebelum jam ini dihitung untuk hari kerja sebelumnya (lembur shift 2 lewat tengah malam)
  gantiHari: '07:00',
  shift1: Object.freeze({ masuk: '07:00', pulang: '16:00' }),
  // Shift 2 normal kalau shift 1 tidak lembur
  shift2: Object.freeze({ masuk: '16:00', pulang: '00:00' }),
  // Shift 2 kalau shift 1 lembur (ditandai per tanggal oleh petugas/admin)
  shift2Lembur: Object.freeze({ masuk: '19:30', pulang: '03:30' }),
  // Rotasi mingguan per grup: pada minggu acuan (Senin acuanSenin), grupShift1 masuk shift 1
  acuanSenin: '2026-11-09',
  grupShift1: 'A',
  grup: Object.freeze(['A', 'B']),
});

export const ATURAN_AKTUAL_BAWAAN = Object.freeze({
  polaKerja: 5, // 5 = Senin–Jumat, 6 = Senin–Sabtu
  hariTerpendek: 6, // untuk pola 6: hari kerja terpendek (0=Minggu..6=Sabtu), biasanya Sabtu
  jamPulang: '16:30', // jam pulang normal hari kerja (karyawan non-shift); lembur hari kerja dihitung mulai jam ini
  jamPulangTerpendek: '13:30', // jam pulang di hari kerja terpendek (pola 6)
  istirahat: [{ mulai: '12:00', selesai: '13:00' }], // jam istirahat yang tidak dihitung lembur
  pembulatanMenit: 30, // menit lembur dibulatkan ke bawah ke kelipatan ini (1 = per menit)
  shift: SHIFT_BAWAAN,
});

const TARIF_LIBUR = {
  5: [[8, 2], [1, 3], [3, 4]],
  6: [[7, 2], [1, 3], [3, 4]],
  '6pendek': [[5, 2], [1, 3], [3, 4]],
};

const keMenit = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const keJam = (menit) => { const m = ((menit % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
export const polaJam = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const tambahHari = (tanggal, n) => { const d = new Date(`${tanggal}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** Gabungkan aturan dengan bawaan (termasuk bagian shift). */
export function lengkapiAturan(aturan) {
  const a = { ...ATURAN_AKTUAL_BAWAAN, ...(aturan || {}) };
  a.shift = { ...SHIFT_BAWAAN, ...(aturan?.shift || {}) };
  return a;
}

/** Jam pergantian hari kerja (menit). Tanpa fitur shift = tengah malam. */
export function menitGantiHari(aturan) {
  const s = lengkapiAturan(aturan).shift;
  return s.aktif && polaJam(s.gantiHari) ? keMenit(s.gantiHari) : 0;
}

/**
 * Tanggal hari kerja untuk waktu tap (WIB). Tap sebelum jam ganti hari (mis. 02:00) dihitung untuk
 * hari kerja sebelumnya, karena itu kelanjutan shift malam.
 */
export function tanggalKerja(tanggal, jam, aturan) {
  return polaJam(jam) && keMenit(jam) < menitGantiHari(aturan) ? tambahHari(tanggal, -1) : tanggal;
}

/**
 * Shift seorang karyawan pada tanggal kerja tertentu, atau null untuk karyawan non-shift.
 * Rotasi mingguan: minggu genap dari acuanSenin → grupShift1 masuk shift 1, minggu ganjil sebaliknya.
 * @param {{grup?: string|null, tanggal: string, aturan?: object, shift1Lembur?: boolean}} o
 */
export function jadwalShift({ grup, tanggal, aturan, shift1Lembur = false }) {
  const s = lengkapiAturan(aturan).shift;
  if (!s.aktif || !grup || !s.grup.includes(grup)) return null;
  const hari = (t) => Math.floor(new Date(`${t}T00:00:00Z`).getTime() / 86400000);
  // Senin dari minggu tanggal ini
  const senin = hari(tanggal) - ((new Date(`${tanggal}T00:00:00Z`).getUTCDay() + 6) % 7);
  const minggu = Math.floor((senin - hari(s.acuanSenin)) / 7);
  const lain = s.grup.find((g) => g !== s.grupShift1) || s.grupShift1;
  const grupS1 = minggu % 2 === 0 ? s.grupShift1 : lain;
  if (grup === grupS1) return { kode: 'S1', nama: 'Shift 1', grup, ...s.shift1 };
  return shift1Lembur
    ? { kode: 'S2L', nama: 'Shift 2 (shift 1 lembur)', grup, ...s.shift2Lembur }
    : { kode: 'S2', nama: 'Shift 2', grup, ...s.shift2 };
}

/** Panjang tumpang tindih [a,b) dengan jam istirahat (termasuk hari berikutnya). */
function menitIstirahat(a, b, istirahat) {
  let total = 0;
  for (const r of istirahat || []) {
    if (!polaJam(r.mulai) || !polaJam(r.selesai)) continue;
    let s = keMenit(r.mulai); let e = keMenit(r.selesai);
    if (e <= s) e += 1440;
    for (const geser of [0, 1440, 2880]) total += Math.max(0, Math.min(b, e + geser) - Math.max(a, s + geser));
  }
  return total;
}

/** Kurangi rentang [a,b) dengan rentang jam kerja → potongan yang tersisa. */
function kurangi(rentang, jendela) {
  let hasil = rentang;
  for (const [s, e] of jendela) {
    hasil = hasil.flatMap(([a, b]) => {
      if (e <= a || s >= b) return [[a, b]];
      const sisa = [];
      if (a < s) sisa.push([a, s]);
      if (e < b) sisa.push([e, b]);
      return sisa;
    });
  }
  return hasil;
}

/**
 * Bagi jam lembur ke tarif bertingkat.
 * @param {number} jam  jam lembur (boleh desimal)
 * @param {Array<[number, number]>} tarif  [[batasJam, kali], ...]; batas terakhir = sisa
 */
export function bagiTarif(jam, tarif) {
  const rincian = []; let sisa = jam; let jamHitung = 0;
  tarif.forEach(([batas, kali], i) => {
    const akhir = i === tarif.length - 1;
    const pakai = akhir ? sisa : Math.min(sisa, batas);
    if (pakai > 0) { rincian.push({ jam: pakai, kali }); jamHitung += pakai * kali; sisa -= pakai; }
  });
  return { rincian, jamHitung: Math.round(jamHitung * 100) / 100 };
}

/**
 * Hitung lembur dari jam mulai & selesai sebenarnya (tap in / tap out, atau SPL dengan jam mulai).
 * `tanggal` = tanggal hari kerja. Dengan fitur shift, jam sebelum jam ganti hari (mis. 02:00) dianggap
 * hari berikutnya (kelanjutan shift malam). `jamKerja` = jam shift karyawan ({masuk, pulang, nama}):
 * di hari kerja, yang dihitung lembur hanya waktu di luar jam shift. Tanpa `jamKerja` (karyawan non-shift)
 * lembur hari kerja dihitung mulai jam pulang normal.
 */
export function hitungLemburAktual({ upahBulanan, tanggal, libur = new Map(), mulai, selesai, aturan = ATURAN_AKTUAL_BAWAAN, jamKerja = null }) {
  const a = lengkapiAturan(aturan);
  if (!polaJam(mulai) || !polaJam(selesai)) throw new Error('Jam mulai/selesai harus HH:mm');
  const hari = jenisHari(tanggal, libur, a);
  const d = hariDalamMinggu(tanggal);
  const terpendek = a.polaKerja === 6 && d === a.hariTerpendek;
  const ganti = menitGantiHari(a);
  let m0 = keMenit(mulai); let m1 = keMenit(selesai);
  if (ganti && m0 < ganti) { m0 += 1440; m1 += 1440; } // mulai setelah tengah malam = kelanjutan hari kerja ini
  if (m1 <= m0) m1 += 1440; // lewat tengah malam
  const peringatan = [];
  let potongan = [[m0, m1]];
  const shift = jamKerja && polaJam(jamKerja.masuk) && polaJam(jamKerja.pulang) ? jamKerja : null;
  if (hari.jenis === 'KERJA' && shift) {
    // Karyawan shift: lembur = waktu di luar jam shift (sebelum masuk atau setelah pulang)
    const s = keMenit(shift.masuk); let e = keMenit(shift.pulang);
    if (e <= s) e += 1440;
    potongan = kurangi(potongan, [[s, e], [s + 1440, e + 1440]]);
    const dalam = (m1 - m0) - potongan.reduce((t, [x, y]) => t + y - x, 0);
    if (dalam > 0) peringatan.push(`Jam ${shift.masuk}–${shift.pulang} adalah jam kerja ${shift.nama || 'shift'}, tidak dihitung lembur.`);
  } else if (hari.jenis === 'KERJA') {
    // Non-shift: lembur hari kerja baru dihitung setelah jam pulang normal
    const pulang = keMenit(terpendek ? a.jamPulangTerpendek : a.jamPulang);
    if (m0 < pulang) {
      if (m1 > pulang) peringatan.push(`Lembur hari kerja dihitung mulai jam pulang ${keJam(pulang)}.`);
      potongan = [[Math.min(Math.max(m0, pulang), m1), m1]];
    }
  }
  potongan = potongan.filter(([x, y]) => y > x);
  const awal = potongan.length ? potongan[0][0] : m1;
  const kotor = potongan.reduce((t, [x, y]) => t + y - x, 0);
  const potong = potongan.reduce((t, [x, y]) => t + menitIstirahat(x, y, a.istirahat), 0);
  const bersih = Math.max(0, kotor - potong);
  const bulat = Math.max(1, Number(a.pembulatanMenit) || 1);
  const menitLembur = Math.floor(bersih / bulat) * bulat;
  const jam = menitLembur / 60;

  let tarif;
  if (hari.jenis === 'KERJA') tarif = [[1, 1.5], [Infinity, 2]];
  else if (a.polaKerja === 6) tarif = TARIF_LIBUR[(libur.has(tanggal) && terpendek) ? '6pendek' : 6];
  else tarif = TARIF_LIBUR[5];
  const { rincian, jamHitung } = bagiTarif(jam, tarif);

  if (hari.jenis === 'KERJA' && jam > 4) peringatan.push('Melebihi batas 4 jam lembur per hari kerja (PP 35/2021 Pasal 26).');
  if (hari.jenis === 'LIBUR') {
    const maks = tarif.reduce((s, [l]) => s + l, 0);
    if (jam > maks) peringatan.push(`Lebih dari ${maks} jam di hari libur; jam setelahnya tetap dihitung 4x.`);
  }
  const sejam = upahSejam(upahBulanan);
  return {
    metode: 'AKTUAL',
    jenisHari: hari.jenis,
    label: hari.label,
    keterangan: hari.keterangan,
    mulai, selesai,
    mulaiDihitung: keJam(awal),
    menitKotor: kotor,
    menitIstirahat: potong,
    menitLembur,
    jamLembur: jam,
    rincian,
    jamHitung,
    upahSejam: sejam,
    nominal: Math.round(jamHitung * sejam),
    lewatTengahMalam: m1 >= 1440,
    ...(shift ? { shift: { nama: shift.nama || null, masuk: shift.masuk, pulang: shift.pulang } } : {}),
    peringatan,
  };
}

/** 0 = Minggu ... 6 = Sabtu */
export function hariDalamMinggu(tanggal) {
  return new Date(`${tanggal}T00:00:00Z`).getUTCDay();
}

/**
 * @param {string} tanggal  YYYY-MM-DD
 * @param {Map<string,string>|Set<string>} libur  tanggal libur (Map: tanggal -> keterangan)
 */
export function jenisHari(tanggal, libur = new Map(), aturan = null) {
  if (libur.has(tanggal)) {
    const ket = libur instanceof Map ? libur.get(tanggal) : '';
    return { jenis: 'LIBUR', label: 'Hari libur', keterangan: ket || '', jam: ATURAN.jamHariLibur };
  }
  const d = hariDalamMinggu(tanggal);
  // Pola 6 hari kerja: hanya Minggu hari istirahat mingguan
  const liburMingguan = aturan?.polaKerja === 6 ? d === 0 : d === 0 || d === 6;
  if (liburMingguan) {
    return { jenis: 'LIBUR', label: d === 6 ? 'Sabtu' : 'Minggu', keterangan: '', jam: ATURAN.jamHariLibur };
  }
  return { jenis: 'KERJA', label: 'Hari kerja', keterangan: '', jam: ATURAN.jamHariKerja };
}

export function upahSejam(upahBulanan) {
  return Math.round(upahBulanan / ATURAN.pembagi);
}

