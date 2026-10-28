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
