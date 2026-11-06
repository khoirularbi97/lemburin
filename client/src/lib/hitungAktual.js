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
export const ATURAN_AKTUAL_BAWAAN = Object.freeze({
  polaKerja: 5, // 5 = Senin–Jumat, 6 = Senin–Sabtu
  hariTerpendek: 6, // untuk pola 6: hari kerja terpendek (0=Minggu..6=Sabtu), biasanya Sabtu
  jamPulang: '16:30', // jam pulang normal hari kerja; lembur hari kerja dihitung mulai jam ini
  jamPulangTerpendek: '13:30', // jam pulang di hari kerja terpendek (pola 6)
  istirahat: [{ mulai: '12:00', selesai: '13:00' }], // jam istirahat yang tidak dihitung lembur
  pembulatanMenit: 30, // menit lembur dibulatkan ke bawah ke kelipatan ini (1 = per menit)
});

const TARIF_LIBUR = {
  5: [[8, 2], [1, 3], [3, 4]],
  6: [[7, 2], [1, 3], [3, 4]],
  '6pendek': [[5, 2], [1, 3], [3, 4]],
};

const keMenit = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const keJam = (menit) => { const m = ((menit % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
export const polaJam = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/** Menit tumpang-tindih rentang [a,b) dengan jam istirahat (berulang tiap hari, aman untuk lembur lewat tengah malam). */
function menitIstirahat(a, b, istirahat) {
  let total = 0;
  for (const r of istirahat || []) {
    if (!polaJam(r.mulai) || !polaJam(r.selesai)) continue;
    let s = keMenit(r.mulai); let e = keMenit(r.selesai);
    if (e <= s) e += 1440;
    for (const geser of [0, 1440]) total += Math.max(0, Math.min(b, e + geser) - Math.max(a, s + geser));
  }
  return total;
}

/** Bagi jam lembur ke tingkat tarif. Mengembalikan [{jam, kali}] dan jam hitung. */
export function bagiTarif(jam, tarif) {
  const rincian = []; let sisa = jam; let jamHitung = 0;
  tarif.forEach(([lebar, kali], i) => {
    const akhir = i === tarif.length - 1;
    const pakai = akhir ? sisa : Math.min(sisa, lebar);
    if (pakai > 0) { rincian.push({ jam: pakai, kali }); jamHitung += pakai * kali; sisa -= pakai; }
  });
  return { rincian, jamHitung: Math.round(jamHitung * 100) / 100 };
}

/**
 * Hitung lembur dari jam mulai & selesai sesuai PP 35/2021.
 * @param {object} o
 * @param {number} o.upahBulanan
 * @param {string} o.tanggal YYYY-MM-DD (tanggal mulai lembur)
 * @param {Map<string,string>} [o.libur]
 * @param {string} o.mulai HH:mm
 * @param {string} o.selesai HH:mm (lebih kecil dari mulai = lewat tengah malam)
 * @param {object} [o.aturan] lihat ATURAN_AKTUAL_BAWAAN
 */
export function hitungLemburAktual({ upahBulanan, tanggal, libur = new Map(), mulai, selesai, aturan = ATURAN_AKTUAL_BAWAAN }) {
  const a = { ...ATURAN_AKTUAL_BAWAAN, ...aturan };
  if (!polaJam(mulai) || !polaJam(selesai)) throw new Error('Jam mulai/selesai harus HH:mm');
  const hari = jenisHari(tanggal, libur, a);
  const d = hariDalamMinggu(tanggal);
  const terpendek = a.polaKerja === 6 && d === a.hariTerpendek;
  let m0 = keMenit(mulai); let m1 = keMenit(selesai);
  if (m1 <= m0) m1 += 1440; // lewat tengah malam
  const peringatan = [];
  // Hari kerja: lembur baru dihitung setelah jam pulang normal
  if (hari.jenis === 'KERJA') {
    const pulang = keMenit(terpendek ? a.jamPulangTerpendek : a.jamPulang);
    if (m0 < pulang) {
      if (m1 > pulang) peringatan.push(`Lembur hari kerja dihitung mulai jam pulang ${keJam(pulang)}.`);
      m0 = Math.min(Math.max(m0, pulang), m1);
    }
  }
  const kotor = m1 - m0;
  const potong = menitIstirahat(m0, m1, a.istirahat);
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
    mulaiDihitung: keJam(m0),
    menitKotor: kotor,
    menitIstirahat: potong,
    menitLembur,
    jamLembur: jam,
    rincian,
    jamHitung,
    upahSejam: sejam,
    nominal: Math.round(jamHitung * sejam),
    lewatTengahMalam: keMenit(selesai) <= keMenit(mulai),
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

