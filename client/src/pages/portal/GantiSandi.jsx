import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useToast } from '../../components/ui.jsx';

/** Form ganti sandi. Dipakai di halaman wajib (sandi awal) dan di Akun. */
export function FormSandi({ wajib, onSelesai }) {
  const { perbaruiKaryawan } = useAuth();
  const [f, setF] = useState({ lama: '', baru: '', ulang: '' });
  const [err, setErr] = useState('');
  const [proses, setProses] = useState(false);
  const ubah = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setErr(''); };

  async function kirim(e) {
    e.preventDefault();
    if (f.baru.length < 8 || !/[A-Za-z]/.test(f.baru) || !/\d/.test(f.baru)) return setErr('Sandi baru minimal 8 karakter, berisi huruf dan angka.');
    if (f.baru !== f.ulang) return setErr('Ulangi sandi baru belum sama.');
    setProses(true);
    try {
      const r = await api('/api/portal/ganti-sandi', { method: 'POST', body: { sandiLama: f.lama, sandiBaru: f.baru } });
      perbaruiKaryawan(r.token, r.karyawan);
      setF({ lama: '', baru: '', ulang: '' });
      onSelesai?.();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setProses(false);
    }
  }

  return (
    <form className="glass pj" onSubmit={kirim} noValidate>
      <div className="fld">
        <label htmlFor="s-lama">{wajib ? 'Sandi awal dari HRD' : 'Sandi sekarang'}</label>
        <input className="input" id="s-lama" type="password" autoComplete="current-password" value={f.lama} onChange={ubah('lama')} required />
      </div>
      <div className="fld">
        <label htmlFor="s-baru">Sandi baru</label>
        <input className="input" id="s-baru" type="password" autoComplete="new-password" value={f.baru} onChange={ubah('baru')} required />
      </div>
      <div className="fld">
        <label htmlFor="s-ulang">Ulangi sandi baru</label>
        <input className="input" id="s-ulang" type="password" autoComplete="new-password" value={f.ulang} onChange={ubah('ulang')} required />
      </div>
      <p className="hint">Minimal 8 karakter, campuran huruf dan angka, tidak berisi NIK.</p>
      {err && <p className="err" role="alert">{err}</p>}
      <button type="submit" className="btn" disabled={proses}>{proses ? 'Menyimpan…' : 'Simpan sandi baru'}</button>
    </form>
  );
}

export default function GantiSandi() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  return (
    <div className="p-shell">
      <main className="p-body">
        <div className="p-head"><div><h1>Buat sandi Anda</h1><p>Halo {user.nama}, ganti sandi awal dari HRD dulu.</p></div></div>
        <FormSandi wajib onSelesai={() => { toast('Sandi diganti. Selamat datang!'); nav('/portal', { replace: true }); }} />
        <button type="button" className="btn key lg" onClick={logout}>Keluar</button>
      </main>
    </div>
  );
}
