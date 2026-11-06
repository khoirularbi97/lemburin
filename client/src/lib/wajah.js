// Verifikasi wajah di HP karyawan dengan face-api (berjalan sepenuhnya di perangkat).
// Hasilnya 128 angka (vektor wajah) yang dikirim ke server untuk dibandingkan dengan wajah
// acuan. Foto hanya dikirim saat pendaftaran, untuk diperiksa admin.
//
// Pemeriksaan "wajah hidup": karyawan diminta menoleh ke kiri dan kanan, supaya foto/layar
// yang disodorkan ke kamera tidak lolos semudah itu.

let siap = null;

/** Muat face-api + model (±7 MB sekali, lalu tersimpan di cache browser). */
export function muatPengenal() {
  if (!siap) {
    siap = (async () => {
      const faceapi = await import('@vladmandic/face-api');
      try { await faceapi.tf.setBackend('webgl'); } catch { await faceapi.tf.setBackend('cpu'); }
      await faceapi.tf.ready();
      const url = `${import.meta.env.BASE_URL || '/'}wajah`;
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(url),
        faceapi.nets.faceLandmark68Net.loadFromUri(url),
        faceapi.nets.faceRecognitionNet.loadFromUri(url),
      ]);
      return faceapi;
    })().catch((e) => { siap = null; throw e; });
  }
  return siap;
}

/**
 * Posisi hidung di antara kedua sisi rahang: ±0,5 = menghadap lurus,
 * lebih kecil/besar = menoleh. Murni, bisa diuji tanpa kamera.
 * @param {{x:number,y:number}[]} titik 68 titik wajah
 */
export function rasioToleh(titik) {
  const kiri = titik[0].x; const kanan = titik[16].x; const hidung = titik[30].x;
  const lebar = kanan - kiri;
  return lebar > 0 ? (hidung - kiri) / lebar : 0.5;
}

export const LURUS = [0.4, 0.6];
export const TOLEH = 0.36; // < TOLEH atau > 1 - TOLEH dianggap menoleh

/**
 * Mesin langkah pemeriksaan wajah. Murni: diberi hasil deteksi per frame, mengembalikan langkah berikutnya.
 * langkah: 'cari' → 'lurus' (kumpulkan vektor) → 'toleh' (kiri & kanan) → 'akhir' (lurus lagi) → 'selesai'
 */
export function buatPemeriksa({ jumlahLurus = 3 } = {}) {
  const st = { langkah: 'cari', vektor: [], kiri: false, kanan: false, terakhirTerlihat: 0, mulaiToleh: 0, hilang: 0 };
  const ulang = () => Object.assign(st, { langkah: 'cari', vektor: [], kiri: false, kanan: false, ulang: true, hilang: 0 });
  return {
    st,
    /** @param {null | {rasio:number, besar:number, vektor?:Float32Array|number[]}} f  @param {number} t ms */
    terima(f, t) {
      if (st.langkah === 'selesai') return st;
      if (!f) {
        // Wajah hilang beberapa frame berturut-turut di tengah pemeriksaan → ulang dari awal.
        // Saat menoleh wajah memang lebih sulit terdeteksi, jadi diberi kelonggaran lebih lama.
        st.hilang += 1;
        const batas = st.langkah === 'toleh' ? 4000 : 2500;
        if (st.langkah !== 'cari' && st.hilang >= 3 && t - st.terakhirTerlihat > batas) ulang();
        return st;
      }
      st.terakhirTerlihat = t;
      st.hilang = 0;
      st.ulang = false;
      const lurus = f.rasio >= LURUS[0] && f.rasio <= LURUS[1];
      // Ukuran wajah hanya diperiksa saat menghadap lurus (wajah yang menoleh tampak lebih sempit)
      if (st.langkah !== 'toleh' && lurus && f.besar < 0.18) { st.dekat = true; return st; }
      st.dekat = false;
      if (st.langkah === 'cari' || st.langkah === 'lurus') {
        st.langkah = 'lurus';
        if (lurus && f.vektor) st.vektor.push(Array.from(f.vektor));
        if (st.vektor.length >= jumlahLurus) { st.langkah = 'toleh'; st.mulaiToleh = t; }
        return st;
      }
      if (st.langkah === 'toleh') {
        if (f.rasio < TOLEH) st.kiri = true;
        if (f.rasio > 1 - TOLEH) st.kanan = true;
        if (st.kiri && st.kanan) st.langkah = 'akhir';
        else if (t - st.mulaiToleh > 15000) ulang();
        return st;
      }
      if (st.langkah === 'akhir' && lurus && f.vektor) {
        // Wajah setelah menoleh harus orang yang sama dengan di awal
        const awal = rataRata(st.vektor);
        if (jarak(awal, Array.from(f.vektor)) < 0.45) { st.vektor.push(Array.from(f.vektor)); st.langkah = 'selesai'; }
        else ulang();
      }
      return st;
    },
  };
}

export function rataRata(daftar) {
  const n = daftar.length; const out = new Array(128).fill(0);
  for (const v of daftar) for (let i = 0; i < 128; i += 1) out[i] += v[i] / n;
  return out;
}

export function jarak(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s);
}

/**
 * Baca satu frame video. Vektor hanya dihitung saat wajah menghadap lurus (lebih hemat).
 * @returns {Promise<null | {rasio:number, besar:number, kotak:object, vektor?:Float32Array}>}
 */
export async function bacaFrame(faceapi, video, { butuhVektor }) {
  const opsi = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });
  const d = await faceapi.detectSingleFace(video, opsi).withFaceLandmarks();
  if (!d) return null;
  const rasio = rasioToleh(d.landmarks.positions);
  const besar = d.detection.box.width / (video.videoWidth || 1);
  const hasil = { rasio, besar, kotak: d.detection.box };
  if (butuhVektor && rasio >= LURUS[0] && rasio <= LURUS[1]) {
    // Sama dengan withFaceDescriptor(): potong wajah yang sudah diluruskan, lalu hitung vektornya
    const [wajah] = await faceapi.extractFaces(video, [d.alignedRect]);
    const v = await faceapi.computeFaceDescriptor(wajah);
    hasil.vektor = Array.isArray(v) ? v[0] : v;
  }
  return hasil;
}

/** Foto wajah kecil (WEBP 200×200) untuk diperiksa admin saat pendaftaran. */
export function potongFotoWajah(video, kotak) {
  const sisi = Math.max(kotak.width, kotak.height) * 1.5;
  const cx = kotak.x + kotak.width / 2; const cy = kotak.y + kotak.height / 2;
  const c = document.createElement('canvas'); c.width = 200; c.height = 200;
  const x = c.getContext('2d');
  x.drawImage(video, cx - sisi / 2, cy - sisi / 2, sisi, sisi, 0, 0, 200, 200);
  const webp = c.toDataURL('image/webp', 0.75);
  return webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/jpeg', 0.8);
}
