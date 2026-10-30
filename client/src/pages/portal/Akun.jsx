import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Avatar, useToast } from '../../components/ui.jsx';
import { rp } from '../../format.js';
import { PLATFORM } from '../../platform.js';
import { aktifkanNotifikasi, berhentiLangganan, jenisDukungan, statusLangganan } from '../../push.js';
import Lonceng from './Lonceng.jsx';
import CekNotifikasi from './CekNotifikasi.jsx';
import KartuCadangan from './KartuCadangan.jsx';
import { FormSandi } from './GantiSandi.jsx';

function Notifikasi() {
  const toast = useToast();
  const jenis = jenisDukungan();
  const [info, setInfo] = useState(null);
  const [aktif, setAktif] = useState(false);
  const [proses, setProses] = useState(false);
  const [cek, setCek] = useState(false);

  useEffect(() => {
    api('/api/portal/saya').then((s) => setInfo(s.push)).catch(() => {});
    statusLangganan().then(setAktif).catch(() => {});
  }, []);

  let isi;
  if (jenis === 'pasang-dulu') {
    isi = <p className="hint">Di iPhone, buka lemburin di Safari → Bagikan → <b>Tambah ke Layar Utama</b>, lalu buka dari ikon itu untuk mengaktifkan notifikasi.</p>;
  } else if (jenis === 'tidak') {
    isi = <p className="hint">{PLATFORM === 'android' || PLATFORM === 'ios'
      ? 'Aplikasi ini dibuat tanpa Firebase, jadi notifikasi belum bisa dikirim ke HP. Lihat Periksa notifikasi di bawah.'
      : 'Perangkat atau aplikasi ini belum mendukung notifikasi. Pakai lemburin di Chrome HP atau aplikasi Android yang sudah diatur HRD.'}</p>;
  } else if (info && !(jenis === 'web' ? info.web : info.fcm)) {
    isi = <p className="hint">Notifikasi belum diaktifkan HRD di server.</p>;
  } else {
    isi = (
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className={`badge ${aktif ? 'b-ok' : 'b-mute'}`}>{aktif ? 'Aktif di perangkat ini' : 'Belum aktif'}</span>
        {aktif ? (
          <>
            <button type="button" className="btn sm key" disabled={proses} onClick={async () => {
              setProses(true);
              try {
                const r = await api('/api/portal/push/tes', { method: 'POST' });
                const gagal = r.rincian?.find((x) => !x.ok);
                toast(r.terkirim ? 'Notifikasi uji dikirim. Cek bilah status.' : gagal?.pesan || 'Belum ada perangkat yang menerima', !r.terkirim);
              } catch (e) { toast(e.message, true); } finally { setProses(false); }
            }}>Kirim uji</button>
            <button type="button" className="link danger" disabled={proses} onClick={async () => {
              setProses(true);
              try { await berhentiLangganan(); setAktif(false); toast('Notifikasi dimatikan'); } catch (e) { toast(e.message, true); } finally { setProses(false); }
            }}>Matikan</button>
          </>
        ) : (
          <button type="button" className="btn sm" disabled={proses || !info} onClick={async () => {
            setProses(true);
            try { await aktifkanNotifikasi(info?.kunciPublik); setAktif(true); toast('Notifikasi aktif'); } catch (e) { toast(e.message, true); } finally { setProses(false); }
          }}>Aktifkan notifikasi</button>
        )}
      </div>
    );
  }

  return (
    <div className="glass pj">
      <b>Notifikasi</b>
      <p className="hint">Kabar saat lembur tercatat, ditambahkan HRD, atau pengajuan diproses.</p>
      {isi}
      {cek ? <CekNotifikasi /> : <button type="button" className="link" style={{ alignSelf: 'flex-start' }} onClick={() => setCek(true)}>Periksa notifikasi</button>}
    </div>
  );
}

export default function Akun() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const [kartu, setKartu] = useState(false);
  const [sandi, setSandi] = useState(false);

  return (
    <main className="p-body">
      <div className="p-head"><div><h1>Akun</h1><p>Portal karyawan</p></div><Lonceng /></div>
      <div className="glass who">
        <Avatar nama={user.nama} kunci={user.id} />
        <div><b style={{ fontSize: 17 }}>{user.nama}</b><div className="muted" style={{ fontSize: 13 }}>{user.jabatan} · {user.departemen}</div></div>
      </div>
      <div className="glass kv">
        <div><span>NIK</span><b className="num">{user.nik}</b></div>
        <div><span>Upah sejam (1/173)</span><b className="num">{rp(user.upahSejam)}</b></div>
        <div><span>Hari kerja</span><b>5,5 jam hitung / tap</b></div>
        <div><span>Sabtu, Minggu, tanggal merah</span><b>14 jam hitung / tap</b></div>
      </div>

      <Notifikasi />

      <button type="button" className="btn key lg" onClick={() => setKartu(true)}>Kartu QR cadangan</button>
      {sandi
        ? <FormSandi onSelesai={() => { setSandi(false); toast('Sandi diganti'); }} />
        : <button type="button" className="btn key lg" onClick={() => setSandi(true)}>Ganti sandi</button>}
      <button type="button" className="btn ink lg" onClick={logout}>Keluar</button>
      <p className="hint">Data upah salah atau ganti departemen? Hubungi HRD.</p>

      {kartu && <KartuCadangan onClose={() => setKartu(false)} />}
    </main>
  );
}
