// Penyimpanan foto bukti SPL di Neon Object Storage (API kompatibel S3).
//
// Env (didapat dari Neon Console → Connect → tab Storage, atau `neon env pull`):
//   AWS_ENDPOINT_URL_S3     endpoint S3 branch, mis. https://br-xxx.storage.c-2.ap-southeast-1.aws.neon.tech
//   AWS_REGION              mis. ap-southeast-1
//   AWS_ACCESS_KEY_ID       token_id credential (scope storage:read + storage:write)
//   AWS_SECRET_ACCESS_KEY   s3_secret_access_key credential
//   STORAGE_BUCKET          nama bucket, mis. foto-spl (buat dulu: `neon buckets create foto-spl`)
// Kalau belum diisi, foto disimpan di kolom database seperti sebelumnya (cadangan).
import crypto from 'node:crypto';
import {
  CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client,
} from '@aws-sdk/client-s3';

const BUCKET = process.env.STORAGE_BUCKET || '';
const ENDPOINT = process.env.AWS_ENDPOINT_URL_S3 || process.env.STORAGE_ENDPOINT || '';

export const storageAktif = Boolean(BUCKET && ENDPOINT && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);

let klien = null;
function s3() {
  if (!klien) {
    klien = new S3Client({
      endpoint: ENDPOINT,
      region: process.env.AWS_REGION || 'us-east-2',
      credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY },
      // Neon hanya mendukung path-style (bucket di path, bukan subdomain)
      forcePathStyle: true,
      // Disarankan Neon: jangan kirim checksum kalau tidak wajib
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      maxAttempts: 4, // Neon bisa membalas 503 SlowDown saat ramai; SDK mencoba ulang dengan jeda
    });
  }
  return klien;
}

const EKSTENSI = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };

/** Nama objek: spl/2026/11/<acak>.webp (acak supaya tidak bisa ditebak). */
export function buatKunci(mime, tanggal = new Date()) {
  const y = tanggal.getUTCFullYear();
  const m = String(tanggal.getUTCMonth() + 1).padStart(2, '0');
  return `spl/${y}/${m}/${crypto.randomUUID()}.${EKSTENSI[mime] || 'bin'}`;
}

const kodeGalat = (e) => e?.Code || e?.code || e?.cause?.code || (/\b(E[A-Z_]{4,})\b/.exec(e?.message || '')?.[1]) || e?.name || '';

export async function unggah(kunci, buf, mime) {
  const kirim = () => s3().send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: kunci,
    Body: buf,
    ContentType: mime,
    CacheControl: 'private, max-age=31536000, immutable',
  }));
  try {
    await kirim();
  } catch (e) {
    // Bucket belum dibuat di branch ini: buat (privat) lalu ulangi sekali
    if (kodeGalat(e) !== 'NoSuchBucket') throw e;
    await s3().send(new CreateBucketCommand({ Bucket: BUCKET }));
    console.log(`[foto-spl] bucket ${BUCKET} dibuat`);
    await kirim();
  }
}

/** Penjelasan singkat (bahasa Indonesia) kenapa penyimpanan gagal, untuk admin. */
export function jelaskanGalat(e) {
  const kode = kodeGalat(e);
  const status = e?.$metadata?.httpStatusCode;
  if (kode === 'InvalidAccessKeyId') return 'AWS_ACCESS_KEY_ID tidak dikenali Neon (credential salah atau sudah dihapus)';
  if (kode === 'SignatureDoesNotMatch') return 'AWS_SECRET_ACCESS_KEY tidak cocok dengan AWS_ACCESS_KEY_ID';
  if (kode === 'NoSuchBucket') return `bucket "${BUCKET}" tidak ada dan tidak bisa dibuat otomatis`;
  if (kode === 'AccessDenied' || status === 403) return `credential tidak punya izin storage:write untuk bucket "${BUCKET}"`;
  if (/AuthorizationHeaderMalformed|PermanentRedirect|IllegalLocationConstraint/i.test(kode)) return `AWS_REGION (${process.env.AWS_REGION || 'kosong'}) tidak cocok dengan endpoint`;
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|UND_ERR/i.test(kode) || /getaddrinfo|fetch failed/i.test(e?.message || '')) {
    return `AWS_ENDPOINT_URL_S3 (${ENDPOINT}) tidak bisa dihubungi`;
  }
  if (/SlowDown|ServiceUnavailable|InternalError/i.test(kode) || status >= 500) return 'Neon Object Storage sedang sibuk/gangguan';
  return `${kode || 'galat'}${e?.message ? `: ${e.message}` : ''}`.slice(0, 200);
}

/** @returns {Promise<{body: import('node:stream').Readable, mime: string, ukuran?: number}>} */
export async function ambil(kunci) {
  const r = await s3().send(new GetObjectCommand({ Bucket: BUCKET, Key: kunci }));
  return { body: r.Body, mime: r.ContentType || 'application/octet-stream', ukuran: r.ContentLength };
}

export async function hapus(kunci) {
  await s3().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: kunci }));
}
