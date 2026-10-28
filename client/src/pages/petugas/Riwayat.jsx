import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { Memuat, useToast } from '../../components/ui.jsx';
import { hariIniWIB, jamFmt, rp, tanggalPanjang } from '../../format.js';

export default function Riwayat() {
  const toast = useToast();
  const [data, setData] = useState(null);

  useEffect(() => {
    api('/api/scan/saya').then(setData).catch((e) => toast(e.message, true));
  }, [toast]);

  return (
    <main className="p-body">
      <div className="p-head"><div><h1>Riwayat hari ini</h1><p>{tanggalPanjang(data?.tanggal || hariIniWIB())}</p></div></div>
      {!data ? <Memuat /> : (
        <>
          <div className="glass" style={{ borderRadius: 20, padding: 14, display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>
            <div><div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>Tercatat</div><div className="num" style={{ fontSize: 22, fontWeight: 800 }}>{data.tercatat.length} tap</div></div>
            <div><div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>Ditolak</div><div className="num" style={{ fontSize: 22, fontWeight: 800 }}>{data.ditolak.length}</div></div>
          </div>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>Tercatat</h2>
          <div className="glass list">
            {data.tercatat.length ? data.tercatat.map((t) => (
              <div className="li" key={t.id}>
                <div className="t"><b>{t.karyawan.nama}</b><span>{t.jam} · {t.karyawan.departemen} · {jamFmt(t.jamHitung)} jam</span></div>
                <span className="v num">{rp(t.nominal)}</span>
              </div>
            )) : <div className="empty">Belum ada tap hari ini.</div>}
          </div>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>Ditolak</h2>
          <div className="glass list">
            {data.ditolak.length ? data.ditolak.map((d) => (
              <div className="li" key={d.id}>
                <div className="t"><b>{d.karyawan?.nama || 'Tidak dikenal'}</b><span>{d.jam} · {d.alasan}</span></div>
                <span className="badge b-err">Ditolak</span>
              </div>
            )) : <div className="empty">Tidak ada tap yang ditolak.</div>}
          </div>
        </>
      )}
    </main>
  );
}
