// OCR foto SPL dengan tesseract.js. Semua file (worker, inti WASM, data bahasa)
// disajikan dari /ocr di aplikasi sendiri, jadi tidak bergantung CDN dan jalan
// juga di aplikasi Android/iOS/desktop. Gambar tidak dikirim ke layanan luar.

const MAKS_SISI_OCR = 2200; // px; lebih besar = lebih lambat, tidak lebih akurat
// Foto bukti yang diunggah: hitam-putih, sisi terpanjang 1400 px, WebP kualitas 0,6
// (±60–150 KB, tulisan tetap jelas). Browser tanpa WebP (Safari lama) memakai JPEG.
const MAKS_SISI_SIMPAN = 1400;
const KUALITAS_SIMPAN = 0.6;

function muatGambar(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('File ini bukan gambar yang bisa dibaca.')); };
    img.src = url;
  });
}

function kanvas(img, maks) {
  const skala = Math.min(1, maks / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * skala);
  c.height = Math.round(img.naturalHeight * skala);
  const x = c.getContext('2d', { willReadFrequently: true });
  x.fillStyle = '#fff';
  x.fillRect(0, 0, c.width, c.height);
  x.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

/** Foto bukti kecil: grayscale + WebP (cadangan JPEG). */
export function kompresBukti(img) {
  const c = kanvas(img, MAKS_SISI_SIMPAN);
  const x = c.getContext('2d', { willReadFrequently: true });
  const d = x.getImageData(0, 0, c.width, c.height);
  const p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const g = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
    p[i] = g; p[i + 1] = g; p[i + 2] = g;
  }
  x.putImageData(d, 0, 0);
  const webp = c.toDataURL('image/webp', KUALITAS_SIMPAN);
  // Safari lama mengembalikan PNG kalau WebP tidak didukung: pakai JPEG supaya tetap kecil
  return webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/jpeg', 0.62);
}

/** Abu-abu + naikkan kontras: membantu OCR pada foto kertas yang agak gelap/kekuningan. */
function siapkanUntukOcr(c) {
  const x = c.getContext('2d', { willReadFrequently: true });
  const d = x.getImageData(0, 0, c.width, c.height);
  const p = d.data;
  let min = 255; let max = 0;
  for (let i = 0; i < p.length; i += 16) {
    const g = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const rentang = Math.max(40, max - min);
  for (let i = 0; i < p.length; i += 4) {
    const g = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
    const v = Math.max(0, Math.min(255, ((g - min) / rentang) * 255));
    p[i] = v; p[i + 1] = v; p[i + 2] = v;
  }
  x.putImageData(d, 0, 0);
  return c;
}

let workerJanji = null;
let penerimaProgres = null;
let galatWorker = null;
const BATAS_WAKTU = 120000;

async function worker() {
  if (!workerJanji) {
    workerJanji = (async () => {
      const { createWorker } = await import('tesseract.js');
      const dasar = new URL('/ocr/', window.location.href).href;
      return createWorker('ind+eng', 1, {
        workerPath: `${dasar}worker.min.js`,
        corePath: dasar,
        langPath: `${dasar}lang`,
        gzip: true,
        cacheMethod: 'none',
        logger: (m) => penerimaProgres?.(m),
        errorHandler: (e) => { galatWorker?.(e); },
      });
    })().catch((e) => { workerJanji = null; throw e; });
  }
  return workerJanji;
}

/**
 * Baca foto SPL.
 * @param {File} file foto dari kamera/galeri
 * @param {(persen:number, tahap:string)=>void} [onProgres]
 * @returns {Promise<{teks:string, fotoDataUrl:string, pratinjau:string}>}
 */
export async function bacaFotoSpl(file, onProgres) {
  const img = await muatGambar(file);
  const fotoDataUrl = kompresBukti(img);
  const untukOcr = siapkanUntukOcr(kanvas(img, MAKS_SISI_OCR));

  penerimaProgres = (m) => {
    if (!onProgres) return;
    if (m.status === 'recognizing text') onProgres(Math.round(30 + m.progress * 70), 'Membaca tulisan…');
    else if (/load|initializ/i.test(m.status)) onProgres(Math.round(m.progress * 30), 'Menyiapkan pembaca (sekali saja)…');
  };
  try {
    // Gagal memuat file OCR kadang tidak melempar error: beri batas waktu
    const gagal = new Promise((_, tolak) => {
      galatWorker = () => tolak(new Error('Pembaca foto gagal dimuat. Periksa koneksi lalu coba lagi.'));
      setTimeout(() => tolak(new Error('Membaca foto terlalu lama. Coba foto yang lebih kecil/terang.')), BATAS_WAKTU);
    });
    const w = await Promise.race([worker(), gagal]);
    const { data } = await Promise.race([w.recognize(untukOcr), gagal]);
    onProgres?.(100, 'Selesai');
    return { teks: data.text || '', fotoDataUrl, pratinjau: fotoDataUrl };
  } catch (e) {
    await tutupOcr();
    throw e;
  } finally {
    penerimaProgres = null;
    galatWorker = null;
  }
}

/** Lepas memori pembaca (dipanggil saat halaman ditutup). */
export async function tutupOcr() {
  if (!workerJanji) return;
  const w = await workerJanji.catch(() => null);
  workerJanji = null;
  await w?.terminate();
}
