import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import Icon from '../../components/Icon.jsx';
import { Avatar, Memuat, Modal, useToast } from '../../components/ui.jsx';
import { hariIniWIB, jamFmt, rp, tanggalPanjang, tanggalPendek } from '../../format.js';
import { bacaSpl } from '../../lib/bacaSpl.js';
import { petakanSpl } from '../../lib/petaSpl.js';

function kemarin(min) {
  const d = new Date(`${hariIniWIB()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  const k = d.toISOString().slice(0, 10);
  return min && k < min ? hariIniWIB() : k;
}

/* ---------- Tahap foto SPL ---------- */

const NAMA_PEMBACA = { GROQ: 'Groq', GEMINI: 'Gemini', AZURE: 'Azure' };

/** Baca SPL lewat Gemini/Azure: potong kolom → kirim → petakan baris. null = pakai pembaca lokal. */
async function bacaLewatAwan(file, karyawan, setProgres, toast, jenis) {
  setProgres({ persen: 10, tahap: 'Mencari tabel SPL…' });
  const { siapkanSpl } = await import('../../lib/potongSpl.js');
  const spl = await siapkanSpl(file);
  if (spl.gagal) {
    toast('Tabel SPL tidak terdeteksi. Foto ulang lebih lurus & seluruh tabel terlihat. Dipakai pembaca lokal dulu.', true);
    return null;
  }
  setProgres({ persen: 45, tahap: `Membaca tulisan tangan (${NAMA_PEMBACA[jenis]})…` });
  const jumlahBaris = spl.tabel.baris.length - 1;
  let r;
  try {
    r = await api('/api/lembur-massal/baca-spl', { method: 'POST', body: { gambar: spl.gambar, jumlahBaris } });
  } catch (e) {
    toast(`${e.message} Dipakai pembaca lokal.`, true);
    return null;
  }
  setProgres({ persen: 90, tahap: 'Mencocokkan nama karyawan…' });
  let peta; let teks;
  if (r.jenis === 'GEMINI' || r.jenis === 'GROQ') {
    // Groq/Gemini mengembalikan isi per baris tabel langsung
    const sel = Array.from({ length: jumlahBaris }, (_, i) => {
      const b = r.baris[i] || {};
      return { nama: b.nama || '', bagian: b.bagian || '', mulai: b.mulai || '', selesai: b.selesai || '', alasan: b.alasan || '' };
    });
    const teksStrip = `Hari : ${r.hari || ''}\nTanggal : ${r.tanggal || ''}`;
    peta = petakanSpl({ sel, teksStrip }, karyawan);
    teks = [teksStrip, ...r.baris.map((b) => [b.no, b.nama, b.bagian, b.mulai, b.selesai, b.alasan].join(' | '))].join('\n');
  } else {
    const kata = []; const strip = [];
    for (const l of r.baris) {
      const cy = l.kotak.reduce((a, p) => a + p.y, 0) / l.kotak.length;
      if (cy < spl.stripBawah) { strip.push(l.teks); continue; }
      for (const w of l.kata) kata.push({ teks: w.teks, kotak: w.kotak.map((p) => spl.keKecil(p.x, p.y)) });
    }
    peta = petakanSpl({ kata, tabel: spl.tabel, teksStrip: strip.join('\n') }, karyawan);
    teks = r.baris.map((l) => l.teks).join('\n');
  }
  const { kompresBukti } = await import('../../lib/ocr.js');
  return {
    jenis: r.jenis || jenis,
    awan: true,
    fotoDataUrl: kompresBukti(spl.img),
    teks,
    pemakaian: r.pemakaian,
    baris: peta.baris.map((b) => ({ ...b, potongan: spl.potongNama(b.no - 1) })),
    baca: { nomor: null, tanggal: peta.tanggal, jam: peta.jamUmum, keterangan: peta.alasanUmum, cocok: [] },
  };
}

function UnggahFoto({ onHasil, karyawanSemua, awan }) {
  const nama = NAMA_PEMBACA[awan];
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
      if (awan) {
        const ra = await bacaLewatAwan(file, karyawanSemua, setProgres, toast, awan);
        if (ra) { onHasil(ra); return; }
      }
      const { bacaFotoSpl } = await import('../../lib/ocr.js');
      const r = await bacaFotoSpl(file, (persen, tahap) => setProgres({ persen, tahap }));
      onHasil({ ...r, jenis: 'LOKAL', baca: bacaSpl(r.teks, karyawanSemua) });
    } catch (err) {
      const versiLama = /dynamically imported module|Importing a module script failed/i.test(err?.message || '');
      toast(versiLama ? 'Aplikasi baru diperbarui. Tutup lalu buka lagi lemburin (atau muat ulang halaman), kemudian coba lagi.'
        : (err.message || 'Foto tidak bisa dibaca. Coba foto ulang lebih terang dan lurus.'), true);
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
            <p className="hint">{awan
              ? `Hanya kolom Nama–Alasan dan tanggal yang dikirim ke ${nama}. Kop perusahaan dan tanda tangan tidak ikut dikirim.`
              : 'Dibaca di perangkat ini, foto tidak dikirim ke layanan lain. Pertama kali butuh beberapa detik.'}</p>
          </div>
        </div>
      ) : (
        <>
          <label className="ms-drop" htmlFor="foto-spl">
            <span className="tile t-indigo" style={{ width: 54, height: 54, borderRadius: 16 }}><Icon name="camera" /></span>
            <b>Foto atau pilih gambar SPL</b>
            <span className="muted">{awan
              ? 'Formulir SPL (SNY-FRM-HRD-006): nama, jam, dan alasan per baris dibaca otomatis, termasuk tulisan tangan. Anda periksa dulu sebelum disimpan.'
              : 'Nomor, tanggal, jam, dan nama/NIK karyawan dibaca otomatis (tulisan cetak). Anda periksa dulu sebelum disimpan.'}</span>
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
  const [foto, setFoto] = useState(null); // { fotoDataUrl, teks, baca, jenis }
  const [barisSpl, setBarisSpl] = useState(null); // baris hasil Azure: { no, namaTerbaca, saran, karyawanId, ikut, jam, alasan, potongan }
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

  const cocok = useMemo(() => {
    if (barisSpl) {
      return new Map(barisSpl.filter((b) => b.ikut && b.karyawanId).map((b) => [b.karyawanId, {
        skor: b.yakin && b.karyawanId === b.pilihan ? 1 : 0.8, alasan: `Baris ${b.no} SPL`, baris: b.namaTerbaca,
      }]));
    }
    return new Map((foto?.baca.cocok || []).map((c) => [c.id, c]));
  }, [foto, barisSpl]);
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
    if (r.baris) {
      const rows = r.baris.map((x) => ({ ...x, karyawanId: x.pilihan, ikut: Boolean(x.pilihan), jam: x.selesai || isi.jam }));
      setBarisSpl(rows);
      setPilih(new Set(rows.filter((x) => x.ikut && x.karyawanId).map((x) => x.karyawanId)));
      const yakin = rows.filter((x) => x.ikut).length;
      toast(`${r.baris.length} baris terbaca, ${yakin} otomatis dicocokkan. Periksa ${r.baris.length - yakin} baris yang ragu.`);
      return;
    }
    setBarisSpl(null);
    // Centang otomatis yang cocok (data karyawan bisa berubah saat tanggal berganti, muat() menyaring lagi)
    setPilih(new Set(b.cocok.map((c) => c.id)));
    toast(b.cocok.length ? `${b.cocok.length} karyawan dikenali. Periksa centangnya.` : 'Tidak ada nama/NIK yang dikenali. Centang manual.', !b.cocok.length);
  }

  /** Ubah satu baris SPL dan selaraskan centang di daftar karyawan. */
  function ubahBaris(i, patch) {
    setBarisSpl((rows) => {
      const baru = rows.map((x, j) => (j === i ? { ...x, ...patch } : x));
      const lama = new Set(rows.filter((x) => x.ikut && x.karyawanId).map((x) => x.karyawanId));
      const kini = new Set(baru.filter((x) => x.ikut && x.karyawanId).map((x) => x.karyawanId));
      setPilih((p) => new Set([...[...p].filter((id) => !lama.has(id)), ...kini]));
      return baru;
    });
  }
  const dipakaiBaris = useMemo(() => {
    const m = new Map();
    (barisSpl || []).forEach((x, i) => { if (x.ikut && x.karyawanId) m.set(x.karyawanId, (m.get(x.karyawanId) || []).concat(i)); });
    return m;
  }, [barisSpl]);

  function gantiMode(m) {
    setMode(m);
    setErr('');
    if (m === 'centang') { setFoto(null); setBarisSpl(null); }
  }

  function cekSebelumSimpan() {
    if (!f.tanggal || (batas && (f.tanggal < batas.min || f.tanggal > batas.max))) return setErr(`Tanggal harus antara ${tanggalPendek(batas.min)} dan hari ini.`);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(f.jam)) return setErr('Isi jam selesai lembur.');
    if (f.alasan.trim().length < 3) return setErr('Isi keterangan pekerjaan.');
    if (!dipilih.length) return setErr('Centang minimal satu karyawan.');
    if (mode === 'foto' && !foto) return setErr('Foto SPL belum dibaca.');
    const dobel = [...dipakaiBaris.values()].find((v) => v.length > 1);
    if (dobel) return setErr(`Baris ${dobel.map((i) => barisSpl[i].no).join(' & ')} memilih karyawan yang sama. Perbaiki salah satunya.`);
    const jamSalah = (barisSpl || []).find((x) => x.ikut && x.jam && !/^([01]\d|2[0-3]):[0-5]\d$/.test(x.jam));
    if (jamSalah) return setErr(`Jam selesai baris ${jamSalah.no} belum benar.`);
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
        ...(barisSpl ? {
          rincian: barisSpl.filter((x) => x.ikut && x.karyawanId && pilih.has(x.karyawanId)).map((x) => ({
            karyawanId: x.karyawanId,
            jam: x.jam && x.jam !== f.jam ? x.jam : null,
            alasan: x.alasan && x.alasan !== f.alasan ? x.alasan.slice(0, 200) : null,
          })),
        } : {}),
      };
      let r;
      try { r = await api('/api/lembur-massal', { method: 'POST', body }); } catch (e) { if (e.data?.hasil) r = e.data; else throw e; }
      setKonfirmasi(false);
      setHasil(r);
      setPilih(new Set());
      if (r.tercatat) { setFoto(null); setBarisSpl(null); setF((x) => ({ ...x, nomorSpl: '', alasan: '' })); }
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

      {mode === 'foto' && !foto && <UnggahFoto karyawanSemua={semuaRef.current} onHasil={terimaFoto} awan={['GROQ', 'GEMINI', 'AZURE'].includes(batas?.pembaca?.jenis) && batas.pembaca.sisa > 0 ? batas.pembaca.jenis : null} />}

      {mode === 'foto' && foto && (
        <div className="glass ms-foto">
          <div className="ms-baca">
            <button type="button" className="ms-thumb" onClick={() => setLihatFoto(true)} aria-label="Perbesar foto SPL"><img src={foto.fotoDataUrl} alt="Foto SPL" /></button>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <b>Hasil baca foto</b>
              <span className="muted" style={{ fontSize: 13 }}>
                {foto.awan ? '' : `${foto.baca.nomor ? `No. ${foto.baca.nomor}` : 'Nomor tidak terbaca'} · `}{foto.baca.tanggal ? tanggalPendek(foto.baca.tanggal) : 'tanggal tidak terbaca'} · {foto.baca.jam ? `s/d ${foto.baca.jam}` : 'jam tidak terbaca'}
              </span>
              {foto.awan && foto.baris ? (() => {
                const yakin = foto.baris.filter((r) => r.yakin).length;
                return <span className={`badge ${yakin === foto.baris.length ? 'b-ok' : 'b-warn'}`} style={{ alignSelf: 'flex-start' }}>{yakin} dari {foto.baris.length} baris cocok otomatis</span>;
              })() : <span className={`badge ${foto.baca.cocok.length ? 'b-ok' : 'b-warn'}`} style={{ alignSelf: 'flex-start' }}>{foto.baca.cocok.length} karyawan dikenali</span>}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button type="button" className="link" onClick={() => { setFoto(null); setBarisSpl(null); }}>Ganti foto</button>
                <details><summary className="link" style={{ cursor: 'pointer' }}>Teks terbaca</summary><pre className="ms-ocr">{foto.teks || '(kosong)'}</pre></details>
              </div>
            </div>
          </div>
          {foto.awan
            ? <p className="hint">Dibaca {NAMA_PEMBACA[foto.jenis]}{foto.pemakaian ? ` · kuota ${foto.pemakaian.periode === 'hari' ? 'hari' : 'bulan'} ini ${foto.pemakaian.jumlah}/${foto.pemakaian.batas}` : ''}. Periksa tiap baris di bawah: baris kuning belum dicocokkan otomatis.</p>
            : <p className="hint">Periksa kembali: hapus centang yang salah, centang yang terlewat. Badge kuning berarti nama hanya mirip.</p>}
        </div>
      )}

      {mode === 'foto' && foto && barisSpl && (
        <div className="glass ms-list">
          <div className="ms-tools" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <b>Baris SPL ({barisSpl.filter((x) => x.ikut && x.karyawanId).length}/{barisSpl.length} dipilih)</b>
            <span className="muted" style={{ fontSize: 13 }}>Kiri: tulisan di SPL · kanan: karyawan yang dicatat</span>
          </div>
          {barisSpl.map((x, i) => {
            const k = (data?.karyawan || []).find((y) => y.id === x.karyawanId);
            const dobel = x.ikut && x.karyawanId && (dipakaiBaris.get(x.karyawanId) || []).length > 1;
            const ragu = !x.karyawanId || (x.karyawanId !== x.pilihan);
            return (
              <div key={x.no} className={`ms-spl${x.ikut ? ' on' : ''}${ragu && !x.karyawanId ? ' ragu' : ''}`}>
                <input type="checkbox" aria-label={`Ikutkan baris ${x.no}`} checked={x.ikut} disabled={!x.karyawanId || Boolean(k?.sudahTap)} onChange={() => ubahBaris(i, { ikut: !x.ikut })} />
                <span className="no">{x.no}</span>
                <span className="tulisan">
                  {x.potongan && <img src={x.potongan} alt={`Tulisan nama baris ${x.no}`} />}
                  <span className="muted">terbaca: {x.namaTerbaca}</span>
                </span>
                <span className="pilih">
                  <select className="input" value={x.karyawanId || ''} aria-label={`Karyawan untuk baris ${x.no}`} onChange={(e) => { const id = Number(e.target.value) || null; ubahBaris(i, { karyawanId: id, ikut: Boolean(id) }); }}>
                    <option value="">— pilih karyawan —</option>
                    <optgroup label="Saran">
                      {x.saran.map((sr) => <option key={sr.id} value={sr.id}>{sr.nama} ({Math.round(sr.skor * 100)}%)</option>)}
                    </optgroup>
                    <optgroup label="Semua karyawan">
                      {(data?.karyawan || []).filter((y) => !x.saran.some((sr) => sr.id === y.id)).map((y) => <option key={y.id} value={y.id}>{y.nama} · {y.nik}</option>)}
                    </optgroup>
                  </select>
                  <span className="info">
                    {k?.sudahTap ? <span className="badge b-mute">Sudah tap {k.sudahTap.jam}</span>
                      : dobel ? <span className="badge b-err">Dipilih di 2 baris</span>
                        : x.karyawanId && x.karyawanId === x.pilihan ? <span className="badge b-ok">Cocok</span>
                          : x.karyawanId ? <span className="badge b-ink">Dipilih manual</span>
                            : <span className="badge b-warn">Perlu dipilih</span>}
                    <input className="input jam" type="time" value={x.jam || ''} aria-label={`Jam selesai baris ${x.no}`} onChange={(e) => ubahBaris(i, { jam: e.target.value })} />
                    {x.alasan && <span className="muted alasan" title={x.alasan}>{x.alasan}</span>}
                  </span>
                </span>
              </div>
            );
          })}
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
