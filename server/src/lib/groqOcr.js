// Pembaca SPL tulisan tangan lewat Groq (API kompatibel OpenAI, model vision).
// Daftar gratis di console.groq.com tanpa kartu; Groq tidak menyimpan isi permintaan secara bawaan.
// Env:
//   GROQ_API_KEY          kunci dari console.groq.com → API Keys
//   GROQ_MODEL            bawaan qwen/qwen3.6-27b (model vision di Groq). Kalau model yang diisi tidak ada,
//                         otomatis dicoba ulang dengan model bawaan.
//   GROQ_BATAS_HARIAN     batas baca SPL per hari (bawaan 100)
// Yang dikirim hanya potongan kolom tabel SPL (tanpa kop perusahaan & tanda tangan).
import { prisma } from './prisma.js';
import { waktuJakarta } from './lembur.js';
import { HttpError } from './util.js';
import { perintah, rapikanTabel } from './geminiOcr.js';

const KUNCI = process.env.GROQ_API_KEY || '';
export const MODEL_BAWAAN = 'qwen/qwen3.6-27b';
const MODEL_ENV = (process.env.GROQ_MODEL || '').trim() || MODEL_BAWAAN;
// Model yang sedang dipakai; diganti ke MODEL_BAWAAN kalau MODEL_ENV ternyata tidak ada di Groq
let MODEL = MODEL_ENV;
const ENDPOINT = (process.env.GROQ_ENDPOINT || 'https://api.groq.com').replace(/\/+$/, '');
export const BATAS_HARIAN = Math.max(0, Number(process.env.GROQ_BATAS_HARIAN ?? 100) || 0);
export const groqAktif = Boolean(KUNCI);
export const modelGroq = () => MODEL;

const kunciHari = () => `groq:${waktuJakarta().tanggal}`;

export async function pemakaianGroq() {
  const r = await prisma.pemakaianOcr.findUnique({ where: { bulan: kunciHari() } });
  const jumlah = r?.jumlah || 0;
  return { periode: 'hari', tanggal: waktuJakarta().tanggal, jumlah, batas: BATAS_HARIAN, sisa: Math.max(0, BATAS_HARIAN - jumlah) };
}

async function catat() {
  const bulan = kunciHari();
  await prisma.pemakaianOcr.upsert({ where: { bulan }, update: { jumlah: { increment: 1 } }, create: { bulan, jumlah: 1 } });
}

const CONTOH_JSON = '{"hari":"","tanggal":"","baris":[{"no":1,"nama":"","bagian":"","mulai":"","selesai":"","alasan":""}]}';

function tubuh(buf, mime, jumlahBaris, sembunyikanNalar) {
  const t = {
    model: MODEL,
    temperature: 0,
    max_completion_tokens: 6000,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: `Kamu juru ketik yang menyalin formulir tulisan tangan. Jawab HANYA dengan JSON berbentuk: ${CONTOH_JSON}` },
      { role: 'user', content: [
        { type: 'text', text: perintah(jumlahBaris) },
        { type: 'image_url', image_url: { url: `data:${mime};base64,${buf.toString('base64')}` } },
      ] },
    ],
  };
  if (sembunyikanNalar) t.reasoning_format = 'hidden';
  return t;
}

const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

/** Ambil objek JSON dari jawaban (buang blok <think> atau ```json kalau ada). */
function ambilJson(teks) {
  const t = String(teks || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '').trim();
  try { return JSON.parse(t); } catch { /* coba potong */ }
  const a = t.indexOf('{'); const b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch { /* gagal */ } }
  return null;
}

/**
 * Baca potongan SPL lewat Groq. Hasilnya sama bentuknya dengan Gemini.
 * @param {Buffer} buf
 * @param {string} mime
 * @param {number} jumlahBaris
 */
