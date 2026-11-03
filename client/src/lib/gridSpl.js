// Deteksi tabel formulir SPL (SNY-FRM-HRD-006) dari foto, tanpa library.
// Bekerja pada gambar abu-abu kecil (lebar ±1000 px) supaya cepat di HP.
// Murni (tanpa DOM) supaya bisa diuji di Node.
//
// Hasil: sudut kemiringan, garis-garis baris & kolom tabel, dan peta kolom
// (no, nama, bagian, mulai, selesai, alasan, ttd) dalam koordinat gambar kecil.

/** @typedef {{width:number,height:number,data:Uint8Array}} Abu  data = 0 (hitam) .. 255 (putih) */

/** Ambang Otsu supaya tinta terpisah dari kertas walau foto agak gelap. */
export function ambangOtsu(abu) {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < abu.data.length; i += 1) hist[abu.data[i]] += 1;
  const total = abu.data.length;
  let sum = 0;
  for (let t = 0; t < 256; t += 1) sum += t * hist[t];
  let sumB = 0; let wB = 0; let maks = 0; let ambang = 128;
  for (let t = 0; t < 256; t += 1) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB; const mF = (sum - sumB) / wF;
    const v = wB * wF * (mB - mF) ** 2;
    if (v > maks) { maks = v; ambang = t; }
  }
  return ambang;
}

/**
 * Gambar biner: 1 = tinta. Ambang adaptif (Bradley): piksel dianggap tinta kalau
 * jelas lebih gelap dari rata-rata sekitarnya. Tahan bayangan, kertas kekuningan,
 * dan latar meja yang gelap (area gelap yang rata tidak dianggap tinta).
 */
export function biner(abu, jendela = 25, selisih = 0.15) {
  const { width: w, height: h, data } = abu;
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 1; y <= h; y += 1) {
    let baris = 0;
    for (let x = 1; x <= w; x += 1) {
      baris += data[(y - 1) * w + (x - 1)];
      integral[y * (w + 1) + x] = integral[(y - 1) * (w + 1) + x] + baris;
    }
  }
  const r = Math.floor(jendela / 2);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    const y0 = Math.max(0, y - r); const y1 = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x += 1) {
      const x0 = Math.max(0, x - r); const x1 = Math.min(w - 1, x + r);
      const n = (x1 - x0 + 1) * (y1 - y0 + 1);
      const jumlah = integral[(y1 + 1) * (w + 1) + (x1 + 1)] - integral[y0 * (w + 1) + (x1 + 1)]
        - integral[(y1 + 1) * (w + 1) + x0] + integral[y0 * (w + 1) + x0];
      out[y * w + x] = data[y * w + x] * n < jumlah * (1 - selisih) ? 1 : 0;
    }
  }
  return { width: w, height: h, data: out };
}

/** Putar gambar biner (nearest neighbour) sebesar `derajat` di sekitar pusat. */
export function putar(b, derajat) {
  if (!derajat) return b;
  const { width: w, height: h } = b;
  const r = (derajat * Math.PI) / 180;
  const c = Math.cos(r); const s = Math.sin(r);
  const cx = w / 2; const cy = h / 2;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const sx = Math.round(c * (x - cx) + s * (y - cy) + cx);
      const sy = Math.round(-s * (x - cx) + c * (y - cy) + cy);
      if (sx >= 0 && sy >= 0 && sx < w && sy < h) out[y * w + x] = b.data[sy * w + sx];
    }
  }
  return { width: w, height: h, data: out };
}

/** Run tinta terpanjang per baris piksel (celah ≤ `celah` px dianggap sambung).
 *  Tinta di baris atas/bawah ikut dihitung, supaya garis yang masih sedikit miring tidak terputus. */
