// Ubah hasil baca Azure (kata + kotak posisi) atau Gemini (isi per baris) menjadi baris SPL:
// nama, bagian, jam mulai/selesai, alasan — termasuk tanda "sama dengan atas".
// Lalu cocokkan nama ke daftar karyawan. Murni, bisa diuji di Node.
import { cariTanggal } from './bacaSpl.js';

const KOLOM_ISI = ['nama', 'bagian', 'mulai', 'selesai', 'alasan'];

const pusat = (kotak) => ({
  x: kotak.reduce((s, p) => s + p.x, 0) / kotak.length,
  y: kotak.reduce((s, p) => s + p.y, 0) / kotak.length,
});

/** Jam dari teks tulisan tangan: "18.30", "18:30", "18,30.", "1830" → "18:30". */
export function bacaJam(teks) {
  const t = String(teks || '').replace(/[oO]/g, '0').replace(/[lI|]/g, '1');
  const m = /(\d{1,2})\s*[.:,;]\s*(\d{2})/.exec(t) || /\b(\d{2})(\d{2})\b/.exec(t);
  if (!m) return null;
  const j = Number(m[1]); const mnt = Number(m[2]);
  if (j > 23 || mnt > 59) return null;
  return `${String(j).padStart(2, '0')}:${String(mnt).padStart(2, '0')}`;
}

/** Teks yang berarti "sama dengan atas": kosong, garis, tanda kutip, coretan pendek. */
export function tandaSama(teks) {
  const t = String(teks || '').trim();
  if (!t) return true;
  if (/^(sda|s\.d\.a|idem|dto|ditto)\.?$/i.test(t)) return true;
  // hanya tanda baca/coretan tanpa huruf/angka berarti, atau sangat pendek
  const huruf = t.replace(/[^A-Za-z0-9]/g, '');
  return huruf.length <= 1;
}

/**
 * Petakan kata-kata ke sel tabel.
 * @param {Array<{teks:string,kotak:{x:number,y:number}[]}>} kata  dalam koordinat gambar tabel kecil (skala deteksi)
 * @param {{baris:number[], kolomPada:(y:number)=>Record<string,[number,number]>}} tabel
 * @returns {Array<Record<string,string>>} isi per baris data (index 0 = baris no. 1)
 */
export function kataKeSel(kata, tabel) {
  const n = tabel.baris.length - 1;
  const sel = Array.from({ length: n }, () => Object.fromEntries(KOLOM_ISI.map((k) => [k, []])));
  for (const w of kata) {
    const c = pusat(w.kotak);
    let i = -1;
    for (let r = 0; r < n; r += 1) if (c.y >= tabel.baris[r] && c.y < tabel.baris[r + 1]) { i = r; break; }
    if (i < 0) continue;
    const kol = tabel.kolomPada(c.y);
    const nama = KOLOM_ISI.find((k) => c.x >= kol[k][0] && c.x < kol[k][1]);
    if (nama) sel[i][nama].push({ x: c.x, teks: w.teks });
  }
  return sel.map((s) => Object.fromEntries(KOLOM_ISI.map((k) => [k, s[k].sort((a, b) => a.x - b.x).map((w) => w.teks).join(' ').trim()])));
}

/**
 * Isi baris: baris tanpa nama dilewati; jam/bagian/alasan yang kosong atau berupa
 * tanda "sama dengan atas" diisi dari baris di atasnya.
 */
export function susunBaris(sel) {
  const hasil = [];
  let atas = { bagian: '', mulai: null, selesai: null, alasan: '' };
  sel.forEach((s, i) => {
    const nama = s.nama.replace(/^[\d.\s]+/, '').trim(); // nomor urut yang ikut terbaca
    if (nama.replace(/[^A-Za-z]/g, '').length < 2) return;
    const bagian = tandaSama(s.bagian) ? atas.bagian : s.bagian;
    const mulai = bacaJam(s.mulai) || atas.mulai;
    const selesai = bacaJam(s.selesai) || atas.selesai;
    const alasan = tandaSama(s.alasan) ? atas.alasan : s.alasan;
    const r = { no: i + 1, namaTerbaca: nama, bagian, mulai, selesai, alasan, ikutAtas: {
      jam: !bacaJam(s.selesai) && Boolean(atas.selesai), alasan: tandaSama(s.alasan) && Boolean(atas.alasan),
    } };
    hasil.push(r);
    atas = { bagian, mulai, selesai, alasan };
  });
  return hasil;
}

// ---------- pencocokan nama ----------

const SAPAAN = /^(bp|bpk|bapak|pak|ibu|bu|sdr|sdri|mas|mbak)\.?\s+/i;

