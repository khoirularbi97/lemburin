import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api.js';
import IdCard from '../../components/IdCard.jsx';
import Icon from '../../components/Icon.jsx';
import { Avatar, Konfirmasi, Memuat, Modal, Tile, useToast } from '../../components/ui.jsx';
import { angka } from '../../format.js';

function waktuLogin(iso) {
  return new Date(iso).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short' });
}

function StatusPortal({ k }) {
  if (!k.portal.aktif) return <span className="badge b-mute">Belum aktif</span>;
  if (k.portal.sandiAwal) return <span className="badge b-warn">Sandi awal</span>;
  return <span className="badge b-ok" title={k.portal.loginTerakhir ? `Login terakhir ${waktuLogin(k.portal.loginTerakhir)}` : ''}>Aktif{k.portal.loginTerakhir ? ` · ${waktuLogin(k.portal.loginTerakhir)}` : ''}</span>;
}

/** Sandi awal hanya muncul sekali. Admin menyerahkannya ke karyawan. */
function SandiAwal({ data, onClose }) {
  const toast = useToast();
  const teks = `Portal lemburin\nNIK: ${data.nik}\nSandi awal: ${data.sandiAwal}\nGanti sandi saat pertama masuk.\n${window.location.origin}`;
  return (
    <Modal judul={`Akun portal ${data.nama}`} onClose={onClose}>
      <p>Berikan NIK dan sandi awal ini ke karyawan. Sandi hanya ditampilkan sekali, dan karyawan wajib menggantinya saat pertama masuk.</p>
      <div className="glass kv">
        <div><span>NIK</span><b className="num">{data.nik}</b></div>
        <div><span>Alamat</span><b>{window.location.host}</b></div>
      </div>
      <div className="sandi-awal" aria-label="Sandi awal">{data.sandiAwal}</div>
      <div className="acts">
        <button type="button" className="btn key" onClick={async () => {
          try { await navigator.clipboard.writeText(teks); toast('Disalin. Tempel ke WhatsApp karyawan.'); } catch { toast('Tidak bisa menyalin otomatis. Catat sandinya.', true); }
        }}>Salin untuk dikirim</button>
        <button type="button" className="btn" onClick={onClose} autoFocus>Selesai</button>
      </div>
    </Modal>
  );
}

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

