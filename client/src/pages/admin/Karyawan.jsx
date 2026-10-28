import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api.js';
import IdCard from '../../components/IdCard.jsx';
import Icon from '../../components/Icon.jsx';
import { Avatar, Konfirmasi, Memuat, Tile, useToast } from '../../components/ui.jsx';
import { angka } from '../../format.js';

const KOSONG = { nama: '', nik: '', departemen: '', jabatan: 'Operator', upahBulanan: '' };

function FormKaryawan({ awal, departemen, onBatal, onSimpan }) {
  const [f, setF] = useState(awal ? { ...awal } : { ...KOSONG, departemen: departemen[0] || '' });
  const [error, setError] = useState('');
  const [proses, setProses] = useState(false);
  const ubah = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function kirim(e) {
    e.preventDefault();
    setError('');
    setProses(true);
    try {
      await onSimpan({ ...f, upahBulanan: Number(String(f.upahBulanan).replace(/\D/g, '')) });
    } catch (err) {
      setError(err.message);
    } finally {
      setProses(false);
    }
  }

  return (
    <form className="glass form" onSubmit={kirim}>
      <h2>{awal ? `Edit ${awal.nama}` : 'Tambah karyawan'}</h2>
      <div className="fld"><label htmlFor="k-nama">Nama lengkap</label><input className="input" id="k-nama" value={f.nama} onChange={ubah('nama')} required autoFocus /></div>
      <div className="fld"><label htmlFor="k-nik">NIK</label><input className="input" id="k-nik" value={f.nik} onChange={ubah('nik')} required placeholder="SNL-0200" /></div>
      <div className="fld">
        <label htmlFor="k-dept">Departemen</label>
        <select className="input" id="k-dept" value={f.departemen} onChange={ubah('departemen')}>
          {departemen.map((d) => <option key={d}>{d}</option>)}
        </select>
      </div>
      <div className="fld"><label htmlFor="k-jab">Jabatan</label><input className="input" id="k-jab" value={f.jabatan} onChange={ubah('jabatan')} /></div>
      <div className="fld"><label htmlFor="k-upah">Upah sebulan (Rp)</label><input className="input num" id="k-upah" inputMode="numeric" value={f.upahBulanan} onChange={ubah('upahBulanan')} required placeholder="5000000" /></div>
      <div className="full">
        {error && <p className="err" role="alert" style={{ flexBasis: '100%' }}>{error}</p>}
        <button type="submit" className="btn" disabled={proses}>{proses ? 'Menyimpan…' : 'Simpan'}</button>
        <button type="button" className="btn key" onClick={onBatal}>Batal</button>
        <span className="muted" style={{ fontSize: 13 }}>{awal ? 'Perubahan upah hanya berlaku untuk tap berikutnya.' : 'QR dibuat otomatis saat disimpan.'}</span>
      </div>
    </form>
  );
}

