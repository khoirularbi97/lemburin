import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api.js';
import Icon from '../../components/Icon.jsx';
import { Konfirmasi, useToast } from '../../components/ui.jsx';
import { bulanPendek, hariIniWIB, namaBulan, tanggalPanjang, tanggalPendek } from '../../format.js';

const pad = (n) => String(n).padStart(2, '0');

export default function Libur() {
  const toast = useToast();
  const hariIni = hariIniWIB();
  const [list, setList] = useState([]);
  const [bulan, setBulan] = useState(hariIni.slice(0, 7));
  const [tanggal, setTanggal] = useState('');
  const [ket, setKet] = useState('');
  const [hapus, setHapus] = useState(null);

  const muat = useCallback(() => api('/api/libur').then(setList).catch((e) => toast(e.message, true)), [toast]);
  useEffect(() => { muat(); }, [muat]);

  const peta = useMemo(() => new Map(list.map((h) => [h.tanggal, h.keterangan])), [list]);

  const [y, m] = bulan.split('-').map(Number);
  const jumlahHari = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const awal = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // Senin = 0

  function geser(n) {
    let mm = m + n; let yy = y;
    if (mm < 1) { mm = 12; yy -= 1; }
    if (mm > 12) { mm = 1; yy += 1; }
    setBulan(`${yy}-${pad(mm)}`);
  }

  async function simpan(e) {
    e.preventDefault();
    try {
      await api('/api/libur', { method: 'POST', body: { tanggal, keterangan: ket } });
      toast(`${tanggalPendek(tanggal)} ditandai sebagai hari libur`);
      setBulan(tanggal.slice(0, 7));
      setTanggal(''); setKet('');
      muat();
    } catch (err) { toast(err.message, true); }
  }

  return (
    <>
      <div className="ph"><div><h1>Kalender hari libur</h1><p>Tanggal di daftar ini dihitung 14 jam per tap, sama seperti Sabtu dan Minggu. Klik tanggal untuk menambahkannya.</p></div></div>
      <div className="cols">
        <section className="glass panel c3">
          <div className="cal-h">
            <button type="button" className="btn key sm" aria-label="Bulan sebelumnya" onClick={() => geser(-1)}><Icon name="left" size={18} /></button>
            <h2>{namaBulan(bulan)}</h2>
            <button type="button" className="btn key sm" aria-label="Bulan berikutnya" onClick={() => geser(1)}><Icon name="right" size={18} /></button>
          </div>
          <div className="cal-dow" aria-hidden="true">{['SEN', 'SEL', 'RAB', 'KAM', 'JUM', 'SAB', 'MIN'].map((d) => <span key={d}>{d}</span>)}</div>
          <div className="cal">
            {Array.from({ length: awal }, (_, i) => <span key={`e${i}`} className="d e" aria-hidden="true" />)}
            {Array.from({ length: jumlahHari }, (_, i) => {
              const tgl = `${bulan}-${pad(i + 1)}`;
              const dow = new Date(`${tgl}T00:00:00Z`).getUTCDay();
              const lib = peta.get(tgl);
              const cls = lib ? ' h' : dow === 0 || dow === 6 ? ' w' : '';
              return (
                <button
                  type="button"
                  key={tgl}
                  className={`d${cls}${tgl === hariIni ? ' today' : ''}`}
                  aria-label={`${tanggalPanjang(tgl)}${lib ? `, ${lib}` : ''}`}
                  onClick={() => { setTanggal(tgl); document.getElementById('lib-ket')?.focus(); }}
                >
                  <small>{lib || ''}</small><span>{i + 1}</span>
                </button>
              );
            })}
          </div>
          <div className="legend">
            <span><i style={{ background: 'linear-gradient(180deg,#fff,#F1F3FA)', border: '1px solid #DADEEB' }} />Hari kerja · 5,5 jam</span>
            <span><i style={{ background: 'linear-gradient(180deg,#FFF6E6,#FFE7C2)', border: '1px solid #F5CF95' }} />Sabtu/Minggu · 14 jam</span>
            <span><i style={{ background: 'linear-gradient(160deg,#FFD58A,#F29A2E)' }} />Hari libur · 14 jam</span>
          </div>
        </section>

        <div className="c2">
          <form className="glass panel" onSubmit={simpan}>
            <h2>Tambah hari libur</h2>
            <div className="fld"><label htmlFor="lib-tgl">Tanggal</label><input className="input" type="date" id="lib-tgl" required value={tanggal} onChange={(e) => setTanggal(e.target.value)} /></div>
            <div className="fld"><label htmlFor="lib-ket">Keterangan</label><input className="input" id="lib-ket" required placeholder="Contoh: Cuti bersama" value={ket} onChange={(e) => setKet(e.target.value)} /></div>
            <button type="submit" className="btn">Simpan</button>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>Libur yang tanggalnya berubah tiap tahun (Idulfitri, Waisak, Imlek, cuti bersama) diisi dari SKB resmi pemerintah.</p>
          </form>

          <section className="glass panel">
            <h2>Semua hari libur</h2>
            {list.length ? list.map((h) => (
              <div key={h.tanggal} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <span className="hdate"><b>{Number(h.tanggal.slice(8))}</b><span>{bulanPendek(h.tanggal)}</span></span>
                  <div style={{ minWidth: 0 }}><b style={{ fontSize: 14 }}>{tanggalPendek(h.tanggal)} {h.tanggal.slice(0, 4)}</b><div className="muted" style={{ fontSize: 13 }}>{h.keterangan}</div></div>
                </div>
                <button type="button" className="link danger" onClick={() => setHapus(h)}>Hapus</button>
              </div>
            )) : <div className="empty">Belum ada hari libur.</div>}
          </section>
        </div>
      </div>

      {hapus && (
        <Konfirmasi
          judul="Hapus hari libur?"
          isi={`${tanggalPanjang(hapus.tanggal)} · ${hapus.keterangan}. Tap yang sudah tercatat tidak berubah.`}
          labelOk="Hapus"
          bahaya
          onBatal={() => setHapus(null)}
          onOk={async () => {
            try {
              await api(`/api/libur/${hapus.tanggal}`, { method: 'DELETE' });
              toast('Hari libur dihapus');
              setHapus(null);
              muat();
            } catch (e) { toast(e.message, true); }
          }}
        />
      )}
    </>
  );
}