/** Hapus permanen. Kalau sudah ada catatan lembur, admin wajib mengetik NIK karena riwayatnya ikut terhapus. */
function HapusKaryawan({ k, onBatal, onSelesai }) {
  const toast = useToast();
  const [info, setInfo] = useState(null);
  const [nik, setNik] = useState('');
  const [proses, setProses] = useState(false);
  useEffect(() => { api(`/api/karyawan/${k.id}/ringkasan-hapus`).then(setInfo).catch((e) => { toast(e.message, true); onBatal(); }); }, [k.id, toast, onBatal]);
  const wajibNik = info?.lembur > 0;
  const cocok = !wajibNik || nik.trim().toUpperCase() === k.nik;
  async function hapus() {
    setProses(true);
    try {
      await api(`/api/karyawan/${k.id}`, { method: 'DELETE', body: wajibNik ? { konfirmasiNik: nik } : undefined });
      toast(`${k.nama} dihapus`);
      onSelesai();
    } catch (e) { toast(e.message, true); setProses(false); }
  }
  return (
    <Modal judul={`Hapus ${k.nama}?`} onClose={onBatal}>
      {!info ? <Memuat teks="Memeriksa data…" /> : (
        <>
          <p>Karyawan dihapus permanen{wajibNik ? ' beserta semua data di bawah ini' : ''}. ID card dan akun portalnya langsung tidak berlaku.</p>
          {wajibNik && (
            <div className="glass kv">
              <div><span>Catatan lembur</span><b className="num">{info.lembur}</b></div>
              {info.pengajuan > 0 && <div><span>Pengajuan tap</span><b className="num">{info.pengajuan}</b></div>}
              {info.sesi > 0 && <div><span>Tap in terbuka</span><b className="num">{info.sesi}</b></div>}
              {info.wajah > 0 && <div><span>Data wajah</span><b>ikut dihapus</b></div>}
            </div>
          )}
          {wajibNik && <p style={{ color: 'var(--amberInk)' }}>Rekap, slip, dan ekspor periode lalu akan berubah. Untuk karyawan yang keluar/resign, pakai <b>Nonaktifkan</b> agar riwayatnya tetap ada.</p>}
          {wajibNik && (
            <div className="fld">
              <label htmlFor="hapus-nik">Ketik NIK <b>{k.nik}</b> untuk konfirmasi</label>
              <input className="input num" id="hapus-nik" autoComplete="off" autoCapitalize="characters" value={nik} onChange={(e) => setNik(e.target.value)} autoFocus />
            </div>
          )}
          <div className="acts">
            <button type="button" className="btn key" onClick={onBatal}>Batal</button>
            {wajibNik && k.aktif && <button type="button" className="btn key" onClick={() => onSelesai('nonaktif')}>Nonaktifkan saja</button>}
            <button type="button" className="btn danger" disabled={!cocok || proses} autoFocus={!wajibNik} onClick={hapus}>{proses ? 'Menghapus…' : 'Hapus permanen'}</button>
          </div>
        </>
      )}
    </Modal>
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
  const [resetSandi, setResetSandi] = useState(null);
  const [sandiBaru, setSandiBaru] = useState(null);
  const [hapus, setHapus] = useState(null);
  const batalHapus = useCallback(() => setHapus(null), []);

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
      setSandiBaru(k);
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
              <thead><tr><th>Karyawan</th><th>NIK</th><th>Departemen</th><th className="n">Upah sebulan</th><th className="n">Upah sejam</th><th>Status QR</th><th>Portal</th><th>Aksi</th></tr></thead>
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
                    <td><StatusPortal k={k} /></td>
                    <td>
                      <div className="rowacts">
                        <button type="button" className="link" onClick={() => setKartu(k)}>ID card</button>
                        <button type="button" className="link" onClick={() => setForm(k)}>Edit</button>
                        <button type="button" className="link" onClick={() => setGanti(k)}>Ganti QR</button>
                        <button type="button" className="link" onClick={() => setResetSandi(k)}>{k.portal.aktif ? 'Reset sandi portal' : 'Aktifkan portal'}</button>
                        <button type="button" className={`link${k.aktif ? ' danger' : ''}`} onClick={() => aturAktif(k)}>{k.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>
                        <button type="button" className="link danger" onClick={() => setHapus(k)}>Hapus</button>
                      </div>
                    </td>
                  </tr>
                )) : <tr><td colSpan={8}><div className="empty">{list.length ? `Tidak ada karyawan yang cocok dengan "${cari}".` : 'Belum ada karyawan. Tambahkan karyawan pertama dengan tombol di atas.'}</div></td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="glass note">
        <Tile icon="info" warna="t-indigo" size={40} />
        <span><b>Ganti QR</b> membuat token baru. Kartu lama langsung ditolak saat discan, jadi pakai saat ID card hilang. Buka <b>ID card</b> untuk mencetak atau mengunduh kartu. <b>Portal</b> = akun karyawan untuk melihat lembur sendiri (login NIK + sandi). Pakai <b>Reset sandi portal</b> kalau karyawan lupa sandi. Karyawan keluar: <b>Nonaktifkan</b> (riwayat tetap ada). <b>Hapus</b> hanya untuk data salah input.</span>
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

      {resetSandi && (
        <Konfirmasi
          judul={resetSandi.portal.aktif ? `Reset sandi portal ${resetSandi.nama}?` : `Aktifkan portal ${resetSandi.nama}?`}
          isi={resetSandi.portal.aktif
            ? 'Sandi lama langsung tidak berlaku dan karyawan keluar dari semua perangkat. Sandi awal baru akan ditampilkan sekali.'
            : 'Sandi awal dibuat dan ditampilkan sekali. Karyawan masuk dengan NIK dan sandi itu, lalu wajib menggantinya.'}
          labelOk={resetSandi.portal.aktif ? 'Reset sandi' : 'Buat sandi awal'}
          onBatal={() => setResetSandi(null)}
          onOk={async () => {
            try {
              const k = await api(`/api/karyawan/${resetSandi.id}/sandi-portal`, { method: 'POST' });
              setResetSandi(null);
              setSandiBaru(k);
              muat();
            } catch (e) { toast(e.message, true); }
          }}
        />
      )}

      {hapus && (
        <HapusKaryawan
          k={hapus}
          onBatal={batalHapus}
          onSelesai={(aksi) => {
            const k = hapus;
            setHapus(null);
            if (form && form !== 'baru' && form.id === k.id) setForm(null);
            if (aksi === 'nonaktif') aturAktif(k); else muat();
          }}
        />
      )}

      {sandiBaru && <SandiAwal data={sandiBaru} onClose={() => setSandiBaru(null)} />}

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
