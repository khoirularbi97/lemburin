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
  DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client,
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

export async function unggah(kunci, buf, mime) {
  await s3().send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: kunci,
    Body: buf,
    ContentType: mime,
    CacheControl: 'private, max-age=31536000, immutable',
  }));
}

/** @returns {Promise<{body: import('node:stream').Readable, mime: string, ukuran?: number}>} */
export async function ambil(kunci) {
  const r = await s3().send(new GetObjectCommand({ Bucket: BUCKET, Key: kunci }));
  return { body: r.Body, mime: r.ContentType || 'application/octet-stream', ukuran: r.ContentLength };
}

export async function hapus(kunci) {
  await s3().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: kunci }));
}