function runHorizontal(b, celah = 4, tebal = 1) {
  const { width: w, height: h } = b;
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let v = 0;
      for (let d = -tebal; d <= tebal && !v; d += 1) {
        const yy = y + d;
        if (yy >= 0 && yy < h && b.data[yy * w + x]) v = 1;
      }
      data[y * w + x] = v;
    }
  }
  const panjang = new Int32Array(h); const x0s = new Int32Array(h); const x1s = new Int32Array(h);
  for (let y = 0; y < h; y += 1) {
    let terbaik = 0; let bx0 = 0; let bx1 = 0;
    let mulai = -1; let akhir = -1; let kosong = 0;
    for (let x = 0; x < w; x += 1) {
      if (data[y * w + x]) {
        if (mulai < 0) mulai = x;
        akhir = x; kosong = 0;
      } else if (mulai >= 0) {
        kosong += 1;
        if (kosong > celah) {
          if (akhir - mulai > terbaik) { terbaik = akhir - mulai; bx0 = mulai; bx1 = akhir; }
          mulai = -1; kosong = 0;
        }
      }
    }
    if (mulai >= 0 && akhir - mulai > terbaik) { terbaik = akhir - mulai; bx0 = mulai; bx1 = akhir; }
    panjang[y] = terbaik; x0s[y] = bx0; x1s[y] = bx1;
  }
  return { panjang, x0s, x1s };
}

/** Skor kelurusan: makin tajam puncak garis horizontal, makin lurus. */
function skorLurus(b) {
  const { panjang } = runHorizontal(b, 2, 0);
  let s = 0;
  for (let y = 0; y < panjang.length; y += 1) s += panjang[y] * panjang[y];
  return s;
}

/** Cari kemiringan terbaik di −4..4 derajat. */
export function cariKemiringan(b) {
  let terbaik = 0; let skor = -1;
  for (const kasar of [-4, -3, -2, -1, 0, 1, 2, 3, 4]) {
    const v = skorLurus(putar(b, kasar));
    if (v > skor) { skor = v; terbaik = kasar; }
  }
  const awal = terbaik;
  for (let d = awal - 0.75; d <= awal + 0.75 + 1e-9; d += 0.25) {
    const v = skorLurus(putar(b, d));
    if (v > skor) { skor = v; terbaik = d; }
  }
  return Math.round(terbaik * 100) / 100;
}

/** Gabungkan indeks yang berdekatan jadi satu garis (pusatnya). */
function kelompok(indeks, jarak = 3) {
  const out = [];
  let grup = [];
  for (const i of indeks) {
    if (grup.length && i - grup[grup.length - 1] > jarak) { out.push(grup); grup = []; }
    grup.push(i);
  }
  if (grup.length) out.push(grup);
  return out.map((g) => ({ pos: Math.round(g.reduce((a, b) => a + b, 0) / g.length), tebal: g.length }));
}

const NAMA_KOLOM = ['no', 'nama', 'bagian', 'mulai', 'selesai', 'alasan', 'ttd'];
// Lebar relatif kolom formulir SNY-FRM-HRD-006 (diukur dari contoh asli)
const TEMPLATE = [0.075, 0.285, 0.134, 0.111, 0.111, 0.184, 0.1];

/**
 * Deteksi tabel pada gambar biner yang sudah lurus.
 * @returns {null | {kiri:number,kanan:number,atas:number,bawahHeader:number,bawah:number,
 *   baris:number[], kolom:Record<string,[number,number]>, tinggiBaris:number, garisV:number[]}}
 */
