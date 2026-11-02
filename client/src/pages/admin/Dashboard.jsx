import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { Memuat, Stat, useToast } from '../../components/ui.jsx';
import { jamFmt, labelRentang, namaBulan, rp, tanggalPanjang, tanggalPendek } from '../../format.js';

export default function Dashboard() {
  const toast = useToast();
  const [d, setD] = useState(null);

  useEffect(() => {
    api('/api/dashboard').then(setD).catch((e) => toast(e.message, true));
  }, [toast]);

  if (!d) return <Memuat />;

  const { komposisi: k, perDepartemen } = d.bulan;
  const totalJam = k.jamKerja + k.jamLibur;
  const pKerja = totalJam ? Math.round((k.jamKerja / totalJam) * 1000) / 10 : 0;
  const totalTap = k.tapKerja + k.tapLibur;
  const max = perDepartemen[0]?.nominal || 1;

  const perhatian = [
    ...(d.perhatian.ditolak.length ? [['rose', `${d.perhatian.ditolak.length} tap ditolak hari ini (${d.perhatian.ditolak.slice(0, 3).map((x) => `${x.karyawan || 'QR tak dikenal'}, ${x.jam}`).join('; ')})`]] : []),
    ...d.perhatian.perluCetak.map((x) => ['amber', `ID card ${x.nama} perlu dicetak ulang karena QR sudah diganti`]),
    ...(d.perhatian.liburBerikutnya ? [['indigo', `Hari libur berikutnya: ${tanggalPendek(d.perhatian.liburBerikutnya.tanggal)} · ${d.perhatian.liburBerikutnya.keterangan}`]] : []),
  ];

  return (
    <>
      <div className="ph">
        <div><h1>Dashboard</h1><p>{tanggalPanjang(d.tanggal)} · {d.hari.label} ({jamFmt(d.hari.jam)} jam per tap)</p></div>
      </div>

      <div className="stats">
        <Stat icon="check" warna="t-teal" label="Sudah tap hari ini" nilai={<>{d.hariIni.tap} <span style={{ fontSize: 16, color: 'var(--muted)' }}>/ {d.hariIni.karyawanAktif}</span></>} sub="karyawan aktif" />
        <Stat icon="clock" warna="t-indigo" label="Jam hitung hari ini" nilai={jamFmt(d.hariIni.jamHitung)} sub={`${d.hariIni.tap} tap`} />
        <Stat icon="coin" warna="t-amber" label="Upah lembur hari ini" nilai={rp(d.hariIni.nominal)} />
        <Stat icon="chart" warna="t-teal" gelap label={`Upah lembur periode ${namaBulan(d.bulan.bulan)}`} nilai={rp(d.bulan.nominal)} sub={<Link to="/admin/rekap" style={{ color: '#8FEFD9', fontWeight: 700 }}>Lihat rekap</Link>} />
      </div>

      <div className="cols">
        <section className="glass panel c3">
          <h2>Upah lembur per departemen</h2>
          <p className="sub">Periode {labelRentang(d.bulan.bulan)}</p>
          {perDepartemen.length ? perDepartemen.map((p) => (
            <div className="barrow" key={p.departemen}>
              <div className="h"><span>{p.departemen}</span><span className="num" style={{ fontWeight: 800 }}>{rp(p.nominal)}</span></div>
              <div className="track"><div className="fill" style={{ width: `${((p.nominal / max) * 100).toFixed(1)}%` }} /></div>
            </div>
          )) : <div className="empty">Belum ada lembur di periode ini.</div>}

          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Komposisi jam hitung</h3>
            <div className="track" style={{ height: 20, borderRadius: 10 }} role="img" aria-label={`Hari kerja ${jamFmt(k.jamKerja)} jam, libur ${jamFmt(k.jamLibur)} jam`}>
              <div className="fill" style={{ width: `${pKerja}%`, borderRadius: 0 }} />
              <div className="fill amb" style={{ width: `${totalJam ? 100 - pKerja : 0}%`, borderRadius: 0 }} />
            </div>
            <div className="legend">
              <span><i style={{ background: 'linear-gradient(180deg,#5BE6C7,#0B6656)' }} />Hari kerja · {k.tapKerja} tap · {jamFmt(k.jamKerja)} jam</span>
              <span><i style={{ background: 'linear-gradient(180deg,#FFD58A,#C9650A)' }} />Libur · {k.tapLibur} tap · {jamFmt(k.jamLibur)} jam</span>
            </div>
            {totalTap > 0 && k.tapLibur > 0 && (
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                Tap libur {Math.round((k.tapLibur / totalTap) * 100)}% dari jumlah tap, tapi menyumbang {Math.round(100 - pKerja)}% jam hitung.
              </p>
            )}
          </div>
        </section>

        <div className="c2">
          <section className="glass panel">
            <h2>Tap terbaru</h2>
            <div className="list" style={{ padding: 0 }}>
              {d.terbaru.length ? d.terbaru.map((t) => (
                <div className="li" key={t.id}>
                  <div className="t"><b>{t.karyawan.nama}</b><span>{tanggalPendek(t.tanggal)} {t.jam} · {t.petugas}</span></div>
                  <span className="v num">{rp(t.nominal)}</span>
                </div>
              )) : <div className="empty">Belum ada tap.</div>}
            </div>
          </section>
          <section className="glass panel">
            <h2>Perlu perhatian</h2>
            {perhatian.length ? perhatian.map(([w, teks]) => (
              <div key={teks} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', fontSize: 14 }}>
                <span className={`dot ${w}`} style={{ marginTop: 5 }} /><span>{teks}</span>
              </div>
            )) : <div className="empty">Semua aman.</div>}
          </section>
        </div>
      </div>
    </>
  );
}
