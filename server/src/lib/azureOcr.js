// Pembaca tulisan (termasuk tulisan tangan) lewat Azure AI Vision – Image Analysis 4.0, fitur "read".
// Env:
//   AZURE_VISION_ENDPOINT   mis. https://lemburin-ocr.cognitiveservices.azure.com
//   AZURE_VISION_KEY        Key 1 dari Azure Portal → resource Computer Vision → Keys and Endpoint
//   AZURE_VISION_BATAS_BULANAN  batas pemakaian per bulan (bawaan 4500, kuota gratis F0 = 5000)
// Yang dikirim hanya potongan kolom tabel SPL (tanpa kop perusahaan & tanda tangan).
import { prisma } from './prisma.js';
import { waktuJakarta } from './lembur.js';
import { HttpError } from './util.js';

const ENDPOINT = (process.env.AZURE_VISION_ENDPOINT || '').replace(/\/+$/, '');
const KUNCI = process.env.AZURE_VISION_KEY || '';
export const BATAS_BULANAN = Math.max(0, Number(process.env.AZURE_VISION_BATAS_BULANAN ?? 4500) || 0);
export const azureAktif = Boolean(ENDPOINT && KUNCI);

const bulanIni = () => waktuJakarta().tanggal.slice(0, 7);

export async function pemakaian() {
  const r = await prisma.pemakaianOcr.findUnique({ where: { bulan: bulanIni() } });
  const jumlah = r?.jumlah || 0;
  return { bulan: bulanIni(), jumlah, batas: BATAS_BULANAN, sisa: Math.max(0, BATAS_BULANAN - jumlah) };
}

async function catat() {
  const bulan = bulanIni();
  await prisma.pemakaianOcr.upsert({ where: { bulan }, update: { jumlah: { increment: 1 } }, create: { bulan, jumlah: 1 } });
}

/**
 * Baca gambar. Mengembalikan baris & kata beserta kotak posisinya (piksel gambar yang dikirim).
 * @param {Buffer} buf JPEG/PNG
 */
export async function bacaGambar(buf) {
  if (!azureAktif) throw new HttpError(503, 'Pembaca Azure belum diatur di server.', { kode: 'AZURE_MATI' });
  const p = await pemakaian();
  if (BATAS_BULANAN && p.jumlah >= BATAS_BULANAN) {
    throw new HttpError(429, `Kuota baca SPL bulan ini habis (${p.jumlah}/${BATAS_BULANAN}). Centang manual dulu.`, { kode: 'KUOTA_HABIS' });
  }
  const url = `${ENDPOINT}/computervision/imageanalysis:analyze?api-version=2024-02-01&features=read`;
  let res;
  for (let coba = 0; coba < 3; coba += 1) {
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Ocp-Apim-Subscription-Key': KUNCI, 'Content-Type': 'application/octet-stream' },
        body: buf,
        signal: AbortSignal.timeout(30000),
      });
    } catch (e) {
      throw new HttpError(502, 'Tidak bisa menghubungi Azure. Coba lagi sebentar.', { kode: 'AZURE_GAGAL', detail: e.message });
    }
    // Tier gratis dibatasi 20 permintaan per menit: tunggu lalu coba lagi
    if (res.status !== 429) break;
    const tunggu = Math.min(10, Number(res.headers.get('retry-after')) || 3);
    await new Promise((r) => setTimeout(r, tunggu * 1000));
  }
  await catat(); // permintaan terkirim = 1 transaksi (termasuk yang gagal di sisi Azure)
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const pesan = json?.error?.message || `Azure menjawab ${res.status}`;
    if (res.status === 401 || res.status === 403) throw new HttpError(502, 'Kunci Azure ditolak. Periksa AZURE_VISION_KEY dan AZURE_VISION_ENDPOINT.', { kode: 'AZURE_KUNCI' });
    throw new HttpError(502, `Azure gagal membaca: ${pesan}`, { kode: 'AZURE_GAGAL' });
  }
  const garis = (json?.readResult?.blocks || []).flatMap((b) => b.lines || []);
  return {
    lebar: json?.metadata?.width,
    tinggi: json?.metadata?.height,
    baris: garis.map((l) => ({
      teks: l.text,
      kotak: l.boundingPolygon,
      kata: (l.words || []).map((w) => ({ teks: w.text, kotak: w.boundingPolygon, yakin: w.confidence })),
    })),
  };
}
