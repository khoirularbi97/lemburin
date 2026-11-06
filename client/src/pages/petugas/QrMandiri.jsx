import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import Icon from '../../components/Icon.jsx';
import { Avatar } from '../../components/ui.jsx';

/**
 * QR dinamis untuk tap mandiri karyawan. Isinya berganti tiap 10 detik dan ditandatangani server,
 * jadi foto/tangkapan layar QR cepat kedaluwarsa. Karyawan memindainya dari portal setelah verifikasi wajah.
 */
export default function QrMandiri() {
  const { user } = useAuth();
  const [qr, setQr] = useState(null);
  const [gambar, setGambar] = useState('');
  const [err, setErr] = useState('');
  const [sisa, setSisa] = useState(0);
  const kunciLayar = useRef(null);
  const [pemakai, setPemakai] = useState(null);
  const sudahLihat = useRef(null);
  const [baru, setBaru] = useState(() => new Set());

  // Daftar karyawan yang tap lewat QR ini hari ini, diperbarui tiap 5 detik
  useEffect(() => {
    let hidup = true;
    const muat = () => api('/api/scan/qr-mandiri/pemakai').then((r) => {
      if (!hidup) return;
      const kunci = (k) => `${k.jenis}-${k.karyawan?.id}-${k.waktu}`;
      if (sudahLihat.current) {
        const muncul = r.kejadian.filter((k) => !sudahLihat.current.has(kunci(k))).map(kunci);
        if (muncul.length) {
          setBaru(new Set(muncul));
          try { navigator.vibrate?.(120); } catch { /* tidak didukung */ }
          setTimeout(() => hidup && setBaru(new Set()), 12000);
        }
      }
      sudahLihat.current = new Set(r.kejadian.map(kunci));
      setPemakai(r.kejadian);
    }).catch(() => {});
    muat();
    const t = setInterval(() => { if (document.visibilityState === 'visible') muat(); }, 5000);
    return () => { hidup = false; clearInterval(t); };
  }, []);

  // Ambil QR baru tepat sebelum yang lama berganti
  useEffect(() => {
    let hidup = true; let t = null;
    const ambil = async () => {
      try {
        const r = await api('/api/scan/qr-mandiri');
        if (!hidup) return;
        setQr({ ...r, sampai: Date.now() + r.sisaMs });
        setGambar(await QRCode.toDataURL(r.isi, { margin: 2, width: 560, errorCorrectionLevel: 'M' }));
        setErr('');
        t = setTimeout(ambil, Math.max(800, r.sisaMs + 150));
      } catch (e) {
        if (!hidup) return;
        setErr(e.message);
        t = setTimeout(ambil, 4000);
      }
    };
    ambil();
    const lihat = () => { if (document.visibilityState === 'visible') { clearTimeout(t); ambil(); } };
    document.addEventListener('visibilitychange', lihat);
    return () => { hidup = false; clearTimeout(t); document.removeEventListener('visibilitychange', lihat); };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setSisa(qr ? Math.max(0, qr.sampai - Date.now()) : 0), 250);
    return () => clearInterval(t);
  }, [qr]);

  // Jaga layar tetap menyala selama QR ditampilkan
  useEffect(() => {
    let batal = false;
    const minta = async () => {
      try { if ('wakeLock' in navigator && document.visibilityState === 'visible') kunciLayar.current = await navigator.wakeLock.request('screen'); } catch { /* tidak didukung */ }
      if (batal) kunciLayar.current?.release().catch(() => {});
    };
    minta();
    document.addEventListener('visibilitychange', minta);
    return () => { batal = true; document.removeEventListener('visibilitychange', minta); kunciLayar.current?.release().catch(() => {}); };
  }, []);

  const persen = qr ? Math.min(100, (sisa / (qr.periodeDetik * 1000)) * 100) : 0;

  return (
    <main className="p-body">
      <div className="p-head">
        <div><h1>QR lembur mandiri</h1><p>Area {user.area} · {user.nama}</p></div>
      </div>

      <div className="glass qr-mandiri">
        {gambar ? <img src={gambar} alt="QR lembur mandiri, berganti tiap 10 detik" /> : <div className="qr-kosong"><span className="spin" /></div>}
        <div className="qr-waktu" aria-hidden="true"><i style={{ width: `${persen}%` }} /></div>
        <span className="muted num" style={{ fontSize: 13 }}>{err ? <span className="err">{err}</span> : `Berganti dalam ${Math.ceil(sisa / 1000)} detik`}</span>
      </div>

      <div className="glass today">
        <span className="tile t-indigo" style={{ width: 40, height: 40 }}><Icon name="info" /></span>
        <div className="t">
          <b>Karyawan memindai QR ini dari portal</b>
          <span>Menu Tap → verifikasi wajah → pindai QR. Tap pertama = tap in, tap kedua = tap out. Hanya karyawan area {user.area === 'Semua' ? 'mana saja' : user.area} yang bisa memakai QR ini.</span>
        </div>
      </div>
      <div className="glass list">
        <div className="li" style={{ borderBottom: 0, paddingBottom: 2 }}>
          <b style={{ fontSize: 15 }}>Tap lewat QR Anda hari ini</b>
          <span className="muted" style={{ fontSize: 12 }}>{pemakai ? `${pemakai.length} tap` : ''}</span>
        </div>
        {!pemakai ? <div className="empty">Memuat…</div> : !pemakai.length ? <div className="empty">Belum ada yang tap lewat QR ini.</div> : pemakai.map((k) => {
          const id = `${k.jenis}-${k.karyawan?.id}-${k.waktu}`;
          return (
            <div className={`li${baru.has(id) ? ' baru' : ''}`} key={id}>
              <span className="namecell" style={{ minWidth: 0 }}>
                <Avatar nama={k.karyawan?.nama || '?'} kunci={k.karyawan?.id} kecil />
                <span className="t"><b>{k.karyawan?.nama}</b><span>{k.karyawan?.nik} · {k.karyawan?.departemen}</span></span>
              </span>
              <span style={{ textAlign: 'right' }}>
                <span className={`badge ${k.jenis === 'TAP_IN' ? 'b-ok' : 'b-ink'}`}>{k.jenis === 'TAP_IN' ? 'Tap in' : 'Tap out'}</span>
                <div className="num muted" style={{ fontSize: 12, marginTop: 3 }}>{k.jam} WIB</div>
              </span>
            </div>
          );
        })}
      </div>
      <p className="hint"><b>Periksa daftar ini.</b> Kalau ada nama yang orangnya tidak ada di depan Anda (QR diteruskan lewat foto/chat), laporkan ke HRD. QR berganti tiap 10 detik dan setiap tap tetap wajib verifikasi wajah.</p>
    </main>
  );
}