export function deteksiTabel(b) {
  const { width: w, height: h, data } = b;
  const { panjang, x0s, x1s } = runHorizontal(b, 4);

  // Garis horizontal: run tinta lebih dari 40% lebar gambar (tulisan yang menempel
  // bisa memotong garis, jadi ambangnya tidak dibuat terlalu tinggi)
  const calon = [];
  for (let y = 0; y < h; y += 1) if (panjang[y] > w * 0.4) calon.push(y);
  const garisH = kelompok(calon, 4).map((g) => {
    // pakai baris dengan run terpanjang di kelompok ini
    let yb = g.pos; let pb = -1;
    for (let y = g.pos - 4; y <= g.pos + 4; y += 1) if (y >= 0 && y < h && panjang[y] > pb) { pb = panjang[y]; yb = y; }
    return { y: g.pos, x0: x0s[yb], x1: x1s[yb], p: pb };
  });
  if (garisH.length < 6) return null;

  // Tepi tabel dari garis yang paling panjang (yang tidak terpotong tulisan)
  const pMaks = Math.max(...garisH.map((g) => g.p));
  const penuh = garisH.filter((g) => g.p > pMaks * 0.95);
  if (penuh.length < 3) return null;
  const kiri = Math.round(median(penuh.map((g) => g.x0)));
  const kanan = Math.round(median(penuh.map((g) => g.x1)));
  const tabel = garisH.filter((g) => g.x0 < kiri + (kanan - kiri) * 0.5 && g.x1 > kiri + (kanan - kiri) * 0.5);

  // Jarak antar garis: baris data seragam, header lebih tinggi
  const ys = tabel.map((g) => g.y);
  const jarak = ys.slice(1).map((y, i) => y - ys[i]).filter((d) => d > 6);
  const tinggiBaris = median(jarak);
  // Header: celah pertama yang jauh lebih tinggi dari baris biasa (baris data dimulai sesudahnya)
  let iHeader = -1;
  for (let i = 0; i < Math.min(ys.length - 1, 6); i += 1) {
    const d = ys[i + 1] - ys[i];
    // header formulir ±2–4 kali tinggi baris; celah lebih besar = tepi kertas/kop, lewati
    if (d > tinggiBaris * 1.6 && d < tinggiBaris * 4.5) { iHeader = i; break; }
  }
  if (iHeader < 0) return null;
  const atas = ys[iHeader];
  const bawahHeader = ys[iHeader + 1];
  // Garis-garis baris; garis yang hilang (tertutup tulisan/terlalu tipis) diisi dengan interpolasi
  const baris = [bawahHeader];
  for (let i = iHeader + 2; i < ys.length; i += 1) {
    const d = ys[i] - baris[baris.length - 1];
    if (d < tinggiBaris * 0.6) continue; // garis ganda
    const n = Math.round(d / tinggiBaris);
    if (n > 3) break; // lompatan terlalu jauh: tabel sudah selesai
    for (let k = 1; k < n; k += 1) baris.push(Math.round(baris[baris.length - 1] + d / n));
    baris.push(ys[i]);
  }
  const bawah = baris[baris.length - 1];
  if (baris.length < 4) return null;

  // Garis vertikal dicari per pita (4 bagian tinggi tabel), lalu tiap garis
  // di-fit lurus x = a + b·y. Tahan foto yang sedikit miring/perspektif.
  const PITA = 4;
  const tinggiPita = (bawah - bawahHeader) / PITA;
  const perPita = [];
  for (let p = 0; p < PITA; p += 1) {
    const ya = Math.round(bawahHeader + p * tinggiPita); const yb = Math.round(ya + tinggiPita);
    const cakupan = new Float32Array(w);
    for (let x = Math.max(1, kiri - 12); x <= Math.min(w - 2, kanan + 12); x += 1) {
      let n = 0;
      for (let y = ya; y < yb; y += 1) {
        if (data[y * w + x] || data[y * w + x - 1] || data[y * w + x + 1]) n += 1;
      }
      cakupan[x] = n / (yb - ya);
    }
    const calonV = [];
    for (let x = 0; x < w; x += 1) if (cakupan[x] > 0.75) calonV.push(x);
    perPita.push({ y: (ya + yb) / 2, xs: kelompok(calonV, 3).map((g) => g.pos) });
  }
  // Pita acuan = yang garisnya paling banyak; cocokkan garis pita lain ke acuan
  const acuanPita = perPita.reduce((a, p) => (p.xs.length > a.xs.length ? p : a), perPita[0]);
  const garisV = acuanPita.xs.map((x0) => {
    const titik = [];
    let perkiraan = x0;
    for (const p of perPita) {
      const dekat = p.xs.reduce((a, x) => (Math.abs(x - perkiraan) < Math.abs(a - perkiraan) ? x : a), Infinity);
      if (Math.abs(dekat - perkiraan) <= 14) { titik.push([p.y, dekat]); perkiraan = dekat; }
    }
    return fitGaris(titik, x0);
  }).filter(Boolean);
  const yTengah = (bawahHeader + bawah) / 2;
  let tengah = garisV.map((g) => g.a + g.b * yTengah);
  if (!tengah.length || tengah[0] - kiri > 10) { garisV.unshift({ a: kiri, b: 0 }); tengah.unshift(kiri); }
  if (kanan - tengah[tengah.length - 1] > 10) { garisV.push({ a: kanan, b: 0 }); tengah.push(kanan); }

  const peta = petakanKolom(tengah, kiri, kanan, garisV);
  if (!peta) return null;
  const xPada = (garis, y) => garis.a + garis.b * y;
  const kolom = {};
  Object.entries(peta).forEach(([n, [g0, g1]]) => { kolom[n] = [Math.round(xPada(g0, yTengah)), Math.round(xPada(g1, yTengah))]; });
  /** Batas kolom pada ketinggian y (memperhitungkan kemiringan sisa). */
  const kolomPada = (y) => Object.fromEntries(Object.entries(peta).map(([n, [g0, g1]]) => [n, [xPada(g0, y), xPada(g1, y)]]));
  return { kiri, kanan, atas, bawahHeader, bawah, baris, kolom, kolomPada, tinggiBaris, garisV: tengah.map(Math.round) };
}

