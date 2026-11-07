// Simpan, ambil, dan bersihkan foto bukti SPL.
import { prisma } from './prisma.js';
import * as penyimpanan from './penyimpanan.js';

/** Bulan foto disimpan sebelum dihapus otomatis. 0 = simpan selamanya. */
export const MASA_SIMPAN_BULAN = Math.max(0, Number(process.env.FOTO_SPL_SIMPAN_BULAN ?? 13) || 0);

/**
 * Simpan foto lebih dulu (sebelum data lembur dibuat).
 * Kalau Object Storage gagal, foto disimpan di kolom database (foto sudah dikompres ±20–150 KB) supaya
 * lembur tetap bisa dicatat; penyebabnya dikembalikan sebagai `peringatan` untuk diperbaiki admin.
 * @returns {Promise<{kolom: object, peringatan?: string}>} kolom-kolom Spl untuk foto
 */
export async function simpanFoto({ buf, mime }) {
  const diDatabase = { foto: buf, fotoMime: mime, fotoUkuran: buf.length };
  if (!penyimpanan.storageAktif) return { kolom: diDatabase };
  const kunci = penyimpanan.buatKunci(mime);
  try {
    await penyimpanan.unggah(kunci, buf, mime);
    return { kolom: { fotoKey: kunci, fotoMime: mime, fotoUkuran: buf.length } };
  } catch (e) {
    const sebab = penyimpanan.jelaskanGalat(e);
    console.error('[foto-spl] unggah ke Object Storage gagal, foto disimpan di database:', e.name, e.message);
    return { kolom: diDatabase, peringatan: `Penyimpanan foto (Neon Object Storage) gagal: ${sebab}. Foto disimpan di database dulu.` };
  }
}

/** Batalkan foto yang sudah diunggah (mis. tidak ada lembur yang tercatat). */
export async function buangFoto(kolom) {
  if (kolom?.fotoKey) await penyimpanan.hapus(kolom.fotoKey).catch((e) => console.error('[foto-spl] gagal hapus', e.message));
}

/** @returns {Promise<{body: Buffer|import('node:stream').Readable, mime: string}|null>} */
export async function bacaFoto(spl) {
  if (spl.fotoKey) {
    try {
      return await penyimpanan.ambil(spl.fotoKey);
    } catch (e) {
      if (e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404) return null;
      throw e;
    }
  }
  if (spl.foto) return { body: Buffer.from(spl.foto), mime: spl.fotoMime || 'image/jpeg' };
  return null;
}

let terakhir = 0;

/** Hapus foto yang lewat masa simpan. Data SPL & lembur tidak dihapus. */
export async function bersihkanFotoLama({ paksa = false } = {}) {
  if (!MASA_SIMPAN_BULAN) return 0;
  if (!paksa && Date.now() - terakhir < 6 * 3600 * 1000) return 0; // paling sering tiap 6 jam
  terakhir = Date.now();
  const batas = new Date();
  batas.setUTCMonth(batas.getUTCMonth() - MASA_SIMPAN_BULAN);
  const lama = await prisma.spl.findMany({
    where: { createdAt: { lt: batas }, fotoDihapus: null, fotoMime: { not: null } },
    select: { id: true, fotoKey: true },
    take: 200,
  });
  let n = 0;
  for (const s of lama) {
    try {
      if (s.fotoKey) await penyimpanan.hapus(s.fotoKey);
      await prisma.spl.update({ where: { id: s.id }, data: { foto: null, fotoKey: null, fotoDihapus: new Date() } });
      n += 1;
    } catch (e) {
      console.error(`[foto-spl] gagal membersihkan SPL ${s.id}:`, e.message);
    }
  }
  if (n) console.log(`[foto-spl] ${n} foto lebih dari ${MASA_SIMPAN_BULAN} bulan dihapus`);
  return n;
}
