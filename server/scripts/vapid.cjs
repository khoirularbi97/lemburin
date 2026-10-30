// Buat pasangan kunci VAPID untuk notifikasi Web Push.
// Tidak butuh paket tambahan, cukup Node.js: npm run vapid
const crypto = require('node:crypto');

const ecdh = crypto.createECDH('prime256v1');
ecdh.generateKeys();
const pub = ecdh.getPublicKey();
let priv = ecdh.getPrivateKey();
if (priv.length < 32) priv = Buffer.concat([Buffer.alloc(32 - priv.length), priv]);

console.log('Salin dua baris ini ke Environment di Render (dan ke server/.env untuk lokal):\n');
console.log(`VAPID_PUBLIC_KEY=${pub.toString('base64url')}`);
console.log(`VAPID_PRIVATE_KEY=${priv.toString('base64url')}`);
console.log('\nSimpan VAPID_PRIVATE_KEY baik-baik. Kalau diganti, karyawan harus mengaktifkan notifikasi lagi.');
