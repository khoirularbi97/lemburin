import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import Icon from '../../components/Icon.jsx';
import { Memuat, Modal } from '../../components/ui.jsx';

function waktu(iso) {
  const d = new Date(iso);
  const menit = Math.round((Date.now() - d.getTime()) / 60000);
  if (menit < 1) return 'baru saja';
  if (menit < 60) return `${menit} menit lalu`;
  if (menit < 60 * 24) return `${Math.round(menit / 60)} jam lalu`;
  return d.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short' });
}

/** Ikon lonceng di kepala halaman portal + kotak masuk notifikasi. */
export default function Lonceng() {
  const nav = useNavigate();
  const [jumlah, setJumlah] = useState(0);
  const [buka, setBuka] = useState(false);
  const [list, setList] = useState(null);

  const cek = useCallback(() => {
    api('/api/portal/notifikasi/jumlah').then((r) => setJumlah(r.belumDibaca)).catch(() => {});
  }, []);

  useEffect(() => {
    cek();
    const t = setInterval(cek, 60000);
    const lihat = () => { if (document.visibilityState === 'visible') cek(); };
    document.addEventListener('visibilitychange', lihat);
    window.addEventListener('lq:notif', cek); // notifikasi push masuk saat aplikasi terbuka
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', lihat); window.removeEventListener('lq:notif', cek); };
  }, [cek]);

  async function bukaKotak() {
    setBuka(true);
    setList(null);
    try {
      setList(await api('/api/portal/notifikasi'));
      if (jumlah) { await api('/api/portal/notifikasi/baca', { method: 'POST' }); setJumlah(0); }
    } catch { setList([]); }
  }

  return (
    <>
      <button type="button" className="bell" onClick={bukaKotak} aria-label={jumlah ? `Notifikasi, ${jumlah} belum dibaca` : 'Notifikasi'}>
        <Icon name="bell" size={20} />
        {jumlah > 0 && <span className="bell-n">{jumlah > 9 ? '9+' : jumlah}</span>}
      </button>
      {buka && (
        <Modal judul="Notifikasi" onClose={() => setBuka(false)}>
          {!list ? <Memuat /> : list.length ? (
            <div className="glass list">
              {list.map((n) => (
                <button
                  type="button" key={n.id} className="li notif"
                  onClick={() => { setBuka(false); if (n.url?.startsWith('/')) nav(n.url); }}
                >
                  <div className="t">
                    <b>{!n.dibaca && <span className="dot" style={{ width: 8, height: 8, marginRight: 6 }} />}{n.judul}</b>
                    <span>{n.isi}</span>
                  </div>
                  <span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{waktu(n.waktu)}</span>
                </button>
              ))}
            </div>
          ) : <p>Belum ada notifikasi. Kabar akan muncul di sini setiap kali lembur Anda tercatat atau pengajuan diproses.</p>}
          <div className="acts"><button type="button" className="btn key" onClick={() => setBuka(false)} autoFocus>Tutup</button></div>
        </Modal>
      )}
    </>
  );
}