export function normalNama(s) {
  return String(s || '').toLowerCase().normalize('NFKD')
    .replace(/[0-9]/g, (d) => ({ 0: 'o', 1: 'l', 5: 's', 8: 'b' }[d] || ''))
    .replace(/[^a-z\s.]/g, ' ').replace(SAPAAN, '').replace(/\./g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function jarak(a, b) {
  const m = a.length; const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i += 1) {
    const cur = [i];
    for (let j = 1; j <= n; j += 1) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
const mirip = (a, b) => 1 - jarak(a, b) / Math.max(a.length, b.length, 1);

/** Kemiripan satu kata SPL dengan satu kata nama karyawan (paham inisial & singkatan). */
function miripKata(o, e) {
  if (o === e) return 1;
  if (o.length === 1) return e[0] === o ? 0.9 : 0;
  // Singkatan "Moh" → "Mohamad"; tetap kalah dari kata yang persis sama ("Dani" vs "Daniel")
  if (o.length >= 3 && e.startsWith(o)) return Math.max(mirip(o, e), 0.8);
  return mirip(o, e);
}

/**
 * Skor 0..1 seberapa cocok tulisan SPL dengan nama karyawan.
 * "Alfian Yusuf S" ~ "Alfian Yusuf Saputra", "Bp. Hero Maryanto" ~ "Hero Maryanto", "A. Dani" ~ "Ahmad Dani".
 */
export function skorNama(terbaca, namaKaryawan) {
  const O = normalNama(terbaca).split(' ').filter(Boolean);
  const E = normalNama(namaKaryawan).split(' ').filter(Boolean);
  if (!O.length || !E.length) return 0;
  // Pasangkan tiap kata SPL ke kata karyawan berurutan (nama ditulis berurutan)
  let total = 0; let bobot = 0; let j = 0; let terpakai = 0;
  for (const o of O) {
    let terbaik = 0; let jTerbaik = -1;
    for (let k = j; k < E.length; k += 1) {
      const v = miripKata(o, E[k]) - (k - j) * 0.05; // lompat kata sedikit dihukum
      if (v > terbaik) { terbaik = v; jTerbaik = k; }
    }
    const b = o.length === 1 ? 0.5 : Math.min(o.length, 8);
    total += Math.max(0, terbaik) * b; bobot += b;
    if (jTerbaik >= 0 && terbaik > 0.5) { j = jTerbaik + 1; terpakai += 1; }
  }
  const skorKata = total / bobot;
  // Kata nama karyawan yang tidak muncul sama sekali sedikit menurunkan skor
  const cakupan = terpakai / E.length;
  const skorUtuh = mirip(O.join(' '), E.join(' '));
  return Math.max(skorUtuh, skorKata * (0.85 + 0.15 * cakupan));
}

/**
 * Saran karyawan untuk satu tulisan nama.
 * @returns {{saran:Array<{id:number,nama:string,skor:number}>, yakin:boolean}}
 */
export function saranKaryawan(terbaca, karyawan, n = 3) {
  const saran = karyawan
    .map((k) => ({ id: k.id, nama: k.nama, skor: skorNama(terbaca, k.nama) }))
    .sort((a, b) => b.skor - a.skor)
    .slice(0, n);
  const [a, b] = saran;
  // Yakin kalau skornya tinggi dan jelas lebih unggul dari saran kedua
  const yakin = Boolean(a && a.skor >= 0.8 && (!b || a.skor - b.skor >= 0.12));
  return { saran, yakin };
}

/**
 * Proses lengkap dari hasil Azure.
 * @param {{kata?:Array, tabel?:object, teksStrip?:string, sel?:Array<Record<string,string>>}} o
 * @param {Array<{id:number,nama:string}>} karyawan
 */
export function petakanSpl({ kata, tabel, teksStrip = '', sel }, karyawan) {
  // sel = isi per baris yang sudah jadi (Gemini); kata = kata + kotak posisi (Azure)
  const baris = susunBaris(sel || kataKeSel(kata, tabel));
  // Satu karyawan hanya boleh terpilih sekali: kalau dua baris yakin ke orang sama, yang skornya lebih rendah jadi ragu
  const dipakai = new Map();
  const hasil = baris.map((r) => {
    const s = saranKaryawan(r.namaTerbaca, karyawan);
    return { ...r, ...s, pilihan: s.yakin ? s.saran[0].id : null };
  });
  hasil.forEach((r, i) => {
    if (!r.pilihan) return;
    const lain = dipakai.get(r.pilihan);
    if (lain === undefined) { dipakai.set(r.pilihan, i); return; }
    const kalah = hasil[lain].saran[0].skor >= r.saran[0].skor ? r : hasil[lain];
    kalah.pilihan = null; kalah.yakin = false;
    if (kalah !== r) dipakai.set(r.pilihan, i);
  });
  // Jam selesai yang paling sering = jam umum
  const hitung = {};
  hasil.forEach((r) => { if (r.selesai) hitung[r.selesai] = (hitung[r.selesai] || 0) + 1; });
  const jamUmum = Object.entries(hitung).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  return { baris: hasil, tanggal: cariTanggal(teksStrip), jamUmum, alasanUmum: hasil[0]?.alasan || '' };
}
