import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import Icon from '../../components/Icon.jsx';
import { Memuat, useToast } from '../../components/ui.jsx';
import { jamFmt, namaBulan, rp, tanggalPendek } from '../../format.js';
import Lonceng from './Lonceng.jsx';
import { tanganiError, unduhSlip } from './bersama.js';

export default function Riwayat() {
  const { user } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [cari, setCari] = useSearchParams();
  const bulan = cari.get('bulan') || '';
  const [d, setD] = useState(null);
  const [slip, setSlip] = useState(false);

  const muat = useCallback(() => {
    setD(null);
    api(`/api/portal/ringkasan${bulan ? `?bulan=${bulan}` : ''}`).then(setD).catch((e) => tanganiError(e, { toast, nav }));
  }, [bulan, toast, nav]);
  useEffect(() => { muat(); }, [muat]);

  return (
    <main className="p-body">
      <div className="p-head"><div><h1>Riwayat lembur</h1><p>Semua tap atas nama Anda</p></div><Lonceng /></div>

      <div className="fld">
        <label htmlFor="bln">Periode</label>
        <select className="input" id="bln" value={d?.bulan || bulan} onChange={(e) => setCari({ bulan: e.target.value }, { replace: true })}>
          {(d?.bulanTersedia || [bulan].filter(Boolean)).map((b) => <option key={b} value={b}>{namaBulan(b)}</option>)}
        </select>
      </div>

      {!d ? <Memuat /> : (
        <>
          <div className="dark hero">
            <span className="lbl">Total {namaBulan(d.bulan)}</span>
            <span className="big num">{rp(d.total.nominal)}</span>
            <span className="sub num">{d.total.tapKerja} hari kerja × 5,5 jam · {d.total.tapLibur} libur × 14 jam = {jamFmt(d.total.jamHitung)} jam hitung</span>
          </div>

          <div className="glass list">
            {d.taps.length ? d.taps.map((t) => (
              <div className="li" key={t.id}>
                <div className="t">
                  <b>
                    {tanggalPendek(t.tanggal)}
                    <span className={`badge ${t.jenisHari === 'KERJA' ? 'b-ok' : 'b-warn'}`} style={{ marginLeft: 8, padding: '2px 8px' }}>{t.jenisHari === 'KERJA' ? 'Kerja' : 'Libur'}</span>
                    {t.manual && <span className="badge b-ink" style={{ marginLeft: 6, padding: '2px 8px' }}>Manual</span>}
                  </b>
                  <span className="num">{t.jam} WIB · {jamFmt(t.jamHitung)} jam × {rp(t.upahSejam)}</span>
                </div>
                <span className="v num">{rp(t.nominal)}</span>
              </div>
            )) : <div className="empty">Belum ada lembur di {namaBulan(d.bulan)}.</div>}
          </div>

          <button type="button" className="btn lg" disabled={slip} onClick={async () => {
            setSlip(true);
            try { await unduhSlip(d.bulan, user.nik); } catch (e) { tanganiError(e, { toast, nav }); } finally { setSlip(false); }
          }}><Icon name="down" size={20} />{slip ? 'Menyiapkan slip…' : `Unduh slip ${namaBulan(d.bulan)} (PDF)`}</button>
          <p className="hint">Upah sejam = 1/173 × upah sebulan, sesuai upah saat tap. Label Manual berarti ditambahkan HRD.</p>
        </>
      )}
    </main>
  );
}