/** x = a + b·y dengan kuadrat terkecil; satu titik → garis tegak. */
function fitGaris(titik, cadangan) {
  if (!titik.length) return null;
  if (titik.length === 1) return { a: titik[0][1], b: 0 };
  const n = titik.length;
  const my = titik.reduce((s, t) => s + t[0], 0) / n;
  const mx = titik.reduce((s, t) => s + t[1], 0) / n;
  let num = 0; let den = 0;
  for (const [y, x] of titik) { num += (y - my) * (x - mx); den += (y - my) ** 2; }
  const b = den ? num / den : 0;
  if (Math.abs(b) > 0.08) return { a: cadangan, b: 0 }; // terlalu miring: anggap salah cocok
  return { a: mx - b * my, b };
}

/** Cocokkan garis vertikal (posisi di tengah tabel) ke template 7 kolom. */
function petakanKolom(tengah, kiri, kanan, garis) {
  const L = kanan - kiri;
  const harap = [kiri];
  TEMPLATE.forEach((f, i) => harap.push(harap[i] + f * L));
  // Tiap batas: garis terdekat kalau cukup dekat, kalau tidak posisi dari template
  const batas = harap.map((hx) => {
    let terbaik = -1;
    tengah.forEach((x, i) => { if (terbaik < 0 || Math.abs(x - hx) < Math.abs(tengah[terbaik] - hx)) terbaik = i; });
    return terbaik >= 0 && Math.abs(tengah[terbaik] - hx) < L * 0.045 ? garis[terbaik] : { a: Math.round(hx), b: 0 };
  });
  const yUji = 0;
  for (let i = 1; i < batas.length; i += 1) {
    if (batas[i].a + batas[i].b * yUji <= batas[i - 1].a + batas[i - 1].b * yUji && batas[i] !== batas[i - 1]) return null;
    if (batas[i] === batas[i - 1]) return null;
  }
  const kolom = {};
  NAMA_KOLOM.forEach((n, i) => { kolom[n] = [batas[i], batas[i + 1]]; });
  return kolom;
}

function median(a) {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}

/**
 * Proses lengkap: kemiringan + tabel.
 * @param {Abu} abu gambar abu-abu kecil
 */
export function analisisSpl(abu) {
  const b = biner(abu);
  const sudut = cariKemiringan(b);
  const tabel = deteksiTabel(putar(b, sudut));
  return tabel ? { sudut, ...tabel } : { sudut, gagal: true };
}
