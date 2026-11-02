export const rp = (n) => `Rp${Math.round(n || 0).toLocaleString('id-ID')}`;
export const angka = (n) => Math.round(n || 0).toLocaleString('id-ID');
export const jamFmt = (n) => Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: 1 });

const tgl = (s) => new Date(`${s}T12:00:00Z`);
export const tanggalPanjang = (s) => tgl(s).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
export const tanggalPendek = (s) => tgl(s).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
export const namaBulan = (ym) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' });
export const bulanPendek = (s) => tgl(s).toLocaleDateString('id-ID', { month: 'short', timeZone: 'UTC' }).toUpperCase();

export function hariIniWIB() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
}

export function inisial(nama = '') {
  return nama.split(/[\s.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

const WARNA = ['t-teal', 't-indigo', 't-rose', 't-ink', 't-amber'];
export function warnaAvatar(kunci = '') {
  let h = 0;
  for (const c of String(kunci)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return WARNA[h % WARNA.length];
}

// ---------- Periode lembur (21 s/d 20 bulan berikutnya) ----------
// Samakan dengan ATURAN.tanggalTutup di server/src/lib/lembur.js
export const TANGGAL_TUTUP = 20;
const ymdUtc = (d) => d.toISOString().slice(0, 10);

/** Kode periode YYYY-MM untuk tanggal. "2026-11" = 21 Okt – 20 Nov 2026. */
export function periodeDari(tanggal) {
  const [y, m, d] = tanggal.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + (d > TANGGAL_TUTUP ? 1 : 0), 1)).toISOString().slice(0, 7);
}
export function batasPeriode(kode) {
  const [y, m] = kode.split('-').map(Number);
  return { mulai: ymdUtc(new Date(Date.UTC(y, m - 2, TANGGAL_TUTUP + 1))), selesai: ymdUtc(new Date(Date.UTC(y, m - 1, TANGGAL_TUTUP))) };
}
/** "21 Okt – 20 Nov 2026" */
export function labelRentang(kode) {
  const { mulai, selesai } = batasPeriode(kode);
  const f = (s, tahun) => tgl(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', ...(tahun ? { year: 'numeric' } : {}), timeZone: 'UTC' });
  return `${f(mulai, mulai.slice(0, 4) !== selesai.slice(0, 4))} – ${f(selesai, true)}`;
}
/** "Periode November 2026" */
export const namaPeriode = (kode) => `Periode ${namaBulan(kode)}`;
/** Batas tap manual & pengajuan: awal periode lalu sampai hari ini (sama dengan server). */
export function batasManual() {
  const max = hariIniWIB();
  const [y, m] = periodeDari(max).split('-').map(Number);
  const lalu = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  return { min: batasPeriode(lalu).mulai, max };
}
