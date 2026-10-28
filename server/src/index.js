import 'dotenv/config';
import { buatApp } from './app.js';
import { prisma } from './lib/prisma.js';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET wajib diisi, minimal 32 karakter. Lihat server/.env.example');
  process.exit(1);
}

const port = Number(process.env.PORT) || 4000;
const server = buatApp().listen(port, () => {
  console.log(`lemburin API jalan di port ${port}`);
});

async function tutup() {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGTERM', tutup);
process.on('SIGINT', tutup);
