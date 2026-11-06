// Salin file OCR (tesseract.js) ke public/ocr supaya pembaca foto SPL jalan
// tanpa CDN: di web, aplikasi Android/iOS, dan desktop. Dijalankan otomatis sebelum build.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const akar = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nm = (...p) => path.join(akar, 'node_modules', ...p);
const tujuan = path.join(akar, 'public', 'ocr');
fs.mkdirSync(path.join(tujuan, 'lang'), { recursive: true });

const salin = [
  [nm('tesseract.js', 'dist', 'worker.min.js'), 'worker.min.js'],
  // Tiga varian inti; tesseract.js memilih sendiri sesuai kemampuan perangkat
  [nm('tesseract.js-core', 'tesseract-core-relaxedsimd-lstm.wasm.js'), 'tesseract-core-relaxedsimd-lstm.wasm.js'],
  [nm('tesseract.js-core', 'tesseract-core-simd-lstm.wasm.js'), 'tesseract-core-simd-lstm.wasm.js'],
  [nm('tesseract.js-core', 'tesseract-core-lstm.wasm.js'), 'tesseract-core-lstm.wasm.js'],
  // Bahasa Indonesia + Inggris, versi ringan (best_int)
  [nm('@tesseract.js-data', 'ind', '4.0.0_best_int', 'ind.traineddata.gz'), 'lang/ind.traineddata.gz'],
  [nm('@tesseract.js-data', 'eng', '4.0.0_best_int', 'eng.traineddata.gz'), 'lang/eng.traineddata.gz'],
];
for (const [dari, ke] of salin) {
  const t = path.join(tujuan, ke);
  if (!fs.existsSync(t) || fs.statSync(t).size !== fs.statSync(dari).size) fs.copyFileSync(dari, t);
}
console.log('File OCR siap di public/ocr');

// Model pengenal wajah (face-api) untuk tap mandiri: detektor kecil, 68 titik wajah, pengenal wajah
const tujuanWajah = path.join(akar, 'public', 'wajah');
fs.mkdirSync(tujuanWajah, { recursive: true });
for (const nama of ['tiny_face_detector_model', 'face_landmark_68_model', 'face_recognition_model']) {
  for (const ext of ['-weights_manifest.json', '.bin']) {
    const dari = nm('@vladmandic', 'face-api', 'model', nama + ext);
    const t = path.join(tujuanWajah, nama + ext);
    if (!fs.existsSync(t) || fs.statSync(t).size !== fs.statSync(dari).size) fs.copyFileSync(dari, t);
  }
}
console.log('Model wajah siap di public/wajah');
