import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';
import { Memuat } from '../../components/ui.jsx';
import { infoPerangkat } from '../../push.js';

function Baris({ ok, judul, isi }) {
  const warna = ok === true ? 'b-ok' : ok === false ? 'b-err' : 'b-mute';
  return (
    <div className="cek">
      <span className={`badge ${warna}`}>{ok === true ? 'OK' : ok === false ? 'Masalah' : '–'}</span>
      <div><b>{judul}</b>{isi && <div className="muted" style={{ fontSize: 13 }}>{isi}</div>}</div>
    </div>
  );
}

/** Daftar periksa: di langkah mana notifikasi berhenti. */
export default function CekNotifikasi() {
  const [d, setD] = useState(null);
  const [uji, setUji] = useState(null);
  const [proses, setProses] = useState(false);

  const muat = useCallback(async () => {
    setD(null);
    const [p, s] = await Promise.all([infoPerangkat(), api('/api/portal/push/status').catch((e) => ({ galat: e.message }))]);
    setD({ p, s });
  }, []);
  useEffect(() => { muat(); }, [muat]);

  if (!d) return <Memuat />;
  const { p, s } = d;
  const hp = p.platform === 'android' || p.platform === 'ios';
  const jenis = hp ? 'FCM' : 'WEB';
  const terdaftar = (s.perangkat || []).filter((x) => x.jenis === jenis);

  return (
    <div className="cek-list">
      {hp ? (
        <Baris
          ok={p.fcmDiBuild}
          judul="APK dibuat dengan Firebase"
          isi={p.fcmDiBuild ? 'google-services.json terpasang.' : 'APK ini dibuat tanpa Firebase. Isi secret GOOGLE_SERVICES_JSON di GitHub (atau VITE_FCM=true + google-services.json kalau build sendiri), lalu build dan pasang APK baru.'}
        />
      ) : (
        <Baris ok={p.jenis === 'web'} judul="Browser mendukung notifikasi" isi={p.jenis === 'pasang-dulu' ? 'iPhone: Tambah ke Layar Utama dulu.' : p.jenis === 'web' ? null : 'Pakai Chrome/Edge/Firefox terbaru.'} />
      )}
      <Baris
        ok={p.izin === 'granted' ? true : p.izin === 'denied' ? false : null}
        judul="Izin notifikasi di perangkat"
        isi={p.izin === 'granted' ? 'Diizinkan.' : p.izin === 'denied' ? 'Ditolak. Buka Pengaturan HP → Aplikasi → lemburin → Notifikasi → izinkan.' : 'Belum diminta. Tekan Aktifkan notifikasi.'}
      />
      <Baris
        ok={s.galat ? false : hp ? s.server.fcm.siap : s.server.web}
        judul={hp ? 'Firebase di server (Render)' : 'Kunci VAPID di server (Render)'}
        isi={s.galat || (hp ? (s.server.fcm.siap ? 'Siap mengirim.' : s.server.fcm.galat) : (s.server.web ? 'Siap mengirim.' : 'VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY belum diisi, lalu deploy ulang.'))}
      />
      <Baris
        ok={terdaftar.length > 0}
        judul="Perangkat terdaftar di server"
        isi={terdaftar.length ? `${terdaftar.length} perangkat: ${terdaftar.map((x) => x.perangkat || x.jenis).join(', ')}` : 'Belum ada. Tekan Aktifkan notifikasi (pastikan langkah di atas sudah OK).'}
      />
      {uji && uji.rincian && (
        <Baris
          ok={uji.terkirim > 0}
          judul="Kirim uji"
          isi={uji.rincian.length ? uji.rincian.map((r) => `${r.perangkat || r.jenis}: ${r.ok ? 'diterima layanan push' : r.pesan}`).join(' · ') : 'Tidak ada perangkat terdaftar.'}
        />
      )}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" className="btn sm key" disabled={proses} onClick={async () => {
          setProses(true);
          try { setUji(await api('/api/portal/push/tes', { method: 'POST' })); } catch (e) { setUji({ terkirim: 0, rincian: [{ ok: false, pesan: e.message }] }); } finally { setProses(false); }
        }}>{proses ? 'Mengirim…' : 'Kirim uji'}</button>
        <button type="button" className="link" onClick={muat}>Periksa ulang</button>
      </div>
      <p className="hint">Kalau semua OK tapi notifikasi tetap tidak muncul saat aplikasi ditutup: matikan penghemat baterai untuk lemburin dan aktifkan Autostart (Xiaomi/Oppo/Vivo/Realme).</p>
    </div>
  );
}
