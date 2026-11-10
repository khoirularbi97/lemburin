import { useState } from 'react';
import { api } from '../api.js';
import { useToast } from './ui.jsx';
import { tanggalPanjang } from '../format.js';

/** Jadwal shift hari kerja ini + penanda "shift 1 lembur" (shift 2 lalu masuk 19.30–03.30). */
export default function InfoShift({ hari, onUbah, tanggal }) {
  const toast = useToast();
  const [proses, setProses] = useState(false);
  const s = hari.shift;
  const tgl = tanggal || hari.tanggal;
  const ubah = async (nilai) => {
    setProses(true);
    try {
      const r = await api('/api/shift/hari', { method: 'PUT', body: { tanggal: tgl, shift1Lembur: nilai } });
      onUbah(r.shift);
      toast(nilai ? 'Ditandai: shift 1 lembur, shift 2 masuk lebih malam' : 'Penanda shift 1 lembur dihapus');
    } catch (e) { toast(e.message, true); } finally { setProses(false); }
  };
  return (
    <div className="glass info-shift">
      {hari.tanggalKalender && hari.tanggalKalender !== hari.tanggal && (
        <p className="hint" style={{ margin: 0 }}>Sebelum jam {s.gantiHari}: dihitung untuk hari kerja <b>{tanggalPanjang(hari.tanggal)}</b>.</p>
      )}
      <div className="shift-grup">
        {Object.entries(s.grup).map(([g, j]) => (
          <span key={g}><b>Grup {g}</b> · {j?.nama} <span className="num">{j?.masuk}–{j?.pulang}</span></span>
        ))}
      </div>
      <label className="chk">
        <input type="checkbox" checked={s.shift1Lembur} disabled={proses} onChange={(e) => ubah(e.target.checked)} />
        <span>Shift 1 lembur hari ini (shift 2 masuk {s.shift2Lembur?.masuk}–{s.shift2Lembur?.pulang})</span>
      </label>
    </div>
  );
}
