// Membaca teks hasil OCR foto Surat Perintah Lembur (SPL):
// nomor SPL, tanggal, jam selesai, keterangan pekerjaan, dan karyawan yang tercantum.
// Murni (tanpa DOM) supaya bisa diuji di Node.

const BULAN = {
  jan: 1, januari: 1, feb: 2, februari: 2, peb: 2, pebruari: 2, mar: 3, maret: 3, apr: 4, april: 4,
  mei: 5, may: 5, jun: 6, juni: 6, jul: 7, juli: 7, agu: 8, agt: 8, agus: 8, agustus: 8, aug: 8,
  sep: 9, sept: 9, september: 9, okt: 10, oktober: 10, oct: 10, nov: 11, nop: 11, november: 11, nopember: 11,
  des: 12, desember: 12, dec: 12,
};
const ROMAWI = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12 };

const pad = (n) => String(n).padStart(2, '0');

function tanggalValid(y, m, d) {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Semua tanggal dalam satu baris teks. */
function tanggalDiBaris(baris) {
  const hasil = [];
  // 03-11-2026, 3/11/26, 03.11.2026
  for (const m of baris.matchAll(/\b(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{2,4})\b/g)) {
    const t = tanggalValid(Number(m[3]), Number(m[2]), Number(m[1]));
    if (t) hasil.push(t);
  }
  // 3 November 2026, 03 Nop 2026
  for (const m of baris.matchAll(/\b(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})\b/g)) {
    const bln = BULAN[m[2].toLowerCase()];
    if (!bln) continue;
    const t = tanggalValid(Number(m[3]), bln, Number(m[1]));
    if (t) hasil.push(t);
  }
  return hasil;
}

/** Tanggal lembur: utamakan baris berlabel "tanggal"/"hari", lalu tanggal mana saja. */
export function cariTanggal(teks) {
  const baris = teks.split(/\r?\n/);
  for (const b of baris) {
    if (/tanggal|tgl|hari/i.test(b) && !/cetak|dibuat|diterima/i.test(b)) {
      const t = tanggalDiBaris(b);
      if (t.length) return t[0];
    }
  }
  for (const b of baris) {
    const t = tanggalDiBaris(b);
    if (t.length) return t[0];
  }
  return null;
}

/** Jam selesai lembur: jam terakhir di baris "jam"/"pukul"/"s/d". Format HH:mm. */
export function cariJamSelesai(teks) {
  const baris = teks.split(/\r?\n/).filter((b) => /jam|pukul|s\s*\/\s*d|sampai|selesai|-\s*\d/i.test(b));
  for (const b of baris) {
    const jam = [...b.matchAll(/\b([01]?\d|2[0-3])\s*[.:]\s*([0-5]\d)\b/g)].map((m) => `${pad(Number(m[1]))}:${m[2]}`);
    if (jam.length) return jam[jam.length - 1];
  }
  return null;
}

/** Nomor SPL, mis. "No: SPL/045/QC/XI/2026". */
export function cariNomor(teks) {
  for (const b of teks.split(/\r?\n/).slice(0, 12)) {
    const m = /\bno(?:mor)?\.?\s*(?:spl)?\s*[:.]?\s*([A-Za-z0-9][A-Za-z0-9/.\-]{3,40})/i.exec(b);
    if (m && /[/\-]/.test(m[1]) && /\d/.test(m[1])) {
      // OCR sering membaca angka romawi XI sebagai X1 / Xl
      return m[1].replace(/\/X[1l]\//g, '/XI/').replace(/\/[1l]X\//g, '/IX/').replace(/[.]$/, '');
    }
  }
  return null;
}

/** Keterangan pekerjaan dari baris "Pekerjaan"/"Keperluan"/"Keterangan". */
export function cariKeterangan(teks) {
  for (const b of teks.split(/\r?\n/)) {
    const m = /(pekerjaan|keperluan|keterangan|uraian|tugas)\s*[:.]\s*(.{3,})$/i.exec(b);
    if (m) return m[2].trim().slice(0, 200);
  }
  return null;
}

// ---------- pencocokan karyawan ----------

const normal = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

function jarak(a, b) {
  if (a === b) return 0;
  const m = a.length; const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i += 1) {
    const cur = [i];
    for (let j = 1; j <= n; j += 1) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

const mirip = (a, b) => 1 - jarak(a, b) / Math.max(a.length, b.length, 1);

/** Angka NIK, toleran salah baca OCR (O→0, I/l→1, S→5, B→8). */
function angkaNik(s) {
  return s.toUpperCase().replace(/O/g, '0').replace(/[IL|]/g, '1').replace(/S/g, '5').replace(/B/g, '8').replace(/\D/g, '');
}

/** Kemiripan terbaik nama karyawan dengan potongan kata di satu baris. */
function skorNama(nama, baris) {
  const target = normal(nama);
  const nKata = target.split(' ').length;
  const kata = normal(baris).split(' ').filter(Boolean);
  let terbaik = 0;
  for (let len = Math.max(1, nKata - 1); len <= nKata + 1; len += 1) {
    for (let i = 0; i + len <= kata.length; i += 1) {
      terbaik = Math.max(terbaik, mirip(target, kata.slice(i, i + len).join(' ')));
    }
  }
  return terbaik;
}

/**
 * Cocokkan karyawan dengan teks SPL.
 * @param {string} teks hasil OCR
 * @param {Array<{id:number,nik:string,nama:string}>} karyawan
 * @returns {Array<{id:number, skor:number, alasan:string, baris:string}>} urut skor tertinggi
 */
export function cocokkanKaryawan(teks, karyawan) {
  const baris = teks.split(/\r?\n/).map((b) => b.trim()).filter((b) => b.length >= 3);
  const hasil = [];
  for (const k of karyawan) {
    const nikAngka = angkaNik(k.nik);
    let best = { skor: 0, alasan: '', baris: '' };
    for (const b of baris) {
      // NIK: angka NIK muncul utuh di baris (dengan batas bukan-angka)
      if (nikAngka.length >= 3) {
        const angka = angkaNik(b.replace(/[A-Za-z]{3,}/g, (w) => (/^[OILSB]+$/i.test(w) ? w : ' ')));
        const potong = b.split(/[^A-Za-z0-9-]+/).map(angkaNik);
        if (potong.includes(nikAngka) || (angka.includes(nikAngka) && new RegExp(`(^|\\D)${nikAngka}(\\D|$)`).test(b.toUpperCase().replace(/O/g, '0')))) {
          const sn = skorNama(k.nama, b);
          const skor = sn >= 0.6 ? 1 : 0.92;
          if (skor > best.skor) best = { skor, alasan: sn >= 0.6 ? 'NIK & nama cocok' : 'NIK cocok', baris: b };
          continue;
        }
      }
      const sn = skorNama(k.nama, b);
      if (sn > best.skor) best = { skor: sn, alasan: `Nama mirip ${Math.round(sn * 100)}%`, baris: b };
    }
    if (best.skor >= 0.72) hasil.push({ id: k.id, ...best });
  }
  return hasil.sort((a, b) => b.skor - a.skor);
}

/** Semua hasil baca sekaligus. */
export function bacaSpl(teks, karyawan) {
  return {
    nomor: cariNomor(teks),
    tanggal: cariTanggal(teks),
    jam: cariJamSelesai(teks),
    keterangan: cariKeterangan(teks),
    cocok: cocokkanKaryawan(teks, karyawan),
  };
}

export const _uji = { tanggalDiBaris, angkaNik, skorNama, ROMAWI };