export default function Karyawan() {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [departemen, setDepartemen] = useState([]);
  const [cari, setCari] = useState('');
  const [form, setForm] = useState(null); // null | 'baru' | objek karyawan
  const [kartu, setKartu] = useState(null);
  const [ganti, setGanti] = useState(null);

  const muat = useCallback(() => api('/api/karyawan').then(setList).catch((e) => toast(e.message, true)), [toast]);
  useEffect(() => {
    muat();
    api('/api/karyawan/departemen').then(setDepartemen).catch(() => {});
  }, [muat]);

  const tampil = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return (list || []).filter((k) => !q || [k.nama, k.nik, k.departemen].some((v) => v.toLowerCase().includes(q)));
  }, [list, cari]);

  async function simpan(data) {
    if (form === 'baru') {
      const k = await api('/api/karyawan', { method: 'POST', body: data });
      toast(`${k.nama} ditambahkan. ID card siap dicetak.`);
    } else {
      await api(`/api/karyawan/${form.id}`, { method: 'PUT', body: data });
      toast(`Data ${data.nama} disimpan`);
    }
    setForm(null);
    muat();
  }

  async function aturAktif(k) {
    try {
      await api(`/api/karyawan/${k.id}/aktif`, { method: 'PATCH', body: { aktif: !k.aktif } });
      toast(`${k.nama} ${k.aktif ? 'dinonaktifkan' : 'diaktifkan'}`);
      muat();
    } catch (e) { toast(e.message, true); }
  }

  return (
    <>
      <div className="ph">
        <div><h1>Data karyawan</h1><p>Upah sebulan jadi dasar hitung lembur. QR di ID card berisi token acak, bukan NIK.</p></div>
        <div className="acts"><button type="button" className="btn" onClick={() => setForm('baru')}><Icon name="plus" size={18} />Tambah karyawan</button></div>
      </div>

      {form && <FormKaryawan key={form === 'baru' ? 'baru' : form.id} awal={form === 'baru' ? null : form} departemen={departemen} onBatal={() => setForm(null)} onSimpan={simpan} />}

      <div className="fld" style={{ maxWidth: 420 }}>
        <label htmlFor="cari">Cari karyawan</label>
        <input className="input" id="cari" type="search" placeholder="Nama, NIK, atau departemen" value={cari} onChange={(e) => setCari(e.target.value)} />
      </div>

      {!list ? <Memuat /> : (
        <div className="glass tablebox">
          <div className="scroll">
            <table>
              <thead><tr><th>Karyawan</th><th>NIK</th><th>Departemen</th><th className="n">Upah sebulan</th><th className="n">Upah sejam</th><th>Status QR</th><th>Aksi</th></tr></thead>
              <tbody>
                {tampil.length ? tampil.map((k) => (
                  <tr key={k.id}>
                    <td><span className="namecell"><Avatar nama={k.nama} kunci={k.id} kecil />{k.nama}</span></td>
                    <td className="num">{k.nik}</td>
                    <td>{k.departemen}</td>
                    <td className="n">{angka(k.upahBulanan)}</td>
                    <td className="n">{angka(k.upahSejam)}</td>
                    <td>
                      {!k.aktif ? <span className="badge b-mute">Nonaktif</span>
                        : k.perluCetakUlang ? <span className="badge b-warn">QR diganti · cetak ulang</span>
                          : <span className="badge b-ok">Aktif</span>}
                    </td>
                    <td>
                      <div className="rowacts">
                        <button type="button" className="link" onClick={() => setKartu(k)}>ID card</button>
                        <button type="button" className="link" onClick={() => setForm(k)}>Edit</button>
                        <button type="button" className="link" onClick={() => setGanti(k)}>Ganti QR</button>
                        <button type="button" className={`link${k.aktif ? ' danger' : ''}`} onClick={() => aturAktif(k)}>{k.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>
                      </div>
                    </td>
                  </tr>
                )) : <tr><td colSpan={7}><div className="empty">{list.length ? `Tidak ada karyawan yang cocok dengan "${cari}".` : 'Belum ada karyawan. Tambahkan karyawan pertama dengan tombol di atas.'}</div></td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="glass note">
        <Tile icon="info" warna="t-indigo" size={40} />
        <span><b>Ganti QR</b> membuat token baru. Kartu lama langsung ditolak saat discan, jadi pakai saat ID card hilang. Buka <b>ID card</b> untuk mencetak atau mengunduh kartu.</span>
      </div>

      {kartu && (
        <IdCard
          karyawan={kartu}
          onClose={() => setKartu(null)}
          onSudahDicetak={async () => {
            try {
              const k = await api(`/api/karyawan/${kartu.id}/sudah-dicetak`, { method: 'POST' });
              setKartu(k);
              muat();
              toast(`ID card ${k.nama} ditandai sudah dicetak`);
            } catch (e) { toast(e.message, true); }
          }}
        />
      )}

      {ganti && (
        <Konfirmasi
          judul={`Ganti QR ${ganti.nama}?`}
          isi="Token baru dibuat dan kartu lama langsung ditolak saat discan. Cetak ulang ID card setelah ini."
          labelOk="Ganti QR"
          onBatal={() => setGanti(null)}
          onOk={async () => {
            try {
              const k = await api(`/api/karyawan/${ganti.id}/ganti-qr`, { method: 'POST' });
              setGanti(null);
              muat();
              setKartu(k);
              toast(`QR ${k.nama} diganti`);
            } catch (e) { toast(e.message, true); }
          }}
        />
      )}
    </>
  );
}
