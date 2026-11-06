import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import Icon from '../../components/Icon.jsx';
import { Memuat, Tile, useToast } from '../../components/ui.jsx';
import { jamFmt, jamTap, labelRentang, namaBulan, rp, tanggalPanjang, tanggalPendek } from '../../format.js';
import { aktifkanNotifikasi, jenisDukungan, statusLangganan } from '../../push.js';
import Lonceng from './Lonceng.jsx';
import KartuCadangan from './KartuCadangan.jsx';
import { tanganiError, unduhSlip } from './bersama.js';

const KUNCI_TUTUP_NOTIF = 'lq_notif_tutup';

function AjakanNotifikasi() {
  const toast = useToast();
  const [tampil, setTampil] = useState(false);
  const [kunci, setKunci] = useState(null);
  const [proses, setProses] = useState(false);
  const jenis = jenisDukungan();

  useEffect(() => {
    let batal = false;
    try { if (localStorage.getItem(KUNCI_TUTUP_NOTIF)) return undefined; } catch { /* abaikan */ }
    if (jenis !== 'web' && jenis !== 'fcm') return undefined;
    Promise.all([api('/api/portal/saya'), statusLangganan()]).then(([s, aktif]) => {
      if (batal) return;
      const tersedia = jenis === 'web' ? s.push.web : s.push.fcm;
      setKunci(s.push.kunciPublik);
      setTampil(tersedia && !aktif);
    }).catch(() => {});
    return () => { batal = true; };
  }, [jenis]);

  if (!tampil) return null;
  const tutup = () => { setTampil(false); try { localStorage.setItem(KUNCI_TUTUP_NOTIF, '1'); } catch { /* abaikan */ } };

  return (
    <div className="glass today">
      <Tile icon="info" warna="t-indigo" size={40} />
      <div className="t"><b>Aktifkan notifikasi</b><span>Dapat kabar setiap kali lembur Anda tercatat atau pengajuan diproses.</span></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button type="button" className="btn sm" disabled={proses} onClick={async () => {
          setProses(true);
          try { await aktifkanNotifikasi(kunci); toast('Notifikasi aktif'); setTampil(false); } catch (e) { toast(e.message, true); } finally { setProses(false); }
        }}>Aktifkan</button>
        <button type="button" className="link" style={{ fontSize: 12 }} onClick={tutup}>Nanti</button>
      </div>
    </div>
  );
}

export default function Beranda() {
  const { user } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [d, setD] = useState(null);
  const [kartu, setKartu] = useState(false);
  const [slip, setSlip] = useState(false);

  const muat = useCallback(() => {
    api('/api/portal/ringkasan').then(setD).catch((e) => tanganiError(e, { toast, nav }));
  }, [toast, nav]);
  useEffect(() => { muat(); }, [muat]);

  // Segarkan saat aplikasi dibuka lagi (mis. setelah scan di pos petugas)
  useEffect(() => {
    const lihat = () => { if (document.visibilityState === 'visible') muat(); };
    document.addEventListener('visibilitychange', lihat);
    return () => document.removeEventListener('visibilitychange', lihat);
  }, [muat]);

  const namaDepan = (user.nama || '').split(' ')[0];

  return (
    <main className="p-body">
      <div className="p-head">
        <div><h1>Halo, {namaDepan}</h1><p>{d ? tanggalPanjang(d.hariIni.tanggal) : 'Memuat…'}</p></div>
        <Lonceng />
      </div>

      {!d ? <Memuat /> : (
        <>
          <div className="glass today">
            <Tile icon={d.hariIni.tap ? 'check' : 'clock'} warna={d.hariIni.tap ? 't-teal' : d.hariIni.jam === 14 ? 't-amber' : 't-indigo'} size={44} />
            <div className="t">
              <b>{d.hariIni.tap ? 'Lembur hari ini tercatat' : 'Belum ada tap hari ini'}</b>
              <span>
                {d.hariIni.tap
                  ? `${jamTap(d.hariIni.tap)} WIB · ${jamFmt(d.hariIni.tap.jamHitung)} jam · ${rp(d.hariIni.tap.nominal)}`
                  : `${d.hariIni.label}${d.hariIni.keterangan ? ` · ${d.hariIni.keterangan}` : ''} · tap mandiri di menu Tap`}
              </span>
            </div>
          </div>

          <div className="dark hero">
            <span className="lbl">Upah lembur periode {namaBulan(d.bulan)} · {labelRentang(d.bulan)}</span>
            <span className="big num">{rp(d.total.nominal)}</span>
            <span className="sub num">{d.total.tap} tap · {jamFmt(d.total.jamHitung)} jam hitung · upah sejam {rp(user.upahSejam)}</span>
          </div>

          <div className="mini">
            <div className="glass"><span>Hari kerja</span><b className="num">{d.total.tapKerja}</b></div>
            <div className="glass"><span>Hari libur</span><b className="num">{d.total.tapLibur}</b></div>
            <div className="glass"><span>Menunggu HRD</span><b className="num">{d.pengajuanMenunggu}</b></div>
          </div>

          <AjakanNotifikasi />

          <div className="acts2">
            <button type="button" className="btn key" onClick={() => setKartu(true)}><Icon name="qr" size={18} />Kartu QR cadangan</button>
            <button type="button" className="btn key" disabled={slip} onClick={async () => {
              setSlip(true);
              try { await unduhSlip(d.bulan, user.nik); } catch (e) { tanganiError(e, { toast, nav }); } finally { setSlip(false); }
            }}><Icon name="down" size={18} />{slip ? 'Menyiapkan…' : `Slip ${namaBulan(d.bulan).split(' ')[0]}`}</button>
          </div>

          <div className="glass list">
            <div className="li" style={{ borderBottom: 0, paddingBottom: 2 }}>
              <b style={{ fontSize: 15 }}>Lembur terakhir</b>
              <Link className="link" to="/portal/riwayat">Lihat semua</Link>
            </div>
            {d.taps.length ? d.taps.slice(0, 4).map((t) => (
              <div className="li" key={t.id}>
                <div className="t">
                  <b>{tanggalPendek(t.tanggal)}{t.manual && <span className="badge b-ink" style={{ marginLeft: 8, padding: '2px 8px' }}>Manual</span>}</b>
                  <span>{jamTap(t)} WIB · {t.jenisHari === 'KERJA' ? 'Hari kerja' : 'Libur'} · {jamFmt(t.jamHitung)} jam</span>
                </div>
                <span className="v num">{rp(t.nominal)}</span>
              </div>
            )) : <div className="empty">Belum ada lembur di periode ini.</div>}
          </div>

          <p className="hint">Lupa tap? Laporkan lewat menu <Link className="link" to="/portal/pengajuan">Pengajuan</Link>, nanti HRD memeriksa.</p>
        </>
      )}

      {kartu && <KartuCadangan onClose={() => setKartu(false)} />}
    </main>
  );
}
