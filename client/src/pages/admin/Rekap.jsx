import { Fragment, useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';
import Icon from '../../components/Icon.jsx';
import { Avatar, Konfirmasi, Memuat, Modal, Stat, useToast } from '../../components/ui.jsx';
import { angka, hariIniWIB, jamFmt, namaBulan, rp, tanggalPanjang, tanggalPendek } from '../../format.js';

// Sama dengan aturan server (cekTanggalManual): tanggal 1 bulan lalu sampai hari ini
function batasManual() {
  const max = hariIniWIB();
  const [y, m] = max.split('-').map(Number);
  const min = m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, '0')}-01`;
  return { min, max };
}

function kemarinWIB() {
  const d = new Date(`${hariIniWIB()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function perkiraan(karyawan, tanggal, libur) {
  if (!karyawan || !tanggal) return null;
  const ket = libur.get(tanggal);
  const d = new Date(`${tanggal}T00:00:00Z`).getUTCDay();
  const liburHari = ket !== undefined || d === 0 || d === 6;
  const label = ket !== undefined ? `Tanggal merah${ket ? ` · ${ket}` : ''}` : d === 6 ? 'Sabtu' : d === 0 ? 'Minggu' : 'Hari kerja';
  const jam = liburHari ? 14 : 5.5;
  const sejam = Math.round(karyawan.upahBulanan / 173);
  return { liburHari, label, jam, sejam, nominal: Math.round(jam * sejam) };
}

function TapManual({ onTutup, onSelesai }) {
  const toast = useToast();
  const { min, max } = batasManual();
  const [karyawan, setKaryawan] = useState(null);
  const [libur, setLibur] = useState(new Map());
  const [f, setF] = useState({ karyawanId: '', tanggal: kemarinWIB() < min ? max : kemarinWIB(), jam: '17:00', alasan: '' });
  const [err, setErr] = useState('');
  const [proses, setProses] = useState(false);

  useEffect(() => {
    api('/api/karyawan').then((l) => setKaryawan(l.filter((k) => k.aktif))).catch((e) => setErr(e.message));
    api('/api/libur').then((l) => setLibur(new Map(l.map((h) => [h.tanggal, h.keterangan])))).catch(() => {});
  }, []);

  const pilih = karyawan?.find((k) => String(k.id) === f.karyawanId);
  const est = perkiraan(pilih, f.tanggal, libur);
  const ubah = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setErr(''); };

  async function simpan(e) {
    e.preventDefault();
    if (!f.karyawanId) return setErr('Pilih karyawan dulu.');
    if (!f.tanggal || f.tanggal < min || f.tanggal > max) return setErr(`Tanggal harus antara ${tanggalPendek(min)} dan hari ini.`);
    if (f.alasan.trim().length < 5) return setErr('Alasan wajib diisi, minimal 5 huruf (misalnya nomor SPL).');
    setProses(true);
    try {
      const r = await api('/api/rekap/tap', { method: 'POST', body: { ...f, karyawanId: Number(f.karyawanId), alasan: f.alasan.trim() } });
      toast(`Tap manual ${r.karyawan.nama} ${tanggalPendek(r.tap.tanggal)} tercatat · ${rp(r.tap.nominal)}`);
      onSelesai(r.tap.tanggal.slice(0, 7));
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setProses(false);
    }
  }

  return (
    <Modal judul="Tambah tap manual" onClose={onTutup}>
      <p>Untuk lembur yang lupa di-tap. Jenis hari dan jam hitung tetap dihitung otomatis dari tanggalnya, dan tap ini diberi label <b>Manual</b> di rekap.</p>
      <form onSubmit={simpan} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 14 }} noValidate>
        <div className="fld" style={{ gridColumn: '1 / -1' }}>
          <label htmlFor="tm-k">Karyawan</label>
          <select className="input" id="tm-k" value={f.karyawanId} onChange={ubah('karyawanId')} autoFocus>
            <option value="">{karyawan ? 'Pilih karyawan…' : 'Memuat…'}</option>
            {karyawan?.map((k) => <option key={k.id} value={k.id}>{k.nama} · {k.nik} · {k.departemen}</option>)}
          </select>
        </div>
        <div className="fld">
          <label htmlFor="tm-t">Tanggal lembur</label>
          <input className="input" type="date" id="tm-t" min={min} max={max} value={f.tanggal} onChange={ubah('tanggal')} />
        </div>
        <div className="fld">
          <label htmlFor="tm-j">Jam selesai (WIB)</label>
          <input className="input" type="time" id="tm-j" value={f.jam} onChange={ubah('jam')} />
        </div>
        <div className="fld" style={{ gridColumn: '1 / -1' }}>
          <label htmlFor="tm-a">Alasan</label>
          <input className="input" id="tm-a" maxLength={200} placeholder="Contoh: lupa tap, SPL no. 045/X/2026" value={f.alasan} onChange={ubah('alasan')} />
        </div>
        {est && (
          <div className="glass kv" style={{ gridColumn: '1 / -1' }}>
            <div><span>{tanggalPanjang(f.tanggal)}</span><b><span className={`badge ${est.liburHari ? 'b-warn' : 'b-ok'}`}>{est.label}</span></b></div>
            <div><span>Jam hitung × upah sejam</span><b className="num">{jamFmt(est.jam)} × {rp(est.sejam)}</b></div>
            <div><span>Perkiraan upah lembur</span><b className="num">{rp(est.nominal)}</b></div>
          </div>
        )}
        {err && <p className="err" role="alert" style={{ gridColumn: '1 / -1' }}>{err}</p>}
        <div className="acts" style={{ gridColumn: '1 / -1', justifyContent: 'flex-end' }}>
          <button type="button" className="btn key" onClick={onTutup}>Batal</button>
          <button type="submit" className="btn" disabled={proses}>{proses ? 'Menyimpan…' : 'Simpan tap'}</button>
        </div>
      </form>
    </Modal>
  );
}

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
  const [manual, setManual] = useState(false);

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
          <button type="button" className="btn key" onClick={() => setManual(true)}>
            <Icon name="plus" size={18} />Tambah tap manual
          </button>
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
                                          <td>
                                            <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                                              <span className={`badge ${x.jenisHari === 'KERJA' ? 'b-ok' : 'b-warn'}`}>{x.jenisHari === 'KERJA' ? 'Hari kerja' : 'Libur'}</span>
                                              {x.manual && <span className="badge b-ink" title={x.alasan || ''}>Manual</span>}
                                            </span>
                                            {x.manual && x.alasan && <div className="muted" style={{ fontSize: 12, marginTop: 4, maxWidth: 260 }}>{x.alasan}</div>}
                                          </td>
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
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>Upah sejam = 1/173 × upah sebulan (upah pokok + tunjangan tetap), sesuai PP 35/2021. Klik baris karyawan untuk melihat detail tap dan menghapus tap yang keliru. Lembur yang lupa di-tap bisa ditambahkan lewat Tambah tap manual (bulan ini dan bulan lalu).</p>
        </>
      )}

      {manual && (
        <TapManual
          onTutup={() => setManual(false)}
          onSelesai={(bln) => {
            setManual(false);
            setDaftarBulan((d) => (d.includes(bln) ? d : [...d, bln].sort().reverse()));
            if (bln === bulan) muat(); else setBulan(bln);
          }}
        />
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
