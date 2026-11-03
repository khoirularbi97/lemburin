// Cek koneksi ke Neon Object Storage dan buat bucket kalau belum ada.
// Jalankan di folder server setelah mengisi .env:  npm run storage:cek
import 'dotenv/config';
import {
  CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client,
} from '@aws-sdk/client-s3';

const wajib = ['AWS_ENDPOINT_URL_S3', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'STORAGE_BUCKET'];
const kurang = wajib.filter((k) => !process.env[k]);
if (kurang.length) {
  console.error(`✗ Belum diisi di server/.env: ${kurang.join(', ')}`);
  process.exit(1);
}

const bucket = process.env.STORAGE_BUCKET;
const s3 = new S3Client({
  endpoint: process.env.AWS_ENDPOINT_URL_S3,
  region: process.env.AWS_REGION || 'us-east-2',
  credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY },
  forcePathStyle: true,
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

function jelaskan(e) {
  const kode = e.$metadata?.httpStatusCode;
  if (kode === 403 || e.name === 'AccessDenied' || e.name === 'InvalidAccessKeyId' || e.name === 'SignatureDoesNotMatch') {
    return 'Kredensial ditolak. Pastikan Access Key/Secret benar dan scope storage:read + storage:write.';
  }
  if (e.code === 'ENOTFOUND' || e.code === 'ECONNREFUSED') return `Endpoint tidak bisa dihubungi (${process.env.AWS_ENDPOINT_URL_S3}).`;
  return `${e.name || 'Error'}: ${e.message}`;
}

try {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log(`✓ Bucket "${bucket}" ditemukan`);
  } catch (e) {
    if (e.$metadata?.httpStatusCode !== 404 && e.name !== 'NotFound' && e.name !== 'NoSuchBucket') throw e;
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    console.log(`✓ Bucket "${bucket}" dibuat (privat)`);
  }
  const kunci = `cek/${Date.now()}.txt`;
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: kunci, Body: 'lemburin', ContentType: 'text/plain' }));
  const r = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: kunci }));
  const isi = await r.Body.transformToString();
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: kunci }));
  if (isi !== 'lemburin') throw new Error('Isi file uji tidak sama');
  console.log('✓ Uji tulis, baca, dan hapus berhasil. Foto SPL siap disimpan di Neon Object Storage.');
} catch (e) {
  console.error(`✗ ${jelaskan(e)}`);
  process.exit(1);
}
