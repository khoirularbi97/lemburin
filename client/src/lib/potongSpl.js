// Siapkan foto SPL untuk dibaca Azure: luruskan, temukan tabel, lalu buat satu
// gambar gabungan berisi strip "Hari/Tanggal" + kolom NAMA s/d ALASAN saja.
// Kop perusahaan, kolom No, kolom TANDA TANGAN, dan kolom pengesahan di bawah
// TIDAK ikut dikirim.
import { analisisSpl } from './gridSpl.js';

const LEBAR_ANALISIS = 1000;
const MAKS_SISI_KIRIM = 2000;

function muat(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('File ini bukan gambar yang bisa dibaca.')); };
    img.src = url;
  });
}

function kanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** Gambar abu-abu kecil untuk deteksi tabel. */
function abuKecil(img) {
  const k = LEBAR_ANALISIS / img.naturalWidth;
  const c = kanvas(LEBAR_ANALISIS, img.naturalHeight * k);
  const x = c.getContext('2d', { willReadFrequently: true });
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  x.drawImage(img, 0, 0, c.width, c.height);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  const data = new Uint8Array(c.width * c.height);
  for (let i = 0, j = 0; i < d.length; i += 4, j += 1) data[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  return { width: c.width, height: c.height, data };
}

/** Foto ukuran asli yang sudah diluruskan (putaran sama dengan gridSpl.putar). */
function luruskan(img, derajat) {
  const c = kanvas(img.naturalWidth, img.naturalHeight);
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  x.translate(c.width / 2, c.height / 2);
  x.rotate((derajat * Math.PI) / 180);
  x.drawImage(img, -c.width / 2, -c.height / 2);
  return c;
}

function keAbu(c) {
  const x = c.getContext('2d', { willReadFrequently: true });
  const d = x.getImageData(0, 0, c.width, c.height);
  const p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const g = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
    p[i] = g; p[i + 1] = g; p[i + 2] = g;
  }
  x.putImageData(d, 0, 0);
}

/**
 * @param {File} file
 * @returns {Promise<{gagal:true, img:HTMLImageElement} | {
 *   img, gambar:string, tabel:object, stripBawah:number, keKecil:(x:number,y:number)=>{x:number,y:number},
 *   potongNama:(i:number)=>string }>}
 */
export async function siapkanSpl(file) {
  const img = await muat(file);
  const hasil = analisisSpl(abuKecil(img));
  if (hasil.gagal) return { gagal: true, img };

  const k = img.naturalWidth / LEBAR_ANALISIS;
  const lurus = luruskan(img, hasil.sudut);
  const { kolomPada, atas, bawahHeader, bawah, kiri, tinggiBaris } = hasil;

  // Batas kiri kolom NAMA dan kanan kolom ALASAN di atas & bawah tabel (bisa sedikit miring)
  const kA = kolomPada(bawahHeader); const kB = kolomPada(bawah);
  const x0 = Math.min(kA.nama[0], kB.nama[0]); const x1 = Math.max(kA.alasan[1], kB.alasan[1]);
  const tabelRect = { x: x0, y: bawahHeader, w: x1 - x0, h: bawah - bawahHeader };
  // Strip Hari/Tanggal tepat di atas tabel, hanya selebar kolom No–Bagian (tanpa kop)
  const stripRect = { x: kiri, y: Math.max(0, atas - tinggiBaris * 2.8), w: kA.bagian[1] - kiri, h: Math.min(atas, tinggiBaris * 2.8) - 2 };

  const lebarGab = Math.max(tabelRect.w, stripRect.w);
  const jeda = 12;
  const tinggiGab = stripRect.h + jeda + tabelRect.h;
  const s = Math.min(1, MAKS_SISI_KIRIM / (Math.max(lebarGab, tinggiGab) * k)) * k; // piksel kecil → piksel kirim
  const gab = kanvas(lebarGab * s, tinggiGab * s);
  const g = gab.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, gab.width, gab.height);
  g.drawImage(lurus, stripRect.x * k, stripRect.y * k, stripRect.w * k, stripRect.h * k, 0, 0, stripRect.w * s, stripRect.h * s);
  const oy = (stripRect.h + jeda) * s;
  g.drawImage(lurus, tabelRect.x * k, tabelRect.y * k, tabelRect.w * k, tabelRect.h * k, 0, oy, tabelRect.w * s, tabelRect.h * s);
  // Tutup sisa kolom No/TTD yang ikut terpotong karena kemiringan
  g.fillStyle = '#fff';
  for (let yy = bawahHeader; yy < bawah; yy += 2) {
    const kol = kolomPada(yy);
    const ty = oy + (yy - bawahHeader) * s;
    const kiriTutup = (kol.nama[0] - x0) * s;
    if (kiriTutup > 0) g.fillRect(0, ty, kiriTutup, 2 * s + 1);
    const kananTutup = (kol.alasan[1] - x0) * s;
    if (kananTutup < gab.width) g.fillRect(kananTutup, ty, gab.width - kananTutup, 2 * s + 1);
  }
  keAbu(gab);

  return {
    img,
    tabel: hasil,
    gambar: gab.toDataURL('image/jpeg', 0.85),
    stripBawah: stripRect.h * s,
    /** Koordinat gambar kiriman → koordinat tabel kecil (skala deteksi). */
    keKecil: (px, py) => ({ x: px / s + tabelRect.x, y: (py - oy) / s + tabelRect.y }),
    /** Potongan sel NAMA baris ke-i (0 = baris no. 1) untuk preview. */
    potongNama(i) {
      const y0 = hasil.baris[i]; const y1 = hasil.baris[i + 1];
      const kol = kolomPada((y0 + y1) / 2);
      const t = 46;
      const c = kanvas(((kol.nama[1] - kol.nama[0]) / (y1 - y0)) * t, t);
      c.getContext('2d').drawImage(lurus, kol.nama[0] * k, y0 * k, (kol.nama[1] - kol.nama[0]) * k, (y1 - y0) * k, 0, 0, c.width, c.height);
      return c.toDataURL('image/webp', 0.7);
    },
  };
}
