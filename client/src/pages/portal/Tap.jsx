import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import Icon from '../../components/Icon.jsx';
import KameraWajah from '../../components/KameraWajah.jsx';
import { Konfirmasi, Memuat, Tile, useToast } from '../../components/ui.jsx';
import { jamFmt, rp, tanggalPanjang, tanggalPendek } from '../../format.js';
import { hitungLemburAktual } from '../../lib/hitungAktual.js';
import { useKamera } from '../petugas/useKamera.js';
import { tanganiError } from './bersama.js';
import { ambilLokasi, teksLokasi } from '../../lib/lokasi.js';

const durasi = (menit) => `${Math.floor(menit / 60)} jam ${menit % 60} menit`;
const jamSekarangWIB = () => new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false });

/** Tabel rincian tarif PP 35/2021, mis. 1 jam × 1,5 + 2 jam × 2 */
export function RincianTarif({ rincian, upahSejam }) {
  if (!rincian?.length) return null;
  return (
    <div className="glass kv">
      {rincian.map((r) => (
        <div key={`${r.kali}-${r.jam}`}><span>{jamFmt(r.jam)} jam × {jamFmt(r.kali)}</span><b className="num">{jamFmt(r.jam * r.kali)} jam hitung{upahSejam ? ` · ${rp(r.jam * r.kali * upahSejam)}` : ''}</b></div>
      ))}
    </div>
  );
}

function PindaiQr({ onTerbaca, onBatal, kartu = false }) {
  const toast = useToast();
  const sudah = useRef(false);
  const kamera = useKamera('qr-region', (teks) => {
    if (sudah.current) return;
    if (kartu && teks.startsWith('LQM1.')) { toast('Ini QR dari HP petugas. Untuk tap eksklusif, scan QR di ID card Anda sendiri.', true); return; }
    if (!kartu && !teks.startsWith('LQM1.')) { toast('Ini bukan QR lembur dari HP petugas.', true); return; }
    sudah.current = true;
    kamera.tahan();
    onTerbaca(teks);
  });
  return (
    <>
      <div className="vf">
        <div id="qr-region" />
        {kamera.status !== 'nyala' && (
          <div className="vf-msg">
            {kamera.status === 'memulai' ? <><span className="spin" />Membuka kamera…</> : (
              <><span>{kamera.pesan}</span><button type="button" className="btn sm" onClick={kamera.cobaLagi}>Coba lagi</button></>
            )}
          </div>
        )}
      </div>
      <p className="hint">{kartu ? 'Arahkan kamera ke QR di ID card Anda. Kamera belakang bisa dipakai bergantian dengan meletakkan kartu di meja.' : 'Arahkan kamera ke QR di layar HP petugas. QR berganti tiap 10 detik, jadi pindai langsung dari layarnya.'}</p>
      <div className="acts"><button type="button" className="btn key" onClick={onBatal}>Batal</button></div>
    </>
  );
}

function Persetujuan({ onLanjut, onBatal }) {
  const [setuju, setSetuju] = useState(false);
  return (
    <div className="glass panel">
      <h2>Daftarkan wajah Anda</h2>
      <p className="sub">Wajah dipakai untuk memastikan tap lembur mandiri dilakukan oleh Anda sendiri.</p>
      <ul className="wajah-info">
        <li><b>Yang disimpan:</b> 128 angka ciri wajah dan satu foto kecil wajah untuk diperiksa HRD.</li>
        <li><b>Dipakai untuk:</b> mencocokkan wajah setiap kali Anda tap in / tap out. Tidak untuk keperluan lain.</li>
        <li><b>Saat tap:</b> foto tidak dikirim, hanya angka ciri wajah.</li>
        <li><b>Dihapus:</b> kapan saja lewat halaman ini, atau oleh HRD saat Anda tidak lagi bekerja.</li>
      </ul>
      <label className="chk">
        <input type="checkbox" checked={setuju} onChange={(e) => setSetuju(e.target.checked)} />
        <span>Saya setuju data wajah saya (data pribadi spesifik menurut UU No. 27/2022) diproses untuk keperluan di atas.</span>
      </label>
      <div className="acts">
        <button type="button" className="btn key" onClick={onBatal}>Nanti</button>
        <button type="button" className="btn" disabled={!setuju} onClick={onLanjut}><Icon name="camera" size={18} />Buka kamera depan</button>
      </div>
    </div>
  );
}

