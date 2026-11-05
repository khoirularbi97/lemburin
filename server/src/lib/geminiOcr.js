// Pembaca SPL tulisan tangan lewat Gemini API (WAJIB tier berbayar / billing aktif).
// Tier gratis Gemini melarang data pribadi dan isinya boleh dipakai Google untuk melatih model,
// jadi kunci dari project tanpa billing JANGAN dipakai di sini.
// Env:
//   GEMINI_API_KEY        kunci dari Google AI Studio (project dengan billing aktif)
//   GEMINI_MODEL          bawaan gemini-3.8-flash
//   GEMINI_BATAS_HARIAN   batas baca SPL per hari (bawaan 100) supaya biaya tidak lepas kendali
//   GEMINI_THINKING       tingkat "berpikir" model (bawaan low; kosongkan untuk bawaan Google)
// Yang dikirim hanya potongan kolom tabel SPL (tanpa kop perusahaan & tanda tangan).
import { prisma } from './prisma.js';
import { waktuJakarta } from './lembur.js';
import { HttpError } from './util.js';

const KUNCI = process.env.GEMINI_API_KEY || '';
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const ENDPOINT = (process.env.GEMINI_ENDPOINT || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
const THINKING = process.env.GEMINI_THINKING ?? 'low';
export const BATAS_HARIAN = Math.max(0, Number(process.env.GEMINI_BATAS_HARIAN ?? 100) || 0);
export const geminiAktif = Boolean(KUNCI);
export const modelGemini = MODEL;

// Disimpan di tabel PemakaianOcr dengan kunci "gemini:YYYY-MM-DD" (Azure memakai "YYYY-MM")
const kunciHari = () => `gemini:${waktuJakarta().tanggal}`;

export async function pemakaianGemini() {
  const r = await prisma.pemakaianOcr.findUnique({ where: { bulan: kunciHari() } });
  const jumlah = r?.jumlah || 0;
  return { periode: 'hari', tanggal: waktuJakarta().tanggal, jumlah, batas: BATAS_HARIAN, sisa: Math.max(0, BATAS_HARIAN - jumlah) };
}

async function catat() {
  const bulan = kunciHari();
  await prisma.pemakaianOcr.upsert({ where: { bulan }, update: { jumlah: { increment: 1 } }, create: { bulan, jumlah: 1 } });
}

const TEKS = { type: 'STRING' };
const SKEMA = {
  type: 'OBJECT',
  properties: {
    hari: TEKS,
    tanggal: { type: 'STRING', description: 'Tanggal persis seperti tertulis, mis. 15.02.2026' },
    baris: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { no: { type: 'INTEGER' }, nama: TEKS, bagian: TEKS, mulai: TEKS, selesai: TEKS, alasan: TEKS },
        required: ['no', 'nama', 'bagian', 'mulai', 'selesai', 'alasan'],
      },
    },
  },
  required: ['tanggal', 'baris'],
};

export function perintah(jumlahBaris) {
  return [
    'Gambar ini potongan formulir Surat Perintah Lembur (SPL) yang ditulis tangan, dari sebuah pabrik di Indonesia.',
    'Bagian paling atas berisi baris "Hari" dan "Tanggal".',
    `Di bawahnya ada tabel bergaris TANPA judul kolom, berisi ${jumlahBaris} baris. Kolom dari kiri ke kanan: NAMA, BAGIAN, JAM MULAI, JAM SELESAI, ALASAN LEMBUR.`,
    'Tugas: salin tulisan di setiap sel apa adanya (transkripsi). Jangan menebak, memperbaiki ejaan, atau melengkapi nama yang disingkat; "A. Dani" tetap "A. Dani", "Bp. Hero" tetap "Bp. Hero".',
    'Tanda "sama dengan atas" (tanda kutip ", 〃, garis -, coretan / atau \\, centang kecil, panah ke bawah) ditulis sebagai satu karakter ".',
    'Sel kosong ditulis "". Jam ditulis seperti di kertas, mis. "18.30".',
    `Kembalikan tepat ${jumlahBaris} baris berurutan dari atas ke bawah dengan no = 1 sampai ${jumlahBaris}, termasuk baris yang kosong.`,
  ].join('\n');
}

function tubuh(buf, mime, jumlahBaris, pakaiThinking) {
  const generationConfig = { temperature: 0, responseMimeType: 'application/json', responseSchema: SKEMA };
  if (pakaiThinking && THINKING) generationConfig.thinkingConfig = { thinkingLevel: THINKING };
  return {
    contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mime, data: buf.toString('base64') } }, { text: perintah(jumlahBaris) }] }],
    generationConfig,
  };
}

const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Baca potongan SPL. Mengembalikan isi per baris tabel.
 * @param {Buffer} buf
 * @param {string} mime image/jpeg | image/png | image/webp
 * @param {number} jumlahBaris jumlah baris tabel yang terdeteksi di HP
 */