export async function bacaSplGroq(buf, mime, jumlahBaris) {
  if (!groqAktif) throw new HttpError(503, 'Pembaca Groq belum diatur di server.', { kode: 'GROQ_MATI' });
  const p = await pemakaianGroq();
  if (BATAS_HARIAN && p.jumlah >= BATAS_HARIAN) {
    throw new HttpError(429, `Batas baca SPL hari ini tercapai (${p.jumlah}/${BATAS_HARIAN}). Centang manual dulu.`, { kode: 'KUOTA_HABIS' });
  }
  const url = `${ENDPOINT}/openai/v1/chat/completions`;
  let res; let json; let isi = null; let nalar = true;
  for (let coba = 0; coba < 4; coba += 1) {
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KUNCI}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(tubuh(buf, mime, jumlahBaris, nalar)),
        signal: AbortSignal.timeout(60000),
      });
    } catch (e) {
      throw new HttpError(502, 'Tidak bisa menghubungi Groq. Coba lagi sebentar.', { kode: 'GROQ_GAGAL', detail: e.message });
    }
    json = await res.json().catch(() => null);
    const pesan = json?.error?.message || '';
    // Model di GROQ_MODEL tidak ada (salah ketik / sudah dihapus Groq): pakai model bawaan
    if ((res.status === 404 || /model.*(not found|does not exist|decommissioned)/i.test(pesan)) && MODEL !== MODEL_BAWAAN) {
      console.warn(`[groq] model ${MODEL} tidak tersedia, beralih ke ${MODEL_BAWAAN}. Perbaiki GROQ_MODEL di Render.`);
      MODEL = MODEL_BAWAAN;
      continue;
    }
    // Model yang bukan model "nalar" menolak reasoning_format: ulangi tanpa itu
    if (res.status === 400 && nalar && /reasoning/i.test(pesan)) { nalar = false; continue; }
    // JSON mode gagal di sisi Groq: coba sekali lagi
    if (res.status === 400 && /json_validate_failed|failed to generate json/i.test(`${json?.error?.code} ${pesan}`) && coba < 2) continue;
    if ((res.status === 429 || res.status >= 500) && coba < 2 && !/per day|\bRPD\b|TPD/i.test(pesan)) {
      const tunggu = Math.min(8, Number(res.headers.get('retry-after')) || 2 * (coba + 1));
      await tidur(tunggu * 1000);
      continue;
    }
    if (res.ok) {
      isi = ambilJson(json?.choices?.[0]?.message?.content);
      if (!isi && coba < 1) continue;
    }
    break;
  }
  await catat();
  if (!res.ok) {
    const pesan = json?.error?.message || `Groq menjawab ${res.status}`;
    if (res.status === 401 || res.status === 403) throw new HttpError(502, 'Kunci Groq ditolak. Periksa GROQ_API_KEY di Render.', { kode: 'GROQ_KUNCI' });
    if (res.status === 404 || /model.*(not found|does not exist|decommissioned)/i.test(pesan)) {
      throw new HttpError(502, `Model ${MODEL} tidak tersedia di Groq. Ganti GROQ_MODEL ke model vision yang ada di console.groq.com.`, { kode: 'GROQ_MODEL' });
    }
    if (res.status === 413) throw new HttpError(413, 'Potongan SPL terlalu besar untuk Groq.', { kode: 'GROQ_GAGAL' });
    if (res.status === 429 && /per day|\bRPD\b|TPD/i.test(pesan)) {
      throw new HttpError(429, 'Jatah harian gratis Groq habis. Besok bisa dipakai lagi; hari ini centang manual dulu.', { kode: 'KUOTA_HABIS' });
    }
    if (res.status === 429) throw new HttpError(429, 'Groq sedang membatasi permintaan. Coba lagi semenit lagi.', { kode: 'GROQ_SIBUK' });
    throw new HttpError(502, `Groq gagal membaca: ${pesan}`, { kode: 'GROQ_GAGAL' });
  }
  if (!isi) {
    throw new HttpError(502, `Groq tidak mengembalikan tabel (${json?.choices?.[0]?.finish_reason || 'jawaban kosong'}). Coba foto ulang.`, { kode: 'GROQ_GAGAL' });
  }
  const u = json.usage || {};
  return { jenis: 'GROQ', model: MODEL, ...rapikanTabel(isi, jumlahBaris), token: { masuk: u.prompt_tokens || 0, keluar: u.completion_tokens || 0 } };
}
