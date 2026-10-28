import { useCallback, useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import Icon from '../../components/Icon.jsx';
import { Avatar, Tile, useToast } from '../../components/ui.jsx';
import { hariIniWIB, jamFmt, rp, tanggalPanjang, tanggalPendek } from '../../format.js';

const REGION = 'qr-region';
const REGION_FILE = 'qr-file-region';

function pesanKamera(err) {
  const s = String(err?.name || err?.message || err);
  if (/NotAllowed|Permission/i.test(s)) return 'Izin kamera ditolak. Buka pengaturan browser, izinkan kamera untuk situs ini, lalu muat ulang.';
  if (/NotFound|Requested device not found/i.test(s)) return 'Kamera tidak ditemukan di perangkat ini.';
  if (/NotReadable|Could not start/i.test(s)) return 'Kamera sedang dipakai aplikasi lain. Tutup aplikasi itu lalu coba lagi.';
  if (/secure|https/i.test(s)) return 'Kamera hanya bisa dibuka lewat HTTPS.';
  return 'Kamera tidak bisa dibuka. Gunakan tombol foto QR di bawah.';
}

function getar(pola) {
  try { navigator.vibrate?.(pola); } catch { /* tidak didukung */ }
}

function HasilScan({ hasil, onTutup }) {
  const ok = hasil.status === 'OK';
  const durasi = ok ? 4 : 6;
  useEffect(() => {
    const t = setTimeout(onTutup, durasi * 1000);
    return () => clearTimeout(t);
  }, [onTutup, durasi]);

  const k = hasil.karyawan;
  return (
    <div className="result" role="dialog" aria-modal="true" aria-label={ok ? 'Lembur tercatat' : 'Tap ditolak'} style={{ '--rc': ok ? '#BFF2E5' : '#FFD6D0' }}>
      <div className="result-in">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
          <div className={`orb ${ok ? 'ok' : 'no'}`}><div className="ball"><Icon name={ok ? 'check' : 'alert'} /></div></div>
          <h2 style={{ margin: '6px 0 0', fontSize: 26, fontWeight: 800, letterSpacing: '-.02em' }}>
            {ok ? 'Lembur tercatat' : ({ SUDAH_TAP: 'Sudah tap hari ini', QR_LAMA: 'QR sudah tidak berlaku', QR_TIDAK_DIKENAL: 'QR tidak dikenal', KARYAWAN_NONAKTIF: 'Karyawan nonaktif' }[hasil.kode] || 'Tap gagal')}
          </h2>
          {!ok && <p className="muted" style={{ margin: 0, maxWidth: 320 }}>{hasil.pesan}</p>}
        </div>

        {k && (
          <div className="glass who">
            <Avatar nama={k.nama} kunci={k.id} />
            <div><b style={{ fontSize: 17 }}>{k.nama}</b><div className="muted" style={{ fontSize: 13 }}>NIK {k.nik} · {k.departemen}</div></div>
          </div>
        )}

        {ok ? (
          <>
            <div className="glass kv">
              <div><span>Tanggal</span><b>{tanggalPendek(hasil.tap.tanggal)}</b></div>
              <div><span>Waktu tap</span><b className="num">{hasil.tap.jam} WIB</b></div>
              <div><span>Jenis hari</span><b><span className={`badge ${hasil.tap.jenisHari === 'KERJA' ? 'b-ok' : 'b-warn'}`}>{hasil.label}</span></b></div>
              <div><span>Jam hitung</span><b className="num">{jamFmt(hasil.tap.jamHitung)} jam</b></div>
              <div><span>Upah sejam (1/173)</span><b className="num">{rp(hasil.tap.upahSejam)}</b></div>
            </div>
            <div className="dark" style={{ borderRadius: 22, padding: '16px 18px' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navyMuted)' }}>Upah lembur</div>
              <div className="num" style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-.02em' }}>{rp(hasil.tap.nominal)}</div>
              <div className="num" style={{ fontSize: 12, color: 'var(--navyMuted)' }}>{jamFmt(hasil.tap.jamHitung)} × {rp(hasil.tap.upahSejam)}</div>
            </div>
          </>
        ) : (
          (hasil.tapPertama || hasil.jam) && (
            <div className="kv bad">
              {hasil.tapPertama && <div><span>Tap pertama</span><b className="num">{hasil.tapPertama.jam} WIB</b></div>}
              {hasil.jam && <div><span>Tap barusan</span><b className="num">{hasil.jam} WIB</b></div>}
              {hasil.tapPertama && <div><span>Petugas tap pertama</span><b>{hasil.tapPertama.petugas}</b></div>}
            </div>
          )
        )}

        <div style={{ flex: 1 }} />
        <div className="countdown" aria-hidden="true" style={{ '--cd': `${durasi}s` }}><i /></div>
        <button type="button" autoFocus className={`btn lg${ok ? '' : ' ink'}`} onClick={onTutup}>
          {ok ? 'Scan berikutnya' : 'Kembali ke scanner'}
        </button>
      </div>
    </div>
  );
}

export default function Scan() {
  const { user } = useAuth();
  const toast = useToast();
  const scannerRef = useRef(null);
  const sibukRef = useRef(false);
  const terakhirRef = useRef({ teks: '', t: 0 });
  const [kamera, setKamera] = useState({ status: 'memulai', pesan: '' });
  const [hari, setHari] = useState(null);
  const [riwayat, setRiwayat] = useState(null);
  const [hasil, setHasil] = useState(null);
  const [kirimFoto, setKirimFoto] = useState(false);

  const muatRiwayat = useCallback(() => {
    api('/api/scan/saya').then(setRiwayat).catch(() => {});
  }, []);

  useEffect(() => {
    api('/api/scan/hari-ini').then(setHari).catch(() => {});
    muatRiwayat();
  }, [muatRiwayat]);

  const kirimToken = useCallback(async (token) => {
    try {
      const r = await api('/api/scan', { method: 'POST', body: { token } });
      getar(80);
      setHasil(r);
      muatRiwayat();
    } catch (err) {
      if (err.data?.status === 'DITOLAK') {
        getar([60, 60, 60]);
        setHasil(err.data);
        muatRiwayat();
      } else {
        toast(err.message, true);
        sibukRef.current = false;
        try { scannerRef.current?.resume(); } catch { /* belum jalan */ }
      }
    }
  }, [muatRiwayat, toast]);

  const onDecode = useCallback((teks) => {
    const now = Date.now();
    if (sibukRef.current) return;
    // Abaikan QR yang sama yang masih tertangkap kamera beberapa detik
    if (teks === terakhirRef.current.teks && now - terakhirRef.current.t < 5000) return;
    terakhirRef.current = { teks, t: now };
    sibukRef.current = true;
    try { scannerRef.current?.pause(true); } catch { /* abaikan */ }
    kirimToken(teks.trim());
  }, [kirimToken]);

  useEffect(() => {
    const scanner = new Html5Qrcode(REGION, { verbose: false });
    scannerRef.current = scanner;
    let aktif = true;
    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: (w, h) => { const s = Math.floor(Math.min(w, h) * 0.7); return { width: s, height: s }; }, aspectRatio: 1 },
      onDecode,
      () => {},
    ).then(() => { if (aktif) setKamera({ status: 'nyala', pesan: '' }); })
      .catch((err) => { if (aktif) setKamera({ status: 'gagal', pesan: pesanKamera(err) }); });

    return () => {
      aktif = false;
      if (scanner.isScanning) scanner.stop().then(() => scanner.clear()).catch(() => {});
    };
  }, [onDecode]);

  const tutupHasil = useCallback(() => {
    setHasil(null);
    sibukRef.current = false;
    try { scannerRef.current?.resume(); } catch { /* kamera tidak jalan */ }
  }, []);

  async function scanFoto(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setKirimFoto(true);
    const fileScanner = new Html5Qrcode(REGION_FILE, { verbose: false });
    try {
      const teks = await fileScanner.scanFile(file, false);
      sibukRef.current = true;
      try { scannerRef.current?.pause(true); } catch { /* abaikan */ }
      await kirimToken(teks.trim());
    } catch {
      toast('QR tidak terbaca. Foto lebih dekat, terang, dan tidak miring.', true);
    } finally {
      fileScanner.clear();
      setKirimFoto(false);
    }
  }

  const tanggal = hari?.tanggal || hariIniWIB();
  const tercatat = riwayat?.tercatat || [];
  const libur = hari?.jenis === 'LIBUR';

  return (
    <main className="p-body">
      <div className="p-head">
        <div><h1>Scan lembur</h1><p>{tanggalPanjang(tanggal)}</p></div>
        <Avatar nama={user.nama || user.username} kunci={user.username} kecil />
      </div>

      <div className="glass" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderRadius: 16, padding: '10px 12px 10px 14px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 700, color: libur ? 'var(--amberInk)' : 'var(--tealInk)' }}>
          <span className={`dot${libur ? ' amber' : ''}`} />
          {hari ? `${hari.label}${hari.keterangan ? ` · ${hari.keterangan}` : ''}` : 'Memeriksa jenis hari…'}
        </span>
        {hari && <span className={`badge ${libur ? 'b-warn' : 'b-ok'} num`}>{jamFmt(hari.jam)} jam / tap</span>}
      </div>

      <div className="vf">
        <div id={REGION} />
        {kamera.status !== 'nyala' && (
          <div className="vf-msg">
            {kamera.status === 'memulai' ? <><span className="spin" />Membuka kamera…</> : <><Icon name="camera" size={32} />{kamera.pesan}</>}
          </div>
        )}
        <div className="vf-foot">
          <label className="btn key sm" htmlFor="foto-qr" style={{ flex: 1 }}>
            <Icon name="camera" size={18} />{kirimFoto ? 'Membaca foto…' : 'Pakai foto QR'}
          </label>
          <input className="sr" type="file" id="foto-qr" accept="image/*" capture="environment" onChange={scanFoto} />
        </div>
      </div>
      <div id={REGION_FILE} hidden />
      <p className="hint">Arahkan QR di ID card ke kotak. Kalau kamera bermasalah, pakai foto QR.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}>
        <div className="glass" style={{ borderRadius: 18, padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Tile icon="check" warna="t-teal" size={40} />
          <div><div style={{ fontSize: 12, fontWeight: 600 }} className="muted">Tap saya hari ini</div><div className="num" style={{ fontSize: 22, fontWeight: 800 }}>{tercatat.length}</div></div>
        </div>
        <div className="glass" style={{ borderRadius: 18, padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Tile icon="clock" warna="t-indigo" size={40} />
          <div><div style={{ fontSize: 12, fontWeight: 600 }} className="muted">Tap terakhir</div><div className="num" style={{ fontSize: 22, fontWeight: 800 }}>{tercatat[0]?.jam || '–'}</div></div>
        </div>
      </div>

      <div className="glass list">
        {tercatat.length ? tercatat.slice(0, 3).map((t) => (
          <div className="li" key={t.id}>
            <div className="t"><b>{t.karyawan.nama}</b><span>{t.jam} · {t.karyawan.departemen} · {jamFmt(t.jamHitung)} jam</span></div>
            <span className="v num">{rp(t.nominal)}</span>
          </div>
        )) : <div className="empty">Belum ada tap hari ini. Tap pertama akan muncul di sini.</div>}
      </div>

      {hasil && <HasilScan hasil={hasil} onTutup={tutupHasil} />}
    </main>
  );
}