function Hasil({ r, upahSejam, onTutup }) {
  const masuk = r.status === 'TAP_IN';
  const eksklusif = r.status === 'OK'; // tap eksklusif: sekali scan
  const nol = r.status === 'TIDAK_DIHITUNG';
  const l = r.lembur;
  return (
    <div className="glass panel tap-hasil">
      <div className={`orb ${nol ? 'no' : 'ok'}`}><span className="ball"><Icon name={nol ? 'alert' : 'check'} /></span></div>
      <h2 style={{ textAlign: 'center' }}>{masuk ? 'Tap in tercatat' : nol ? 'Tidak ada jam lembur' : eksklusif ? 'Tap eksklusif tercatat' : 'Lembur tercatat'}</h2>
      <p style={{ textAlign: 'center', margin: 0 }}>{r.pesan}</p>

      {l && eksklusif && (
        <div className="glass kv">
          <div><span>Tanggal</span><b>{tanggalPendek(l.tanggal)} · {l.jenisHari === 'KERJA' ? 'Hari kerja' : 'Hari libur'}</b></div>
          <div><span>Jam tap</span><b className="num">{l.jamTap} WIB</b></div>
          <div><span>Jam hitung</span><b className="num">{jamFmt(l.jamHitung)} jam</b></div>
          <div><span>Upah lembur</span><b className="num">{rp(l.nominal)}</b></div>
          <div><span>Lokasi HP</span><b>{teksLokasi(r.lokasi)}</b></div>
        </div>
      )}
      {l && !eksklusif && (
        <>
          <div className="glass kv">
            <div><span>Tanggal</span><b>{tanggalPendek(l.tanggal)} · {l.jenisHari === 'KERJA' ? 'Hari kerja' : 'Hari libur'}</b></div>
            <div><span>Tap in – tap out</span><b className="num">{l.jamMulai}–{l.jamSelesai} WIB</b></div>
            {r.hitung?.mulaiDihitung && r.hitung.mulaiDihitung !== l.jamMulai && <div><span>Dihitung mulai</span><b className="num">{r.hitung.mulaiDihitung} ({r.hitung.shift ? `di luar jam ${r.hitung.shift.nama}` : 'jam pulang'})</b></div>}
            {r.hitung?.menitIstirahat > 0 && <div><span>Istirahat dipotong</span><b className="num">{r.hitung.menitIstirahat} menit</b></div>}
            <div><span>Lama lembur dihitung</span><b className="num">{durasi(l.menitLembur)}</b></div>
            <div><span>Jam hitung</span><b className="num">{jamFmt(l.jamHitung)} jam</b></div>
            <div><span>Upah lembur</span><b className="num">{rp(l.nominal)}</b></div>
          </div>
          <RincianTarif rincian={l.rincian} upahSejam={upahSejam} />

          {l.peringatan?.filter((p) => !/jam pulang|tidak dihitung lembur/.test(p)).map((p) => <p key={p} className="hint">⚠ {p}</p>)}
        </>
      )}
      <div className="acts"><button type="button" className="btn" onClick={onTutup} autoFocus>Selesai</button></div>
    </div>
  );
}

