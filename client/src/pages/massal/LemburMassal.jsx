import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import Icon from '../../components/Icon.jsx';
import { Avatar, Memuat, Modal, useToast } from '../../components/ui.jsx';
import { hariIniWIB, jamFmt, rp, tanggalPanjang, tanggalPendek } from '../../format.js';
import { bacaSpl } from '../../lib/bacaSpl.js';

function kemarin(min) {
  const d = new Date(`${hariIniWIB()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  const k = d.toISOString().slice(0, 10);
  return min && k < min ? hariIniWIB() : k;
}

/* ---------- Tahap foto SPL ---------- */

function UnggahFoto({ onHasil, karyawanSemua }) {
  const toast = useToast();
  const [pratinjau, setPratinjau] = useState('');
  const [progres, setProgres] = useState(null);

  async function pilih(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPratinjau(URL.createObjectURL(file));
    setProgres({ persen: 0, tahap: 'Menyiapkan…' });
    try {
      const { bacaFotoSpl } = await import('../../lib/ocr.js');
      const r = await bacaFotoSpl(file, (persen, tahap) => setProgres({ persen, tahap }));
      onHasil({ ...r, baca: bacaSpl(r.teks, karyawanSemua) });
    } catch (err) {
      toast(err.message || 'Foto tidak bisa dibaca. Coba foto ulang lebih terang dan lurus.', true);
      setPratinjau('');
    } finally {
      setProgres(null);
    }
  }

  return (
    <div className="glass ms-foto">
      {progres ? (
        <div className="ms-baca">
          {pratinjau && <img src={pratinjau} alt="Foto SPL yang sedang dibaca" />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <b>{progres.tahap}</b>
            <div className="ms-prog" role="progressbar" aria-valuenow={progres.persen} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${progres.persen}%` }} /></div>
            <p className="hint">Dibaca di perangkat ini, foto tidak dikirim ke layanan lain. Pertama kali butuh beberapa detik.</p>
          </div>
        </div>
      ) : (
        <>
          <label className="ms-drop" htmlFor="foto-spl">
            <span className="tile t-indigo" style={{ width: 54, height: 54, borderRadius: 16 }}><Icon name="camera" /></span>
            <b>Foto atau pilih gambar SPL</b>
            <span className="muted">Nomor, tanggal, jam, dan nama/NIK karyawan dibaca otomatis. Anda periksa dulu sebelum disimpan.</span>
          </label>
          <input className="sr" type="file" id="foto-spl" accept="image/*" capture="environment" onChange={pilih} />
          <ul className="hint ms-tips">
            <li>Letakkan SPL di permukaan datar, terang, tanpa bayangan; foto tegak lurus dari atas.</li>
            <li>Tulisan cetak/ketik paling akurat. Tulisan tangan sering perlu dicentang manual.</li>
            <li>NIK di SPL membuat pencocokan jauh lebih tepat daripada nama saja.</li>
          </ul>
        </>
      )}
    </div>
  );
}

/* ---------- Halaman ---------- */

