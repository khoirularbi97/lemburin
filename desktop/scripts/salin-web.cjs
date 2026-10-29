// Salin hasil build web (client/dist, mode native) ke desktop/app sebelum dikemas.
const fs = require('node:fs');
const path = require('node:path');

const sumber = path.resolve(__dirname, '..', '..', 'client', 'dist');
const tujuan = path.resolve(__dirname, '..', 'app');

if (!fs.existsSync(path.join(sumber, 'index.html'))) {
  console.error('client/dist belum ada. Jalankan dulu: cd client && npm run build:native');
  process.exit(1);
}
if (fs.existsSync(path.join(sumber, 'sw.js'))) {
  console.error('client/dist berisi service worker (build web biasa). Pakai: npm run build:native');
  process.exit(1);
}
fs.rmSync(tujuan, { recursive: true, force: true });
fs.cpSync(sumber, tujuan, { recursive: true });
console.log(`Disalin: ${sumber} → ${tujuan}`);