export default function Tap() {
  const toast = useToast();
  const nav = useNavigate();
  const [d, setD] = useState(null);
  const [langkah, setLangkah] = useState('status'); // status | setuju | daftar | wajah | qr | kirim | hasil
  const [vektor, setVektor] = useState(null);
  const [cara, setCara] = useState('QR'); // QR = pindai QR petugas, EKSKLUSIF = scan ID card sendiri
  const lokasi = useRef(null);
  const [hasil, setHasil] = useState(null);
  const [tanya, setTanya] = useState(null);
  const [, setDetik] = useState(0);

  const muat = useCallback(() => api('/api/portal/tap').then(setD).catch((e) => tanganiError(e, { toast, nav })), [toast, nav]);
  useEffect(() => { muat(); }, [muat]);
  // Penghitung waktu lembur yang berjalan
  useEffect(() => { const t = setInterval(() => setDetik((n) => n + 1), 30_000); return () => clearInterval(t); }, []);

  const mulaiTap = (c) => {
    setCara(c);
    // Lokasi diminta sejak awal supaya sudah siap saat kartu selesai dipindai
    lokasi.current = c === 'EKSKLUSIF' ? ambilLokasi() : null;
    setLangkah('wajah');
  };

  const kirimTap = async (isi) => {
    setLangkah('kirim');
    try {
      const r = cara === 'EKSKLUSIF'
        ? await api('/api/portal/tap-eksklusif', { method: 'POST', body: { kartu: isi, vektor, hidup: true, lokasi: await lokasi.current } })
        : await api('/api/portal/tap', { method: 'POST', body: { qr: isi, vektor, hidup: true } });
      setHasil(r);
      setLangkah('hasil');
      muat();
    } catch (e) {
      const kode = e.data?.kode;
      toast(e.message, true);
      // QR kedaluwarsa/beda area → pindai ulang; wajah tidak cocok → ulang wajah
      const ulangPindai = kode?.startsWith('QR_') || kode === 'KARTU_BUKAN_MILIK' || kode === 'KARTU_LAMA';
      setLangkah(ulangPindai ? 'qr' : kode === 'WAJAH_TIDAK_COCOK' ? 'wajah' : 'status');
      if (!ulangPindai) muat();
    }
  };

  if (!d) return <main className="p-body"><div className="p-head"><div><h1>Tap lembur</h1></div></div><Memuat /></main>;

  const sesi = d.sesi;
  const lemburHariIni = d.hariIni.lembur;
  // Perkiraan jam hitung kalau tap out sekarang (hasil akhir dihitung server)
  let kira = null;
  if (sesi) {
    try {
      kira = hitungLemburAktual({
        upahBulanan: d.upahSejam * 173, tanggal: sesi.tanggal, mulai: sesi.jamMulai, selesai: jamSekarangWIB(),
        libur: sesi.libur != null ? new Map([[sesi.tanggal, sesi.libur]]) : new Map(), aturan: d.aturan, jamKerja: d.shift,
      });
    } catch { kira = null; }
  }
  const menitJalan = sesi ? Math.max(0, Math.floor((Date.now() - new Date(sesi.mulai).getTime()) / 60000)) : 0;

  return (
    <main className="p-body">
      <div className="p-head">
        <div><h1>Tap lembur</h1><p>{tanggalPanjang(d.hariIni.tanggal)} · {d.hariIni.label}{d.hariIni.keterangan ? ` · ${d.hariIni.keterangan}` : ''}</p></div>
      </div>

      {langkah === 'setuju' && <Persetujuan onBatal={() => setLangkah('status')} onLanjut={() => setLangkah('daftar')} />}

      {langkah === 'daftar' && (
        <KameraWajah
          mode="daftar"
          onBatal={() => setLangkah('status')}
          onHasil={async ({ vektor: v, foto }) => {
            try {
              await api('/api/portal/wajah', { method: 'POST', body: { vektor: v, foto, setuju: true } });
              toast('Wajah terkirim. Tunggu persetujuan HRD.');
            } catch (e) { toast(e.message, true); }
            setLangkah('status');
            muat();
          }}
        />
      )}

      {langkah === 'wajah' && (
        <>
          <div className="glass today"><Tile icon="user" warna="t-indigo" size={40} /><div className="t"><b>Langkah 1 dari 2 · Verifikasi wajah</b><span>{cara === 'EKSKLUSIF' ? 'Untuk tap eksklusif' : sesi ? 'Untuk tap out' : 'Untuk tap in'}</span></div></div>
          <KameraWajah mode="tap" onBatal={() => setLangkah('status')} onHasil={({ vektor: v }) => { setVektor(v); setLangkah('qr'); }} />
        </>
      )}

      {langkah === 'qr' && (
        <>
          <div className="glass today"><Tile icon={cara === 'EKSKLUSIF' ? 'card' : 'qr'} warna="t-teal" size={40} /><div className="t"><b>Langkah 2 dari 2 · {cara === 'EKSKLUSIF' ? 'Scan ID card Anda' : 'Pindai QR petugas'}</b><span>Wajah terverifikasi ✓{cara === 'EKSKLUSIF' ? ' · lokasi HP ikut dicatat' : ''}</span></div></div>
          <PindaiQr key={cara} kartu={cara === 'EKSKLUSIF'} onBatal={() => setLangkah('status')} onTerbaca={kirimTap} />
        </>
      )}

      {langkah === 'kirim' && <Memuat teks="Mencatat tap…" />}

      {langkah === 'hasil' && hasil && <Hasil r={hasil} upahSejam={d.upahSejam} onTutup={() => { setHasil(null); setLangkah('status'); }} />}

      {langkah === 'status' && (
        <>
          {d.wajah !== 'DISETUJUI' ? (
            <div className="glass panel">
              <div className="today" style={{ padding: 0, background: 'none', boxShadow: 'none', border: 0 }}>
                <Tile icon="user" warna={d.wajah === 'DITOLAK' ? 't-rose' : d.wajah === 'MENUNGGU' ? 't-amber' : 't-indigo'} size={44} />
                <div className="t">
                  <b>{d.wajah === 'MENUNGGU' ? 'Wajah menunggu persetujuan HRD' : d.wajah === 'DITOLAK' ? 'Pendaftaran wajah ditolak' : 'Daftarkan wajah dulu'}</b>
                  <span>{d.wajah === 'MENUNGGU' ? 'Tap mandiri bisa dipakai setelah HRD menyetujui foto wajah Anda.'
                    : d.wajah === 'DITOLAK' ? (d.wajahCatatan || 'Silakan daftar ulang.')
                      : 'Tap mandiri memakai verifikasi wajah + QR dari HP petugas.'}</span>
                </div>
              </div>
              {d.wajah !== 'MENUNGGU' && <button type="button" className="btn lg" onClick={() => setLangkah('setuju')}><Icon name="camera" size={20} />{d.wajah === 'DITOLAK' ? 'Daftar ulang wajah' : 'Daftarkan wajah'}</button>}
            </div>
          ) : sesi ? (
            <div className="dark hero">
              <span className="lbl">Sedang lembur sejak {sesi.jamMulai} WIB{sesi.tanggal !== d.hariIni.tanggal ? ` (${tanggalPendek(sesi.tanggal)})` : ''}</span>
              <span className="big num">{durasi(menitJalan)}</span>
              {kira && <span className="sub num">Kalau tap out sekarang ≈ {durasi(kira.menitLembur)} dihitung · {jamFmt(kira.jamHitung)} jam hitung · {rp(kira.nominal)}</span>}
              {kira?.jenisHari === 'KERJA' && kira.mulaiDihitung !== sesi.jamMulai && <span className="sub">{d.shift ? `Jam ${d.shift.nama} (${d.shift.masuk}–${d.shift.pulang}) tidak dihitung lembur.` : `Lembur hari kerja dihitung mulai jam pulang ${kira.mulaiDihitung}.`}</span>}
            </div>
          ) : lemburHariIni ? (
            <div className="glass today">
              <Tile icon="check" warna="t-teal" size={44} />
              <div className="t"><b>Lembur hari ini sudah tercatat</b><span>{lemburHariIni.jamMulai ? `${lemburHariIni.jamMulai}–${lemburHariIni.jamSelesai} WIB · ` : ''}{jamFmt(lemburHariIni.jamHitung)} jam hitung · {rp(lemburHariIni.nominal)}</span></div>
            </div>
          ) : (
            <div className="glass today">
              <Tile icon="clock" warna={d.hariIni.jenis === 'LIBUR' ? 't-amber' : 't-indigo'} size={44} />
              <div className="t"><b>Belum tap in</b><span>{d.hariIni.jenis !== 'KERJA' ? 'Hari libur: lembur dihitung sejak tap in.' : d.shift ? `Hari kerja, ${d.shift.nama} (${d.shift.masuk}–${d.shift.pulang}): lembur dihitung di luar jam shift.` : `Hari kerja: lembur dihitung mulai jam pulang ${d.aturan.jamPulang}.`}</span></div>
            </div>
          )}

          {d.wajah === 'DISETUJUI' && !(lemburHariIni && !sesi) && (
            <button type="button" className={`btn lg${sesi ? ' danger' : ''}`} onClick={() => mulaiTap('QR')}>
              <Icon name="scan" size={20} />{sesi ? 'Tap out — selesai lembur' : 'Tap in — mulai lembur'}{d.eksklusif ? ' (QR petugas)' : ''}
            </button>
          )}
          {d.eksklusif && d.wajah === 'DISETUJUI' && !lemburHariIni && !sesi && (
            <div className="glass panel eksklusif">
              <div className="today" style={{ padding: 0, background: 'none', boxShadow: 'none', border: 0 }}>
                <Tile icon="card" warna="t-amber" size={40} />
                <div className="t"><b>Izin tap eksklusif</b><span>Berlaku sampai {tanggalPendek(d.eksklusif.sampai.slice(0, 10))} · {d.eksklusif.alasan}</span></div>
              </div>
              <button type="button" className="btn key lg" onClick={() => mulaiTap('EKSKLUSIF')}>
                <Icon name="card" size={20} />Tap lembur dengan ID card sendiri
              </button>
              <p className="hint" style={{ margin: 0 }}>Untuk saat petugas tidak ada. Cukup sekali scan, dihitung seperti scan petugas: hari kerja {jamFmt(5.5)} jam, hari libur 14 jam hitung. Wajah + ID card diverifikasi, lokasi HP dicatat untuk HRD.</p>
            </div>
          )}
          {sesi && <button type="button" className="link" style={{ alignSelf: 'center' }} onClick={() => setTanya('batal')}>Batalkan tap in (salah tap)</button>}

          <div className="glass panel">
            <h2 style={{ fontSize: 16 }}>Cara tap mandiri</h2>
            <ol className="langkah-mini">
              <li>Ketuk tombol <b>Tap in</b> saat mulai lembur.</li>
              <li>Verifikasi wajah: lihat lurus, lalu toleh ke kiri dan kanan.</li>
              <li>Pindai QR di HP petugas area Anda.</li>
              <li>Selesai lembur: ulangi dengan tombol <b>Tap out</b>. Jam lembur dihitung otomatis sesuai PP 35/2021.</li>
            </ol>
            <p className="hint">Aturan: {d.aturan.polaKerja} hari kerja/minggu · {d.shift ? `${d.shift.nama} ${d.shift.masuk}–${d.shift.pulang} (grup ${d.shift.grup})` : `jam pulang ${d.aturan.jamPulang}`} · dibulatkan per {d.aturan.pembulatanMenit} menit
              {d.aturan.istirahat?.length ? ` · istirahat ${d.aturan.istirahat.map((r) => `${r.mulai}–${r.selesai}`).join(', ')} tidak dihitung` : ''}.</p>
            {d.wajah !== 'BELUM' && <button type="button" className="link danger" style={{ alignSelf: 'flex-start' }} onClick={() => setTanya('hapus')}>Hapus data wajah saya</button>}
          </div>
        </>
      )}

      {tanya === 'batal' && (
        <Konfirmasi judul="Batalkan tap in?" isi={`Tap in jam ${sesi?.jamMulai} dihapus dan tidak dihitung sebagai lembur.`} labelOk="Batalkan tap in" bahaya
          onBatal={() => setTanya(null)}
          onOk={async () => { setTanya(null); try { await api('/api/portal/tap', { method: 'DELETE' }); toast('Tap in dibatalkan'); } catch (e) { toast(e.message, true); } muat(); }} />
      )}
      {tanya === 'hapus' && (
        <Konfirmasi judul="Hapus data wajah?" isi="Persetujuan dicabut dan data wajah dihapus. Tap mandiri tidak bisa dipakai sampai Anda mendaftar ulang dan disetujui HRD." labelOk="Hapus data wajah" bahaya
          onBatal={() => setTanya(null)}
          onOk={async () => { setTanya(null); try { await api('/api/portal/wajah', { method: 'DELETE' }); toast('Data wajah dihapus'); } catch (e) { toast(e.message, true); } muat(); }} />
      )}
    </main>
  );
}
