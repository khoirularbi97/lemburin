import 'dotenv/config';
import { buatApp } from './app.js';
import { prisma } from './lib/prisma.js';
import { bersihkanFotoLama } from './lib/fotoSpl.js';
import { storageAktif } from './lib/penyimpanan.js';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET wajib diisi, minimal 32 karakter. Lihat server/.env.example');
  process.exit(1);
}

const port = Number(process.env.PORT) || 4000;
const server = buatApp().listen(port, () => {
  console.log(`lemburin API jalan di port ${port}`);
  console.log(storageAktif ? 'Foto SPL: Neon Object Storage' : 'Foto SPL: disimpan di database (STORAGE_BUCKET belum diisi)');
});

// Hapus foto SPL yang lewat masa simpan: sebentar setelah server bangun, lalu tiap 12 jam
setTimeout(() => bersihkanFotoLama({ paksa: true }).catch((e) => console.error('[foto-spl]', e.message)), 60_000).unref();
setInterval(() => bersihkanFotoLama({ paksa: true }).catch((e) => console.error('[foto-spl]', e.message)), 12 * 3600 * 1000).unref();

async function tutup() {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGTERM', tutup);
process.on('SIGINT', tutup);