export default function LemburMassal({ kecil = false }) {
  const { user } = useAuth();
  const toast = useToast();
  const admin = user.role === 'ADMIN';
  const [mode, setMode] = useState('centang');
  const [batas, setBatas] = useState(null);
  const [f, setF] = useState({ tanggal: '', jam: '17:00', nomorSpl: '', alasan: '' });
  const [data, setData] = useState(null);
  const [pilih, setPilih] = useState(() => new Set());
  const [cari, setCari] = useState('');
  const [dept, setDept] = useState('');
  const [foto, setFoto] = useState(null); // { fotoDataUrl, teks, baca }
  const [lihatFoto, setLihatFoto] = useState(false);
  const [konfirmasi, setKonfirmasi] = useState(false);
  const [hasil, setHasil] = useState(null);
  const [proses, setProses] = useState(false);
  const [err, setErr] = useState('');
  const semuaRef = useRef([]);

  useEffect(() => {
    api('/api/lembur-massal/batas').then((b) => {
      setBatas(b);
      setF((x) => ({ ...x, tanggal: x.tanggal || kemarin(b.min) }));
    }).catch((e) => toast(e.message, true));
    return () => { import('../../lib/ocr.js').then((m) => m.tutupOcr()).catch(() => {}); };
  }, [toast]);

  const muat = useCallback(() => {
    if (!f.tanggal) return;
    api(`/api/lembur-massal/karyawan?tanggal=${f.tanggal}`).then((d) => {
      setData(d);
      semuaRef.current = d.karyawan;
      // Buang centang karyawan yang ternyata sudah tap di tanggal ini
      setPilih((p) => new Set([...p].filter((id) => d.karyawan.some((k) => k.id === id && !k.sudahTap))));
    }).catch((e) => toast(e.message, true));
  }, [f.tanggal, toast]);
  useEffect(() => { setData(null); muat(); }, [muat]);

  const cocok = useMemo(() => new Map((foto?.baca.cocok || []).map((c) => [c.id, c])), [foto]);
  const daftar = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return (data?.karyawan || [])
      .filter((k) => (!dept || k.departemen === dept) && (!q || [k.nama, k.nik, k.departemen].some((v) => v.toLowerCase().includes(q))))
      .sort((a, b) => (cocok.has(b.id) - cocok.has(a.id)) || a.nama.localeCompare(b.nama));
  }, [data, cari, dept, cocok]);
  const departemen = useMemo(() => [...new Set((data?.karyawan || []).map((k) => k.departemen))].sort(), [data]);
  const bisaDipilih = daftar.filter((k) => !k.sudahTap);
  const semuaTerpilih = bisaDipilih.length > 0 && bisaDipilih.every((k) => pilih.has(k.id));
  const dipilih = (data?.karyawan || []).filter((k) => pilih.has(k.id));
  const total = dipilih.reduce((s, k) => s + (k.nominal || 0), 0);

  const ubah = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setErr(''); };
  const togel = (id) => setPilih((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  function terimaFoto(r) {
    setFoto(r);
    const b = r.baca;
    const isi = { ...f };
    if (b.tanggal && batas && b.tanggal >= batas.min && b.tanggal <= batas.max) isi.tanggal = b.tanggal;
    else if (b.tanggal) toast(`Tanggal di SPL (${tanggalPendek(b.tanggal)}) di luar batas input. Pilih tanggal yang benar.`, true);
    if (b.jam) isi.jam = b.jam;
    if (b.nomor) isi.nomorSpl = b.nomor;
    if (b.keterangan) isi.alasan = b.keterangan;
    setF(isi);
    // Centang otomatis yang cocok (data karyawan bisa berubah saat tanggal berganti, muat() menyaring lagi)
    setPilih(new Set(b.cocok.map((c) => c.id)));
    toast(b.cocok.length ? `${b.cocok.length} karyawan dikenali. Periksa centangnya.` : 'Tidak ada nama/NIK yang dikenali. Centang manual.', !b.cocok.length);
  }

  function gantiMode(m) {
    setMode(m);
    setErr('');
    if (m === 'centang') setFoto(null);
  }

  function cekSebelumSimpan() {
    if (!f.tanggal || (batas && (f.tanggal < batas.min || f.tanggal > batas.max))) return setErr(`Tanggal harus antara ${tanggalPendek(batas.min)} dan hari ini.`);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(f.jam)) return setErr('Isi jam selesai lembur.');
    if (f.alasan.trim().length < 3) return setErr('Isi keterangan pekerjaan.');
    if (!dipilih.length) return setErr('Centang minimal satu karyawan.');
    if (mode === 'foto' && !foto) return setErr('Foto SPL belum dibaca.');
    setErr('');
    setKonfirmasi(true);
  }

  async function simpan() {
    setProses(true);
    try {
      const body = {
        tanggal: f.tanggal, jam: f.jam, nomorSpl: f.nomorSpl.trim() || null, alasan: f.alasan.trim(),
        karyawanIds: dipilih.map((k) => k.id), sumber: mode === 'foto' ? 'FOTO' : 'CENTANG',
        ...(mode === 'foto' && foto ? { foto: foto.fotoDataUrl, teksOcr: foto.teks.slice(0, 20000) } : {}),
      };
      let r;
      try { r = await api('/api/lembur-massal', { method: 'POST', body }); } catch (e) { if (e.data?.hasil) r = e.data; else throw e; }
      setKonfirmasi(false);
      setHasil(r);
      setPilih(new Set());
      if (r.tercatat) { setFoto(null); setF((x) => ({ ...x, nomorSpl: '', alasan: '' })); }
      muat();
    } catch (e) {
      setKonfirmasi(false);
      setErr(e.message);
    } finally {
      setProses(false);
    }
  }

  const Kepala = kecil
    ? <div className="p-head"><div><h1>Input lembur</h1><p>{data ? `Area ${data.lingkup}` : 'Banyak karyawan sekaligus'}</p></div></div>
    : <div className="ph"><div><h1>Input lembur massal</h1><p>Catat lembur banyak karyawan sekaligus dari Surat Perintah Lembur. Dihitung otomatis 5,5 / 14 jam seperti tap biasa.</p></div></div>;

  const isi = (
    <>
      {Kepala}

      <div className="seg" role="tablist" aria-label="Cara input" style={{ maxWidth: 460 }}>
        <button type="button" role="tab" aria-selected={mode === 'centang'} className={mode === 'centang' ? 'on' : ''} onClick={() => gantiMode('centang')}>Centang daftar</button>
        <button type="button" role="tab" aria-selected={mode === 'foto'} className={mode === 'foto' ? 'on' : ''} onClick={() => gantiMode('foto')}>Foto SPL</button>
      </div>

      {mode === 'foto' && !foto && <UnggahFoto karyawanSemua={semuaRef.current} onHasil={terimaFoto} />}

      {mode === 'foto' && foto && (
        <div className="glass ms-foto">
          <div className="ms-baca">
            <button type="button" className="ms-thumb" onClick={() => setLihatFoto(true)} aria-label="Perbesar foto SPL"><img src={foto.fotoDataUrl} alt="Foto SPL" /></button>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <b>Hasil baca foto</b>
              <span className="muted" style={{ fontSize: 13 }}>
                {foto.baca.nomor ? `No. ${foto.baca.nomor}` : 'Nomor tidak terbaca'} · {foto.baca.tanggal ? tanggalPendek(foto.baca.tanggal) : 'tanggal tidak terbaca'} · {foto.baca.jam ? `s/d ${foto.baca.jam}` : 'jam tidak terbaca'}
              </span>
              <span className={`badge ${foto.baca.cocok.length ? 'b-ok' : 'b-warn'}`} style={{ alignSelf: 'flex-start' }}>{foto.baca.cocok.length} karyawan dikenali</span>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button type="button" className="link" onClick={() => setFoto(null)}>Ganti foto</button>
                <details><summary className="link" style={{ cursor: 'pointer' }}>Teks terbaca</summary><pre className="ms-ocr">{foto.teks || '(kosong)'}</pre></details>
              </div>
            </div>
          </div>
          <p className="hint">Periksa kembali: hapus centang yang salah, centang yang terlewat. Badge kuning berarti nama hanya mirip.</p>
        </div>
      )}

      {(mode === 'centang' || foto) && (
        <>
          <div className="glass form">
            <div className="fld">
              <label htmlFor="ms-t">Tanggal lembur</label>
              <input className="input" type="date" id="ms-t" min={batas?.min} max={batas?.max} value={f.tanggal} onChange={ubah('tanggal')} />
            </div>
            <div className="fld">
              <label htmlFor="ms-j">Jam selesai (WIB)</label>
              <input className="input" type="time" id="ms-j" value={f.jam} onChange={ubah('jam')} />
            </div>
            <div className="fld">
              <label htmlFor="ms-n">No. SPL (opsional)</label>
              <input className="input" id="ms-n" maxLength={60} placeholder="SPL/045/QC/XI/2026" value={f.nomorSpl} onChange={ubah('nomorSpl')} />
            </div>
            <div className="fld">
              <label htmlFor="ms-a">Pekerjaan / keterangan</label>
              <input className="input" id="ms-a" maxLength={200} placeholder="Sortir part reject" value={f.alasan} onChange={ubah('alasan')} />
            </div>
            {data && f.tanggal && (
              <p className="full hint" style={{ margin: 0 }}>
                {tanggalPanjang(f.tanggal)} · <span className={`badge ${data.hari.jenis === 'KERJA' ? 'b-ok' : 'b-warn'}`}>{data.hari.label}{data.hari.keterangan ? ` · ${data.hari.keterangan}` : ''}</span> · {jamFmt(data.hari.jam)} jam hitung per orang
              </p>
            )}
          </div>

          <div className="glass ms-list">
            <div className="ms-tools">
              <input className="input" type="search" placeholder="Cari nama, NIK, departemen" value={cari} onChange={(e) => setCari(e.target.value)} aria-label="Cari karyawan" />
              {departemen.length > 1 && (
                <select className="input" value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Filter departemen" style={{ maxWidth: 220 }}>
                  <option value="">Semua departemen</option>
                  {departemen.map((d) => <option key={d}>{d}</option>)}
                </select>
              )}
            </div>
            {!data ? <Memuat /> : (
              <>
                <label className="ms-row ms-all">
                  <input type="checkbox" checked={semuaTerpilih} disabled={!bisaDipilih.length} onChange={() => setPilih((p) => {
                    const n = new Set(p);
                    bisaDipilih.forEach((k) => (semuaTerpilih ? n.delete(k.id) : n.add(k.id)));
                    return n;
                  })} />
                  <b>Pilih semua{cari || dept ? ' yang tampil' : ''}</b>
                  <span className="muted" style={{ marginLeft: 'auto', fontSize: 13 }}>{bisaDipilih.length} bisa dipilih · {daftar.length - bisaDipilih.length} sudah tap</span>
                </label>
                {daftar.length ? daftar.map((k) => {
                  const c = cocok.get(k.id);
                  return (
                    <label key={k.id} className={`ms-row${k.sudahTap ? ' off' : ''}${pilih.has(k.id) ? ' on' : ''}`}>
                      <input type="checkbox" checked={pilih.has(k.id)} disabled={Boolean(k.sudahTap)} onChange={() => togel(k.id)} />
                      <Avatar nama={k.nama} kunci={k.id} kecil />
                      <span className="t">
                        <b>{k.nama}</b>
                        <span>{k.nik} · {k.departemen}</span>
                        {c && <span className={`badge ${c.skor >= 0.9 ? 'b-ok' : 'b-warn'}`} title={`Baris SPL: ${c.baris}`}>{c.alasan}</span>}
                      </span>
                      <span className="v">
                        {k.sudahTap
                          ? <span className="badge b-mute">Sudah tap {k.sudahTap.jam}</span>
                          : admin && k.nominal != null ? <span className="num">{rp(k.nominal)}</span> : null}
                      </span>
                    </label>
                  );
                }) : <div className="empty">Tidak ada karyawan yang cocok.</div>}
              </>
            )}
          </div>

          <div className="ms-bar glass">
            <div style={{ minWidth: 0 }}>
              <b>{dipilih.length} karyawan dipilih</b>
              <div className="muted" style={{ fontSize: 13 }}>
                {data ? `${jamFmt(dipilih.length * data.hari.jam)} jam hitung` : ''}{admin && dipilih.length ? ` · ${rp(total)}` : ''}
              </div>
            </div>
            {err && <p className="err" role="alert" style={{ flexBasis: '100%', order: 3 }}>{err}</p>}
            <button type="button" className="btn" onClick={cekSebelumSimpan} disabled={!dipilih.length}>Simpan {dipilih.length || ''} lembur</button>
          </div>
        </>
      )}

      {lihatFoto && foto && (
        <Modal judul="Foto SPL" onClose={() => setLihatFoto(false)} lebar={900}>
          <img src={foto.fotoDataUrl} alt="Foto SPL" style={{ width: '100%', borderRadius: 14 }} />
          <div className="acts"><button type="button" className="btn key" onClick={() => setLihatFoto(false)} autoFocus>Tutup</button></div>
        </Modal>
      )}

      {konfirmasi && (
        <Modal judul={`Simpan ${dipilih.length} lembur?`} onClose={() => !proses && setKonfirmasi(false)}>
          <div className="glass kv">
            <div><span>Tanggal</span><b>{tanggalPendek(f.tanggal)} · s/d {f.jam}</b></div>
            {f.nomorSpl && <div><span>No. SPL</span><b>{f.nomorSpl}</b></div>}
            <div><span>Pekerjaan</span><b style={{ textAlign: 'right' }}>{f.alasan}</b></div>
            <div><span>Karyawan</span><b>{dipilih.length} orang · {jamFmt(dipilih.length * (data?.hari.jam || 0))} jam hitung</b></div>
            {admin && <div><span>Total upah lembur</span><b className="num">{rp(total)}</b></div>}
            {mode === 'foto' && foto && <div><span>Bukti</span><b>Foto SPL · {Math.round((foto.fotoDataUrl.length * 3) / 4 / 1024)} KB{batas?.masaSimpanFotoBulan ? ` · disimpan ${batas.masaSimpanFotoBulan} bulan` : ''}</b></div>}
          </div>
          <p>Lembur dicatat sebagai tap manual atas nama Anda ({user.username}). Karyawan menerima notifikasi.</p>
          <div className="acts">
            <button type="button" className="btn key" onClick={() => setKonfirmasi(false)} disabled={proses}>Batal</button>
            <button type="button" className="btn" onClick={simpan} disabled={proses} autoFocus>{proses ? 'Menyimpan…' : 'Simpan'}</button>
          </div>
        </Modal>
      )}

      {hasil && (
        <Modal judul={hasil.tercatat ? `${hasil.tercatat} lembur tercatat` : 'Tidak ada yang tercatat'} onClose={() => setHasil(null)}>
          {admin && hasil.totalNominal != null && hasil.tercatat > 0 && <p>Total upah lembur {rp(hasil.totalNominal)}.</p>}
          {hasil.dilewati > 0 && (
            <>
              <p>{hasil.dilewati} karyawan dilewati:</p>
              <div className="glass list">
                {hasil.hasil.filter((h) => h.status !== 'OK').map((h) => (
                  <div className="li" key={h.karyawanId}><div className="t"><b>{h.nama || `#${h.karyawanId}`}</b><span>{h.pesan}</span></div><span className="badge b-warn">{h.status === 'SUDAH_TAP' ? 'Sudah tap' : 'Gagal'}</span></div>
                ))}
              </div>
            </>
          )}
          <div className="acts"><button type="button" className="btn" onClick={() => setHasil(null)} autoFocus>Selesai</button></div>
        </Modal>
      )}
    </>
  );

  return kecil ? <main className="p-body">{isi}</main> : isi;
}
