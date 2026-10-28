import { Fragment, useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';
import Icon from '../../components/Icon.jsx';
import { Avatar, Konfirmasi, Memuat, Stat, useToast } from '../../components/ui.jsx';
import { angka, jamFmt, namaBulan, rp, tanggalPendek } from '../../format.js';

export default function Rekap() {
  const toast = useToast();
  const [daftarBulan, setDaftarBulan] = useState([]);
  const [departemen, setDepartemen] = useState([]);
  const [bulan, setBulan] = useState('');
  const [dept, setDept] = useState('');
  const [data, setData] = useState(null);
  const [buka, setBuka] = useState(null);
  const [hapus, setHapus] = useState(null);
  const [ekspor, setEkspor] = useState(false);

  useEffect(() => {
    api('/api/rekap/bulan').then((b) => { setDaftarBulan(b); setBulan(b[0]); }).catch((e) => toast(e.message, true));
    api('/api/karyawan/departemen').then(setDepartemen).catch(() => {});
  }, [toast]);

  const muat = useCallback(() => {
    if (!bulan) return;
    const q = new URLSearchParams({ bulan, ...(dept ? { departemen: dept } : {}) });
    api(`/api/rekap?${q}`).then(setData).catch((e) => toast(e.message, true));
  }, [bulan, dept, toast]);

  useEffect(() => { setData(null); setBuka(null); muat(); }, [muat]);

  async function unduh() {
    setEkspor(true);
    try {
      const q = new URLSearchParams({ bulan, ...(dept ? { departemen: dept } : {}) });
      const res = await api(`/api/rekap/export?${q}`, { raw: true });
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `rekap-lembur-${bulan}.xlsx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast(`Rekap ${namaBulan(bulan)} diunduh`);
    } catch (e) {
      toast(e.message, true);
    } finally {
      setEkspor(false);
    }
  }

  const rows = data?.rows || [];
  const t = data?.total;

  return (
    <>
      <div className="ph">
        <div><h1>Rekap lembur</h1><p>Hari kerja 5,5 jam hitung per tap · Sabtu, Minggu &amp; tanggal merah 14 jam hitung per tap</p></div>
        <div className="acts">
          <div className="fld">
            <label htmlFor="bulan">Periode</label>
            <select className="input" id="bulan" value={bulan} onChange={(e) => setBulan(e.target.value)} style={{ minWidth: 170 }}>
              {daftarBulan.map((b) => <option key={b} value={b}>{namaBulan(b)}</option>)}
            </select>
          </div>
          <div className="fld">
            <label htmlFor="dept">Departemen</label>
            <select className="input" id="dept" value={dept} onChange={(e) => setDept(e.target.value)} style={{ minWidth: 180 }}>
              <option value="">Semua departemen</option>
              {departemen.map((x) => <option key={x}>{x}</option>)}
            </select>
          </div>
          <button type="button" className="btn" onClick={unduh} disabled={!rows.length || ekspor}>
            <Icon name="down" size={18} />{ekspor ? 'Menyiapkan…' : 'Ekspor Excel'}
          </button>
        </div>
      </div>

      {!data ? <Memuat /> : (
        <>
          <div className="stats">
            <Stat icon="users" warna="t-indigo" label="Karyawan lembur" nilai={rows.length} />
            <Stat icon="scan" warna="t-teal" label="Total tap" nilai={t.tapKerja + t.tapLibur} sub={`${t.tapKerja} hari kerja · ${t.tapLibur} libur`} />
            <Stat icon="clock" warna="t-amber" label="Total jam hitung" nilai={jamFmt(t.jamHitung)} />
            <Stat icon="coin" warna="t-teal" gelap label="Total upah lembur" nilai={rp(t.nominal)} sub={namaBulan(bulan)} />
          </div>

          <div className="glass tablebox">
            <div className="scroll">
              <table>
                <thead>
                  <tr><th>Karyawan</th><th>Departemen</th><th className="n">Upah sebulan</th><th className="n">Upah sejam</th><th className="n">Tap kerja</th><th className="n">Tap libur</th><th className="n">Jam hitung</th><th className="n">Upah lembur</th></tr>
                </thead>
                <tbody>
                  {rows.length ? rows.map((r) => {
                    const terbuka = buka === r.karyawan.id;
                    return (
                      <Fragment key={r.karyawan.id}>
                        <tr
                          className={`click${terbuka ? ' open' : ''}`}
                          tabIndex={0}
                          aria-expanded={terbuka}
                          onClick={() => setBuka(terbuka ? null : r.karyawan.id)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setBuka(terbuka ? null : r.karyawan.id); } }}
                        >
                          <td><span className="namecell"><Avatar nama={r.karyawan.nama} kunci={r.karyawan.id} kecil />{r.karyawan.nama}</span></td>
                          <td>{r.karyawan.departemen}</td>
                          <td className="n">{angka(r.karyawan.upahBulanan)}</td>
                          <td className="n">{angka(r.karyawan.upahSejam)}</td>
                          <td className="n">{r.tapKerja}</td>
                          <td className="n">{r.tapLibur}</td>
                          <td className="n">{jamFmt(r.jamHitung)}</td>
                          <td className="n" style={{ fontWeight: 800 }}>{angka(r.nominal)}</td>
                        </tr>
                        {terbuka && (
                          <tr className="detail">
                            <td colSpan={8}>
                              <div className="detail-in">
                                <b style={{ fontSize: 14 }}>Detail tap {r.karyawan.nama}</b>
                                <div className="scroll">
                                  <table>
                                    <thead><tr><th>Tanggal</th><th>Jam tap</th><th>Jenis</th><th className="n">Jam hitung</th><th className="n">Upah sejam</th><th className="n">Nominal</th><th>Petugas</th><th>Koreksi</th></tr></thead>
                                    <tbody>
                                      {r.taps.map((x) => (
                                        <tr key={x.id}>
                                          <td>{tanggalPendek(x.tanggal)}</td>
                                          <td className="num">{x.jam}</td>
                                          <td><span className={`badge ${x.jenisHari === 'KERJA' ? 'b-ok' : 'b-warn'}`}>{x.jenisHari === 'KERJA' ? 'Hari kerja' : 'Libur'}</span></td>
                                          <td className="n">{jamFmt(x.jamHitung)}</td>
                                          <td className="n">{angka(x.upahSejam)}</td>
                                          <td className="n" style={{ fontWeight: 700 }}>{angka(x.nominal)}</td>
                                          <td>{x.petugas}</td>
                                          <td><button type="button" className="link danger" onClick={() => setHapus({ ...x, nama: r.karyawan.nama })}>Hapus tap</button></td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  }) : <tr><td colSpan={8}><div className="empty">Belum ada lembur di periode ini.</div></td></tr>}
                </tbody>
                {rows.length > 0 && (
                  <tfoot>
                    <tr><td>Total</td><td /><td /><td /><td className="n">{t.tapKerja}</td><td className="n">{t.tapLibur}</td><td className="n">{jamFmt(t.jamHitung)}</td><td className="n" style={{ color: 'var(--tealInk)' }}>{angka(t.nominal)}</td></tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>Upah sejam = 1/173 × upah sebulan (upah pokok + tunjangan tetap), sesuai PP 35/2021. Klik baris karyawan untuk melihat detail tap dan menghapus tap yang keliru.</p>
        </>
      )}

      {hapus && (
        <Konfirmasi
          judul="Hapus tap ini?"
          isi={`Tap ${hapus.nama} tanggal ${tanggalPendek(hapus.tanggal)} pukul ${hapus.jam} (${rp(hapus.nominal)}) akan dihapus dari rekap.`}
          labelOk="Hapus tap"
          bahaya
          onBatal={() => setHapus(null)}
          onOk={async () => {
            try {
              await api(`/api/rekap/tap/${hapus.id}`, { method: 'DELETE' });
              toast('Tap dihapus');
              setHapus(null);
              muat();
            } catch (e) { toast(e.message, true); }
          }}
        />
      )}
    </>
  );
}
