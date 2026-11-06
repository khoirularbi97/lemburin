import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import Icon from '../../components/Icon.jsx';
import { Konfirmasi, Memuat, Modal, Tile, useToast } from '../../components/ui.jsx';

const KOSONG = { username: '', nama: '', role: 'PETUGAS', area: 'Semua', password: '' };

function waktu(iso) {
  if (!iso) return '–';
  return new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function Pengguna() {
  const { user: saya } = useAuth();
  const toast = useToast();
  const [list, setList] = useState(null);
  const [departemen, setDepartemen] = useState([]);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [sandi, setSandi] = useState(null);
  const [hapus, setHapus] = useState(null);

  const muat = useCallback(() => api('/api/pengguna').then(setList).catch((e) => toast(e.message, true)), [toast]);
  useEffect(() => {
    muat();
    api('/api/karyawan/departemen').then(setDepartemen).catch(() => {});
  }, [muat]);

  async function simpan(e) {
    e.preventDefault();
    setError('');
    try {
      if (form.id) {
        const { username, nama, role, area } = form;
        await api(`/api/pengguna/${form.id}`, { method: 'PATCH', body: { username, nama, role, area: role === 'ADMIN' ? 'Semua' : area } });
        toast(`Data ${username} disimpan`);
      } else {
        await api('/api/pengguna', { method: 'POST', body: form });
        toast(`Pengguna ${form.username} ditambahkan`);
      }
      setForm(null);
      muat();
    } catch (err) { setError(err.message); }
  }

  async function ubah(u, body) {
    try {
      const r = await api(`/api/pengguna/${u.id}`, { method: 'PATCH', body });
      if (r.sandiBaru) setSandi({ username: u.username, sandi: r.sandiBaru });
      else toast(`${u.username} ${r.aktif ? 'diaktifkan' : 'dinonaktifkan'}`);
      muat();
    } catch (e) { toast(e.message, true); }
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <>
      <div className="ph">
        <div><h1>Pengguna &amp; petugas</h1><p>Akun yang bisa masuk ke aplikasi. Karyawan biasa tidak punya akun, cukup ID card.</p></div>
        <div className="acts"><button type="button" className="btn" onClick={() => { setForm({ ...KOSONG }); setError(''); }}><Icon name="plus" size={18} />Tambah pengguna</button></div>
      </div>

      {form && (
        <form className="glass form" onSubmit={simpan}>
          <h2>{form.id ? `Edit ${form.usernameLama}` : 'Tambah pengguna'}</h2>
          <div className="fld"><label htmlFor="u-user">Username</label><input className="input" id="u-user" autoCapitalize="off" required placeholder="petugas.qc" value={form.username} onChange={set('username')} autoFocus /></div>
          <div className="fld"><label htmlFor="u-nama">Nama</label><input className="input" id="u-nama" required value={form.nama} onChange={set('nama')} /></div>
          <div className="fld"><label htmlFor="u-role">Peran</label><select className="input" id="u-role" value={form.role} onChange={set('role')} disabled={form.id === saya.id}><option value="PETUGAS">Petugas scan</option><option value="ADMIN">Admin</option></select></div>
          <div className="fld"><label htmlFor="u-area">Area</label><select className="input" id="u-area" value={form.role === 'ADMIN' ? 'Semua' : form.area} onChange={set('area')} disabled={form.role === 'ADMIN'}><option>Semua</option>{departemen.map((d) => <option key={d}>{d}</option>)}</select></div>
          {!form.id && <div className="fld"><label htmlFor="u-pw">Kata sandi awal</label><input className="input" id="u-pw" required minLength={6} value={form.password} onChange={set('password')} /></div>}
          <div className="full">
            {error && <p className="err" role="alert" style={{ flexBasis: '100%' }}>{error}</p>}
            <button type="submit" className="btn">Simpan</button>
            <button type="button" className="btn key" onClick={() => setForm(null)}>Batal</button>
            {form.id && <span className="muted" style={{ fontSize: 13 }}>{form.id === saya.id ? 'Peran akun sendiri tidak bisa diubah. ' : ''}Perubahan peran & area langsung berlaku. Kata sandi diubah lewat Reset sandi.</span>}
          </div>
        </form>
      )}

      <div className="stats" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}>
        <div className="glass stat" style={{ alignItems: 'flex-start' }}><Tile icon="shield" warna="t-ink" /><div><b style={{ fontSize: 16 }}>Admin</b><div className="muted" style={{ fontSize: 14 }}>Kelola karyawan, upah, hari libur, dan pengguna. Bisa koreksi tap dan ekspor rekap.</div></div></div>
        <div className="glass stat" style={{ alignItems: 'flex-start' }}><Tile icon="scan" warna="t-teal" /><div><b style={{ fontSize: 16 }}>Petugas scan</b><div className="muted" style={{ fontSize: 14 }}>Hanya bisa membuka scanner dan riwayat tap miliknya. Tidak bisa melihat upah atau mengubah data.</div></div></div>
      </div>

      {!list ? <Memuat /> : (
        <div className="glass tablebox">
          <div className="scroll">
            <table>
              <thead><tr><th>Username</th><th>Nama</th><th>Peran</th><th>Area</th><th>Login terakhir</th><th>Status</th><th>Aksi</th></tr></thead>
              <tbody>
                {list.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 700 }}>{u.username}</td>
                    <td>{u.nama}</td>
                    <td><span className={`badge ${u.role === 'ADMIN' ? 'b-ink' : 'b-ok'}`}>{u.role === 'ADMIN' ? 'Admin' : 'Petugas scan'}</span></td>
                    <td>{u.area}</td>
                    <td className="num">{waktu(u.lastLogin)}</td>
                    <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600, color: u.aktif ? undefined : 'var(--muted)' }}><span className={`dot${u.aktif ? '' : ' off'}`} />{u.aktif ? 'Aktif' : 'Nonaktif'}</span></td>
                    <td>
                      <div className="rowacts">
                        <button type="button" className="link" onClick={() => { setForm({ ...u, usernameLama: u.username }); setError(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Edit</button>
                        <button type="button" className="link" onClick={() => ubah(u, { resetPassword: true })}>Reset sandi</button>
                        {u.id !== saya.id && (
                          <button type="button" className={`link${u.aktif ? ' danger' : ''}`} onClick={() => ubah(u, { aktif: !u.aktif })}>{u.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>
                        )}
                        {u.id !== saya.id && <button type="button" className="link danger" onClick={() => setHapus(u)}>Hapus</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {hapus && (
        <Konfirmasi
          judul={`Hapus ${hapus.username}?`}
          isi={`Akun ${hapus.nama} dihapus permanen dan langsung keluar dari semua perangkat. Akun yang sudah pernah mencatat tap tidak bisa dihapus (agar rekap tetap utuh); nonaktifkan saja.`}
          labelOk="Hapus akun"
          bahaya
          onBatal={() => setHapus(null)}
          onOk={async () => {
            try {
              await api(`/api/pengguna/${hapus.id}`, { method: 'DELETE' });
              toast(`${hapus.username} dihapus`);
              if (form?.id === hapus.id) setForm(null);
              setHapus(null);
              muat();
            } catch (e) { setHapus(null); toast(e.message, true); }
          }}
        />
      )}

      {sandi && (
        <Modal judul="Kata sandi baru" onClose={() => setSandi(null)}>
          <p>Berikan kata sandi sementara ini ke <b>{sandi.username}</b>. Sandi hanya ditampilkan sekali.</p>
          <p className="num" style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', userSelect: 'all', background: '#EEF0F7', borderRadius: 12, padding: '10px 14px' }}>{sandi.sandi}</p>
          <div className="acts">
            <button type="button" className="btn key" onClick={() => { navigator.clipboard?.writeText(sandi.sandi).then(() => toast('Disalin'), () => {}); }}>Salin</button>
            <button type="button" className="btn" autoFocus onClick={() => setSandi(null)}>Selesai</button>
          </div>
        </Modal>
      )}
    </>
  );
}