export async function bacaSplGemini(buf, mime, jumlahBaris) {
  if (!geminiAktif) throw new HttpError(503, 'Pembaca Gemini belum diatur di server.', { kode: 'GEMINI_MATI' });
  const p = await pemakaianGemini();
  if (BATAS_HARIAN && p.jumlah >= BATAS_HARIAN) {
    throw new HttpError(429, `Batas baca SPL hari ini tercapai (${p.jumlah}/${BATAS_HARIAN}). Centang manual dulu.`, { kode: 'KUOTA_HABIS' });
  }
  const url = `${ENDPOINT}/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`;
  let res; let json; let pakaiThinking = true;
  for (let coba = 0; coba < 4; coba += 1) {
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'x-goog-api-key': KUNCI, 'Content-Type': 'application/json' },
        body: JSON.stringify(tubuh(buf, mime, jumlahBaris, pakaiThinking)),
        signal: AbortSignal.timeout(60000),
      });
    } catch (e) {
      throw new HttpError(502, 'Tidak bisa menghubungi Gemini. Coba lagi sebentar.', { kode: 'GEMINI_GAGAL', detail: e.message });
    }
    json = await res.json().catch(() => null);
    const pesan = json?.error?.message || '';
    // Model yang tidak mengenal pengaturan "thinking": ulangi tanpa pengaturan itu
    if (res.status === 400 && pakaiThinking && /thinking/i.test(pesan)) { pakaiThinking = false; continue; }
    if ((res.status === 429 || res.status === 503 || res.status === 500) && coba < 2) { await tidur(1500 * (coba + 1)); continue; }
    break;
  }
  await catat(); // permintaan terkirim dihitung (Google bisa menagih walau jawabannya ditolak)
  if (!res.ok) {
    const pesan = json?.error?.message || `Gemini menjawab ${res.status}`;
    if (res.status === 401 || res.status === 403 || /api key/i.test(pesan)) {
      throw new HttpError(502, 'Kunci Gemini ditolak. Periksa GEMINI_API_KEY di Render.', { kode: 'GEMINI_KUNCI' });
    }
    if (res.status === 404) throw new HttpError(502, `Model ${MODEL} tidak tersedia. Periksa GEMINI_MODEL.`, { kode: 'GEMINI_MODEL' });
    if (res.status === 429 && /limit:\s*0\b/i.test(pesan)) {
      throw new HttpError(502, `Model ${MODEL} tidak tersedia untuk kunci ini (tier gratis). Ganti GEMINI_MODEL ke model yang ada di halaman rate limit AI Studio.`, { kode: 'GEMINI_MODEL' });
    }
    if (res.status === 429 && /per ?day|PerDay/i.test(pesan)) {
      throw new HttpError(429, 'Batas harian Gemini habis. Besok bisa dipakai lagi; hari ini centang manual dulu.', { kode: 'KUOTA_HABIS' });
    }
    if (res.status === 429) throw new HttpError(429, 'Gemini sedang membatasi permintaan. Coba lagi semenit lagi.', { kode: 'GEMINI_SIBUK' });
    throw new HttpError(502, `Gemini gagal membaca: ${pesan}`, { kode: 'GEMINI_GAGAL' });
  }
  const kandidat = json?.candidates?.[0];
  const teks = (kandidat?.content?.parts || []).filter((x) => !x.thought && typeof x.text === 'string').map((x) => x.text).join('');
  let isi;
  try { isi = JSON.parse(teks); } catch {
    throw new HttpError(502, `Gemini tidak mengembalikan tabel (${kandidat?.finishReason || 'jawaban kosong'}). Coba foto ulang.`, { kode: 'GEMINI_GAGAL' });
  }
  const u = json.usageMetadata || {};
  return {
    jenis: 'GEMINI',
    model: MODEL,
    ...rapikanTabel(isi, jumlahBaris),
    token: { masuk: u.promptTokenCount || 0, keluar: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0) },
  };
}

/** Rapikan jawaban model: tepat jumlahBaris baris, urut menurut "no". Dipakai Gemini & Groq. */
export function rapikanTabel(isi, jumlahBaris) {
  const s = (v) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
  const baris = Array.from({ length: jumlahBaris }, (_, i) => ({ no: i + 1, nama: '', bagian: '', mulai: '', selesai: '', alasan: '' }));
  (Array.isArray(isi?.baris) ? isi.baris : []).forEach((r, i) => {
    // Nomor di luar tabel dibuang; tanpa nomor → pakai urutan
    const no = Number.isInteger(r?.no) ? r.no : i + 1;
    if (no < 1 || no > jumlahBaris) return;
    baris[no - 1] = { no, nama: s(r.nama), bagian: s(r.bagian), mulai: s(r.mulai), selesai: s(r.selesai), alasan: s(r.alasan) };
  });
  return { hari: s(isi?.hari), tanggal: s(isi?.tanggal), baris };
}
