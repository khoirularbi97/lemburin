import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { Konfirmasi, Memuat, useToast } from '../../components/ui.jsx';
import { hariIniWIB, rp, tanggalPanjang, tanggalPendek } from '../../format.js';
import { STATUS_PENGAJUAN, tanganiError } from './bersama.js';

// Sama dengan aturan server: tanggal 1 bulan lalu sampai hari ini
function batas() {
  const max = hariIniWIB();
  const [y, m] = max.split('-').map(Number);
  return { min: m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, '0')}-01`, max };
}

function kemarin() {
  const d = new Date(`${hariIniWIB()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export default function Pengajuan() {
  const toast = useToast();
  const nav = useNavigate();
  const { min, max } = batas();
  const [list, setList] = useState(null);
  const [f, setF] = useState({ tanggal: kemarin() < min ? max : kemarin(), jam: '17:00', alasan: '' });
  const [err, setErr] = useState('');
  const [proses, setProses] = useState(false);
  const [batal, setBatal] = useState(null);

  const muat = useCallback(() => {
    api('/api/portal/pengajuan').then(setList).catch((e) => tanganiError(e, { toast, nav }));
  }, [toast, nav]);
  useEffect(() => { muat(); }, [muat]);

  const ubah = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setErr(''); };
  const d = f.tanggal ? new Date(`${f.tanggal}T00:00:00Z`).getUTCDay() : null;
  const libur = d === 0 || d === 6;

  async function kirim(e) {
    e.preventDefault();
    if (!f.tanggal || f.tanggal < min || f.tanggal > max) return setErr(`Tanggal harus antara ${tanggalPendek(min)} dan hari ini.`);
    if (f.alasan.trim().length < 5) return setErr('Ceritakan singkat kenapa tidak tap, minimal 5 huruf.');
    setProses(true);
    try {
      await api('/api/portal/pengajuan', { method: 'POST', body: { ...f, alasan: f.alasan.trim() } });
      toast('Pengajuan terkirim ke HRD');
      setF({ ...f, alasan: '' });
      muat();
    } catch (e2) {
      if (e2.data?.kode === 'WAJIB_GANTI_SANDI') tanganiError(e2, { toast, nav });
      else setErr(e2.message);
    } finally {
      setProses(false);
    }
  }

  return (
    <main className="p-body">
      <div className="p-head"><div><h1>Lapor tap terlewat</h1><p>HRD memeriksa sebelum lembur dihitung</p></div></div>

      <form className="glass pj" onSubmit={kirim} noValidate>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="fld">
            <label htmlFor="pj-t">Tanggal lembur</label>
            <input className="input" type="date" id="pj-t" min={min} max={max} value={f.tanggal} onChange={ubah('tanggal')} />
          </div>
          <div className="fld">
            <label htmlFor="pj-j">Jam selesai</label>
            <input className="input" type="time" id="pj-j" value={f.jam} onChange={ubah('jam')} />
          </div>
        </div>
        {f.tanggal && <p className="hint">{tanggalPanjang(f.tanggal)} · dihitung {libur ? '14 jam (Sabtu/Minggu)' : '5,5 jam, atau 14 jam kalau tanggal merah'}</p>}
        <div className="fld">
          <label htmlFor="pj-a">Kenapa tidak tap?</label>
          <input className="input" id="pj-a" maxLength={300} placeholder="Contoh: kartu tertinggal, SPL no. 045" value={f.alasan} onChange={ubah('alasan')} />
        </div>
        {err && <p className="err" role="alert">{err}</p>}
        <button type="submit" className="btn" disabled={proses}>{proses ? 'Mengirim…' : 'Kirim pengajuan'}</button>
        <p className="hint">Bisa untuk tanggal {tanggalPendek(min)} sampai hari ini. Sertakan nomor SPL kalau ada supaya cepat disetujui.</p>
      </form>

      <h2 style={{ margin: '6px 0 0', fontSize: 17 }}>Pengajuan saya</h2>
      {!list ? <Memuat /> : list.length ? list.map((p) => {
        const [label, kelas] = STATUS_PENGAJUAN[p.status];
        return (
          <div className="glass pj" key={p.id}>
            <div className="pj-h">
              <div><b>{tanggalPendek(p.tanggal)} · {p.jam} WIB</b><div className="meta">Diajukan {new Date(p.dibuat).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</div></div>
              <span className={`badge ${kelas}`}>{label}</span>
            </div>
            <p>{p.alasan}</p>
            {p.status === 'DISETUJUI' && p.nominal != null && <p><b>Tercatat {rp(p.nominal)}</b></p>}
            {p.catatanAdmin && <p className="meta">Catatan HRD: {p.catatanAdmin}</p>}
            {p.status === 'MENUNGGU' && <div><button type="button" className="link danger" onClick={() => setBatal(p)}>Batalkan</button></div>}
          </div>
        );
      }) : <div className="glass list"><div className="empty">Belum ada pengajuan.</div></div>}

      {batal && (
        <Konfirmasi
          judul="Batalkan pengajuan?"
          isi={`Pengajuan lembur ${tanggalPendek(batal.tanggal)} akan dibatalkan.`}
          labelOk="Batalkan pengajuan"
          bahaya
          onBatal={() => setBatal(null)}
          onOk={async () => {
            try { await api(`/api/portal/pengajuan/${batal.id}`, { method: 'DELETE' }); toast('Pengajuan dibatalkan'); setBatal(null); muat(); } catch (e) { toast(e.message, true); }
          }}
        />
      )}
    </main>
  );
}
