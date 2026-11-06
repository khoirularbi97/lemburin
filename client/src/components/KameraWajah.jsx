import { useEffect, useRef, useState } from 'react';
import { pesanKamera } from '../pages/petugas/useKamera.js';
import { bacaFrame, buatPemeriksa, muatPengenal, potongFotoWajah, rataRata } from '../lib/wajah.js';

const jeda = (ms) => new Promise((r) => setTimeout(r, ms));

const PETUNJUK = {
  memuat: 'Menyiapkan pengenal wajah…',
  cari: 'Arahkan wajah ke dalam lingkaran',
  lurus: 'Tahan sebentar, lihat lurus ke kamera',
  toleh: 'Tolehkan kepala pelan ke kiri, lalu ke kanan',
  akhir: 'Bagus! Lihat lurus lagi ke kamera',
  selesai: 'Wajah terverifikasi',
};

/**
 * Kamera depan + pemeriksaan wajah hidup (menoleh kiri–kanan).
 * @param {{mode:'daftar'|'tap', onHasil:(h:{vektor:number[], foto:string|null})=>void, onBatal:()=>void}} p
 */
export default function KameraWajah({ mode = 'tap', onHasil, onBatal }) {
  const video = useRef(null);
  const hasilRef = useRef(onHasil);
  hasilRef.current = onHasil;
  const [st, setSt] = useState({ status: 'memuat', langkah: 'memuat' });
  const [coba, setCoba] = useState(0);

  useEffect(() => {
    let hidup = true;
    let stream = null;
    (async () => {
      setSt({ status: 'memuat', langkah: 'memuat' });
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      } catch (e) {
        if (hidup) setSt({ status: 'gagal', pesan: pesanKamera(e) });
        return;
      }
      if (!hidup) { stream.getTracks().forEach((t) => t.stop()); return; }
      const v = video.current;
      v.srcObject = stream;
      await v.play().catch(() => {});
      let faceapi;
      try { faceapi = await muatPengenal(); } catch {
        if (hidup) setSt({ status: 'gagal', pesan: 'Pengenal wajah gagal dimuat. Periksa internet, lalu ketuk Coba lagi.' });
        return;
      }
      const p = buatPemeriksa({ jumlahLurus: mode === 'daftar' ? 5 : 3 });
      let foto = null;
      while (hidup) {
        if (v.readyState < 2) { await jeda(100); continue; }
        let f = null;
        const butuhVektor = p.st.langkah !== 'toleh';
        try { f = await bacaFrame(faceapi, v, { butuhVektor }); } catch { f = null; }
        if (!hidup) break;
        if (mode === 'daftar' && f?.vektor && p.st.langkah !== 'akhir') foto = potongFotoWajah(v, f.kotak);
        const s = p.terima(f, performance.now());
        setSt({ status: 'jalan', langkah: s.langkah, ada: Boolean(f), dekat: s.dekat, ulang: s.ulang, kiri: s.kiri, kanan: s.kanan, terkumpul: s.vektor.length });
        if (s.langkah === 'selesai') {
          hidup = false;
          stream.getTracks().forEach((t) => t.stop());
          hasilRef.current({ vektor: rataRata(s.vektor), foto });
          break;
        }
        await jeda(80);
      }
    })();
    return () => { hidup = false; stream?.getTracks().forEach((t) => t.stop()); };
  }, [mode, coba]);

  const teks = st.status === 'gagal' ? st.pesan
    : st.ulang ? 'Wajah sempat hilang. Ulangi: lihat lurus ke kamera.'
      : st.dekat ? 'Dekatkan wajah ke kamera'
        : st.status === 'jalan' && !st.ada && st.langkah === 'cari' ? PETUNJUK.cari
          : PETUNJUK[st.langkah] || PETUNJUK.cari;

  return (
    <div className="wajah">
      <div className={`wajah-bingkai l-${st.langkah}${st.status === 'jalan' && st.ada ? ' ada' : ''}`}>
        <video ref={video} playsInline muted aria-label="Pratinjau kamera depan" />
        <span className="wajah-oval" aria-hidden="true" />
        {st.status === 'memuat' && <span className="wajah-muat"><span className="spin" />Menyiapkan…</span>}
      </div>
      <p className={st.status === 'gagal' ? 'err' : 'wajah-petunjuk'} role="status" aria-live="polite">{teks}</p>
      {st.status === 'jalan' && (
        <ol className="wajah-langkah" aria-label="Langkah verifikasi">
          <li className={st.langkah !== 'cari' && st.langkah !== 'lurus' ? 'ok' : st.langkah === 'lurus' ? 'on' : ''}>Lihat lurus</li>
          <li className={st.kiri ? 'ok' : st.langkah === 'toleh' ? 'on' : ''}>Toleh ke satu sisi</li>
          <li className={st.kanan ? 'ok' : st.langkah === 'toleh' ? 'on' : ''}>Toleh ke sisi lain</li>
          <li className={st.langkah === 'selesai' ? 'ok' : st.langkah === 'akhir' ? 'on' : ''}>Lurus lagi</li>
        </ol>
      )}
      <div className="acts">
        <button type="button" className="btn key" onClick={onBatal}>Batal</button>
        {st.status === 'gagal' && <button type="button" className="btn" onClick={() => setCoba((n) => n + 1)}>Coba lagi</button>}
      </div>
      <p className="hint">{mode === 'daftar'
        ? 'Wajah diproses di HP ini. Yang dikirim: 128 angka ciri wajah dan satu foto kecil untuk diperiksa HRD.'
        : 'Wajah diproses di HP ini. Yang dikirim hanya 128 angka ciri wajah, bukan foto.'}</p>
    </div>
  );
}
