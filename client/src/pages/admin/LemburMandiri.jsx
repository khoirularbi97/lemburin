import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';
import { Avatar, Konfirmasi, Memuat, Modal, useToast } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';
import { jamFmt, rp, tanggalPendek } from '../../format.js';
import { teksLokasi } from '../../lib/lokasi.js';
import { hitungLemburAktual, jadwalShift, lengkapiAturan } from '../../lib/hitungAktual.js';

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const waktu = (iso) => new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const durasi = (m) => `${Math.floor(m / 60)} j ${m % 60} m`;

/** Foto wajah lewat API (butuh token, jadi tidak bisa langsung <img src>). */
function FotoWajah({ id }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let url = ''; let hidup = true;
    api(`/api/mandiri/wajah/${id}/foto`, { raw: true }).then((r) => r.blob()).then((b) => { url = URL.createObjectURL(b); if (hidup) setSrc(url); }).catch(() => {});
    return () => { hidup = false; if (url) URL.revokeObjectURL(url); };
  }, [id]);
  return src ? <img className="foto-wajah" src={src} alt="Foto wajah yang didaftarkan" /> : <span className="foto-wajah kosong" />;
}

function Wajah() {
  const toast = useToast();
  const [status, setStatus] = useState('MENUNGGU');
  const [d, setD] = useState(null);
  const [tolak, setTolak] = useState(null);
  const [catatan, setCatatan] = useState('');
  const [hapus, setHapus] = useState(null);

  const muat = useCallback(() => { setD(null); api(`/api/mandiri/wajah?status=${status}`).then(setD).catch((e) => toast(e.message, true)); }, [status, toast]);
  useEffect(() => { muat(); }, [muat]);

  const proses = async (k, setuju, cat) => {
    try {
      await api(`/api/mandiri/wajah/${k.id}`, { method: 'POST', body: { setuju, catatan: cat || null } });
      toast(setuju ? `Wajah ${k.nama} disetujui` : `Wajah ${k.nama} ditolak`);
      muat();
    } catch (e) { toast(e.message, true); }
  };

  return (
    <>
      <div className="seg" role="tablist" aria-label="Status wajah" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))', maxWidth: 460 }}>
        {[['MENUNGGU', `Menunggu${d?.menunggu ? ` (${d.menunggu})` : ''}`], ['DISETUJUI', 'Disetujui'], ['DITOLAK', 'Ditolak']].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={status === k} className={status === k ? 'on' : ''} onClick={() => setStatus(k)}>{l}</button>
        ))}
      </div>
      {!d ? <Memuat /> : !d.list.length ? <div className="glass tablebox"><div className="empty">{status === 'MENUNGGU' ? 'Tidak ada pendaftaran wajah yang menunggu.' : 'Belum ada data.'}</div></div> : (
        <div className="kartu-wajah">
          {d.list.map((w) => (
            <div className="glass" key={w.karyawan.id}>
              <FotoWajah id={w.karyawan.id} />
              <div className="t">
                <b>{w.karyawan.nama}</b>
                <span>{w.karyawan.nik} · {w.karyawan.departemen}</span>
                <span>Didaftarkan {waktu(w.didaftarkan)} · setuju UU PDP {waktu(w.persetujuan)}</span>
                {w.catatan && <span className="err">Catatan: {w.catatan}</span>}
              </div>
              <div className="rowacts">
                {status !== 'DISETUJUI' && <button type="button" className="btn sm" onClick={() => proses(w.karyawan, true)}>Setujui</button>}
                {status === 'MENUNGGU' && <button type="button" className="btn sm danger" onClick={() => { setCatatan(''); setTolak(w.karyawan); }}>Tolak</button>}
                {status !== 'MENUNGGU' && <button type="button" className="link danger" onClick={() => setHapus(w.karyawan)}>Hapus data wajah</button>}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="hint">Setujui hanya kalau foto jelas memperlihatkan wajah karyawan yang bersangkutan (cocokkan dengan foto ID card). Data wajah termasuk data pribadi spesifik (UU No. 27/2022): hapus saat karyawan keluar.</p>

      {tolak && (
        <Modal judul={`Tolak wajah ${tolak.nama}?`} onClose={() => setTolak(null)}>
          <div className="fld">
            <label htmlFor="cat-wajah">Alasan (dilihat karyawan)</label>
            <input id="cat-wajah" className="input" autoFocus maxLength={200} placeholder="Contoh: foto gelap, ulangi di tempat terang" value={catatan} onChange={(e) => setCatatan(e.target.value)} />
          </div>
          <div className="acts">
            <button type="button" className="btn key" onClick={() => setTolak(null)}>Batal</button>
            <button type="button" className="btn danger" disabled={catatan.trim().length < 3} onClick={() => { proses(tolak, false, catatan.trim()); setTolak(null); }}>Tolak</button>
          </div>
        </Modal>
      )}
      {hapus && (
        <Konfirmasi judul={`Hapus data wajah ${hapus.nama}?`} isi="Karyawan harus mendaftar ulang sebelum bisa tap mandiri lagi." labelOk="Hapus" bahaya
          onBatal={() => setHapus(null)}
          onOk={async () => { const k = hapus; setHapus(null); try { await api(`/api/mandiri/wajah/${k.id}`, { method: 'DELETE' }); toast('Data wajah dihapus'); muat(); } catch (e) { toast(e.message, true); } }} />
      )}
    </>
  );
}

function Sesi() {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [hapus, setHapus] = useState(null);
  const muat = useCallback(() => api('/api/mandiri/sesi').then(setList).catch((e) => toast(e.message, true)), [toast]);
  useEffect(() => { muat(); const t = setInterval(muat, 60_000); return () => clearInterval(t); }, [muat]);
  if (!list) return <Memuat />;
  return (
    <>
      {!list.length ? <div className="glass tablebox"><div className="empty">Tidak ada karyawan yang sedang tap in.</div></div> : (
        <div className="glass tablebox"><div className="scroll"><table>
          <thead><tr><th>Karyawan</th><th>Tap in</th><th className="n">Berjalan</th><th>QR petugas</th><th>Aksi</th></tr></thead>
          <tbody>{list.map((s) => (
            <tr key={s.id}>
              <td><span className="namecell"><Avatar nama={s.karyawan.nama} kunci={s.karyawan.id} kecil /><span>{s.karyawan.nama}<div className="muted" style={{ fontSize: 12 }}>{s.karyawan.nik} · {s.karyawan.departemen}</div></span></span></td>
              <td className="num">{waktu(s.mulai)}</td>
              <td className="n">{s.menitBerjalan > 16 * 60 ? <span className="badge b-err">{durasi(s.menitBerjalan)}</span> : durasi(s.menitBerjalan)}</td>
              <td>{s.petugas}</td>
              <td><button type="button" className="link danger" onClick={() => setHapus(s)}>Hapus tap in</button></td>
            </tr>
          ))}</tbody>
        </table></div></div>
      )}
      <p className="hint">Tap in yang lupa di-tap out lebih dari 20 jam tidak bisa ditutup karyawan. Hapus tap in-nya, lalu catat lembur lewat <b>Input lembur massal</b> dengan jam mulai & selesai yang benar.</p>
      {hapus && (
        <Konfirmasi judul={`Hapus tap in ${hapus.karyawan.nama}?`} isi={`Tap in ${waktu(hapus.mulai)} dihapus dan tidak menjadi lembur.`} labelOk="Hapus" bahaya
          onBatal={() => setHapus(null)}
          onOk={async () => { const s = hapus; setHapus(null); try { await api(`/api/mandiri/sesi/${s.id}`, { method: 'DELETE' }); toast('Tap in dihapus'); muat(); } catch (e) { toast(e.message, true); } }} />
      )}
    </>
  );
}

function Aturan() {
  const toast = useToast();
  const [a, setA] = useState(null);
  const [simpan, setSimpan] = useState(false);
  useEffect(() => { api('/api/mandiri/aturan').then((r) => setA(lengkapiAturan(r.aturan))).catch((e) => toast(e.message, true)); }, [toast]);
  if (!a) return <Memuat />;
  const ubah = (p) => setA((x) => ({ ...x, ...p }));
  const sh = a.shift;
  const ubahShift = (p) => setA((x) => ({ ...x, shift: { ...x.shift, ...p } }));
  const jamShift = (kunci, label) => (
    <div className="fld">
      <label htmlFor={`sh-${kunci}`}>{label}</label>
      <div className="jam-rentang">
        <input id={`sh-${kunci}`} type="time" className="input" aria-label={`${label} masuk`} value={sh[kunci].masuk} onChange={(e) => ubahShift({ [kunci]: { ...sh[kunci], masuk: e.target.value } })} />
        <span>s/d</span>
        <input type="time" className="input" aria-label={`${label} pulang`} value={sh[kunci].pulang} onChange={(e) => ubahShift({ [kunci]: { ...sh[kunci], pulang: e.target.value } })} />
      </div>
    </div>
  );
  const hariIni = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  const mingguIni = sh.aktif ? sh.grup.map((g) => [g, jadwalShift({ grup: g, tanggal: hariIni, aturan: a })]) : [];
  const contohShift = sh.aktif ? (() => {
    const [gA, gB] = sh.grup;
    const s1 = jadwalShift({ grup: mingguIni.find(([, j]) => j?.kode === 'S1')?.[0] || gA, tanggal: '2026-11-11', aturan: a });
    const g2 = s1?.grup === gA ? gB : gA;
    const s2 = jadwalShift({ grup: g2, tanggal: '2026-11-11', aturan: a });
    const s2l = jadwalShift({ grup: g2, tanggal: '2026-11-11', aturan: a, shift1Lembur: true });
    const h = (j, m, sl) => { try { return hitungLemburAktual({ upahBulanan: 173_000 * 30, tanggal: '2026-11-11', mulai: m, selesai: sl, aturan: a, jamKerja: j }); } catch { return null; } };
    return [
      [`Shift 1, lembur ${s1.pulang}–19:30`, h(s1, s1.pulang, '19:30')],
      [`Shift 2, lembur ${s2.pulang}–03:00`, h(s2, s2.pulang, '03:00')],
      [`Shift 2 (shift 1 lembur), lembur ${s2l.pulang}–06:30`, h(s2l, s2l.pulang, '06:30')],
    ];
  })() : [];
  const contoh = (tanggal, mulai, selesai, libur) => {
    try { return hitungLemburAktual({ upahBulanan: 173_000 * 30, tanggal, mulai, selesai, aturan: a, libur: libur ? new Map([[tanggal, 'Libur']]) : new Map() }); } catch { return null; }
  };
  // 2026-11-04 Rabu, 2026-11-08 Minggu
  const contohList = [
    ['Rabu, lembur setelah pulang', contoh('2026-11-04', a.jamPulang, '19:30')],
    ['Rabu, SPL 07:30–18:30', contoh('2026-11-04', '07:30', '18:30')],
    ['Minggu 07:30–16:30', contoh('2026-11-08', '07:30', '16:30')],
    ['Minggu 07:30–19:30', contoh('2026-11-08', '07:30', '19:30')],
  ];

  return (
    <form className="glass form" onSubmit={async (e) => {
      e.preventDefault(); setSimpan(true);
      try { const r = await api('/api/mandiri/aturan', { method: 'PUT', body: a }); setA(r.aturan); toast('Aturan hitung disimpan. Berlaku untuk lembur yang dicatat setelah ini.'); } catch (e2) { toast(e2.message, true); } finally { setSimpan(false); }
    }}>
      <h2>Aturan hitung jam aktual (PP 35/2021)</h2>
      <div className="fld">
        <label htmlFor="at-pola">Pola kerja</label>
        <select id="at-pola" className="input" value={a.polaKerja} onChange={(e) => ubah({ polaKerja: Number(e.target.value) })}>
          <option value={5}>5 hari kerja (Senin–Jumat, 8 jam)</option>
          <option value={6}>6 hari kerja (Senin–Sabtu, 7 jam)</option>
        </select>
      </div>
      <div className="fld">
        <label htmlFor="at-pulang">Jam pulang normal hari kerja{a.shift.aktif ? ' (karyawan non-shift)' : ''}</label>
        <input id="at-pulang" type="time" className="input" value={a.jamPulang} onChange={(e) => ubah({ jamPulang: e.target.value })} />
      </div>
      {a.polaKerja === 6 && (
        <>
          <div className="fld">
            <label htmlFor="at-pendek">Hari kerja terpendek</label>
            <select id="at-pendek" className="input" value={a.hariTerpendek} onChange={(e) => ubah({ hariTerpendek: Number(e.target.value) })}>
              {HARI.slice(1).map((h, i) => <option key={h} value={i + 1}>{h}</option>)}
            </select>
          </div>
          <div className="fld">
            <label htmlFor="at-pulang2">Jam pulang hari terpendek</label>
            <input id="at-pulang2" type="time" className="input" value={a.jamPulangTerpendek} onChange={(e) => ubah({ jamPulangTerpendek: e.target.value })} />
          </div>
        </>
      )}
      <div className="fld">
        <label htmlFor="at-bulat">Pembulatan menit lembur (ke bawah)</label>
        <select id="at-bulat" className="input" value={a.pembulatanMenit} onChange={(e) => ubah({ pembulatanMenit: Number(e.target.value) })}>
          <option value={1}>Per menit (tanpa pembulatan)</option>
          <option value={15}>Per 15 menit</option>
          <option value={30}>Per 30 menit</option>
          <option value={60}>Per jam penuh</option>
        </select>
      </div>
      <div className="full" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <b style={{ fontSize: 14 }}>Jam istirahat (tidak dihitung lembur)</b>
        {a.istirahat.map((r, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="time" className="input" style={{ width: 140 }} aria-label={`Istirahat ${i + 1} mulai`} value={r.mulai} onChange={(e) => ubah({ istirahat: a.istirahat.map((x, j) => (j === i ? { ...x, mulai: e.target.value } : x)) })} />
            <span>s/d</span>
            <input type="time" className="input" style={{ width: 140 }} aria-label={`Istirahat ${i + 1} selesai`} value={r.selesai} onChange={(e) => ubah({ istirahat: a.istirahat.map((x, j) => (j === i ? { ...x, selesai: e.target.value } : x)) })} />
            <button type="button" className="link danger" onClick={() => ubah({ istirahat: a.istirahat.filter((_, j) => j !== i) })}>Hapus</button>
          </div>
        ))}
        {a.istirahat.length < 6 && <button type="button" className="link" style={{ alignSelf: 'flex-start' }} onClick={() => ubah({ istirahat: [...a.istirahat, { mulai: '18:00', selesai: '18:30' }] })}>+ Tambah jam istirahat</button>}
      </div>

      <div className="full" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
        <label className="chk" style={{ fontWeight: 700 }}><input type="checkbox" checked={sh.aktif} onChange={(e) => ubahShift({ aktif: e.target.checked })} /> Pakai 2 shift bergilir per grup</label>
        {!sh.aktif && <p className="hint" style={{ margin: 0 }}>Aktifkan kalau ada shift malam yang lembur lewat tengah malam. Karyawan tanpa grup tetap memakai jam pulang normal di atas.</p>}
      </div>
      {sh.aktif && (
        <>
          <div className="full sh-grid">
          {jamShift('shift1', 'Shift 1')}
          {jamShift('shift2', 'Shift 2 (shift 1 tidak lembur)')}
          {jamShift('shift2Lembur', 'Shift 2 (shift 1 lembur)')}
          <div className="fld">
            <label htmlFor="sh-ganti">Jam ganti hari kerja</label>
            <input id="sh-ganti" type="time" className="input" value={sh.gantiHari} onChange={(e) => ubahShift({ gantiHari: e.target.value })} />
          </div>
          <div className="fld">
            <label htmlFor="sh-grup1">Nama grup</label>
            <div className="jam-rentang">
              {sh.grup.map((g, i) => (
                <input key={i} id={i === 0 ? 'sh-grup1' : undefined} className="input" style={{ width: 90 }} maxLength={10} aria-label={`Nama grup ${i + 1}`} value={g}
                  onChange={(e) => { const v = e.target.value.toUpperCase(); const grup = sh.grup.map((x, j) => (j === i ? v : x)); ubahShift({ grup, grupShift1: sh.grupShift1 === g ? v : sh.grupShift1 }); }} />
              ))}
            </div>
          </div>
          <div className="fld">
            <label htmlFor="sh-acuan">Minggu acuan (Senin) &amp; grup shift 1-nya</label>
            <div className="jam-rentang">
              <input id="sh-acuan" type="date" className="input" value={sh.acuanSenin} onChange={(e) => ubahShift({ acuanSenin: e.target.value })} />
              <select className="input"  aria-label="Grup yang masuk shift 1 pada minggu acuan" value={sh.grupShift1} onChange={(e) => ubahShift({ grupShift1: e.target.value })}>
                {sh.grup.map((g) => <option key={g} value={g}>Grup {g}</option>)}
              </select>
            </div>
          </div>
          </div>
          <div className="full" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div className="glass kv">
              <div><span>Minggu ini</span><b>{mingguIni.map(([g, j]) => `Grup ${g}: ${j ? j.nama : '—'}`).join(' · ')}</b></div>
              {contohShift.map(([l, h]) => h && <div key={l}><span>{l}</span><b className="num">{jamFmt(h.jamLembur)} jam → {jamFmt(h.jamHitung)} jam hitung · {rp(h.nominal)}</b></div>)}
            </div>
            <p className="hint">Shift bergantian tiap minggu (Senin). Isi <b>Grup</b> di Data karyawan. Scan / tap sebelum jam ganti hari ({sh.gantiHari}) dihitung untuk hari kerja sebelumnya, jadi lembur shift 2 setelah tengah malam ikut tanggal shift itu dimulai. Petugas atau admin menandai <b>Shift 1 lembur</b> per tanggal di layar Scan / Input massal; saat itu shift 2 dihitung masuk {sh.shift2Lembur.masuk}–{sh.shift2Lembur.pulang}. Hari kerja: yang dihitung lembur hanya waktu di luar jam shift.</p>
          </div>
        </>
      )}

      <div className="full" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <b style={{ fontSize: 14 }}>Tarif PP 35/2021 yang dipakai</b>
        <div className="glass kv">
          <div><span>Hari kerja</span><b>Jam ke-1 × 1,5 · jam berikutnya × 2 (maks. 4 jam/hari)</b></div>
          <div><span>Hari libur / istirahat mingguan</span><b>{a.polaKerja === 5 ? 'Jam 1–8 × 2 · jam 9 × 3 · jam 10–12 × 4' : 'Jam 1–7 × 2 · jam 8 × 3 · jam 9–11 × 4'}</b></div>
          {a.polaKerja === 6 && <div><span>Libur resmi di hari terpendek</span><b>Jam 1–5 × 2 · jam 6 × 3 · jam 7–9 × 4</b></div>}
        </div>
        <b style={{ fontSize: 14, marginTop: 6 }}>Contoh dengan aturan ini (upah sejam Rp30.000)</b>
        <div className="glass kv">
          {contohList.map(([l, h]) => h && <div key={l}><span>{l}</span><b className="num">{jamFmt(h.jamLembur)} jam → {jamFmt(h.jamHitung)} jam hitung · {rp(h.nominal)}</b></div>)}
        </div>
        <p className="hint">Hari kerja dihitung mulai jam pulang normal walau tap in/jam mulai lebih awal. Scan ID card oleh petugas tetap memakai jam tetap 5,5 / 14 jam.</p>
      </div>
      <div className="full"><button type="submit" className="btn" disabled={simpan}>{simpan ? 'Menyimpan…' : 'Simpan aturan'}</button></div>
    </form>
  );
}

const hariIniWIB = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const tambahHari = (t, n) => { const d = new Date(`${t}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** Tanggal 20 terdekat (akhir periode gaji 21–20). */
const akhirPeriode = () => { const t = hariIniWIB(); const [y, m, dd] = t.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + (dd > 20 ? 1 : 0), 20)); return d.toISOString().slice(0, 10); };
const peta = (l) => (l?.lat != null ? `https://www.google.com/maps?q=${l.lat},${l.lng}` : null);

function Lokasi({ l }) {
  if (!l) return <span className="muted">—</span>;
  const url = peta(l);
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
      <span className={l.jauh ? 'err' : l.gagal ? 'muted' : ''}>{teksLokasi(l)}</span>
      {url && <a className="link" href={url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>Lihat di peta{l.akurasi ? ` (±${l.akurasi} m)` : ''}</a>}
    </span>
  );
}

function Eksklusif() {
  const toast = useToast();
  const [d, setD] = useState(null);
  const [karyawan, setKaryawan] = useState([]);
  const [form, setForm] = useState(null);
  const [lok, setLok] = useState(null);
  const [cabut, setCabut] = useState(null);
  const muat = useCallback(() => api('/api/mandiri/eksklusif').then((r) => { setD(r); setLok(r.lokasiPabrik ? { ...r.lokasiPabrik } : { nama: 'Pabrik', lat: '', lng: '', radiusM: 300 }); }).catch((e) => toast(e.message, true)), [toast]);
  useEffect(() => { muat(); api('/api/karyawan').then((l) => setKaryawan(l.filter((k) => k.aktif))).catch(() => {}); }, [muat]);
  if (!d) return <Memuat />;

  const simpanIzin = async (e) => {
    e.preventDefault();
    try {
      await api(`/api/mandiri/eksklusif/${form.karyawanId}`, { method: 'PUT', body: { sampai: form.sampai, alasan: form.alasan } });
      toast('Izin tap eksklusif disimpan');
      setForm(null); muat();
    } catch (er) { toast(er.message, true); }
  };
  const simpanLokasi = async (hapus) => {
    try {
      const body = hapus ? { lokasiPabrik: null } : { lokasiPabrik: { nama: lok.nama || 'Pabrik', lat: Number(lok.lat), lng: Number(lok.lng), radiusM: Number(lok.radiusM) || 300 } };
      if (!hapus && (!Number.isFinite(body.lokasiPabrik.lat) || !Number.isFinite(body.lokasiPabrik.lng) || lok.lat === '' || lok.lng === '')) { toast('Isi garis lintang & bujur, atau pakai lokasi HP ini.', true); return; }
      await api('/api/mandiri/lokasi-pabrik', { method: 'PUT', body });
      toast(hapus ? 'Titik pabrik dihapus' : 'Titik pabrik disimpan');
      muat();
    } catch (er) { toast(er.message, true); }
  };
  const pakaiHpIni = () => {
    if (!navigator.geolocation) { toast('Perangkat ini tidak mendukung lokasi.', true); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { setLok((x) => ({ ...x, lat: Math.round(p.coords.latitude * 1e6) / 1e6, lng: Math.round(p.coords.longitude * 1e6) / 1e6 })); toast(`Lokasi diambil (±${Math.round(p.coords.accuracy)} m). Klik Simpan.`); },
      () => toast('Lokasi tidak bisa diambil. Izinkan akses lokasi, atau isi manual dari Google Maps.', true),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };
  const sudahIzin = new Set(d.izin.map((i) => i.karyawan.id));

  return (
    <>
      <div className="glass note"><span className="tile t-amber"><Icon name="card" /></span><div>
        <b>Tap eksklusif</b> = karyawan scan ID card miliknya sendiri (+ verifikasi wajah) tanpa petugas. Cukup sekali scan, dihitung seperti scan petugas (5,5 / 14 jam hitung). Berikan hanya untuk yang lembur saat petugas tidak ada.
        Lokasi HP <b>dicatat, tidak memblokir</b>: periksa tap yang ditandai <span className="err">di luar area</span>. Admin pemberi izin tercatat sebagai penanggung jawab.
      </div></div>

      <div className="glass tablebox">
        <div className="tb-head"><b>Karyawan dengan izin</b>{!form && <button type="button" className="btn sm" onClick={() => setForm({ karyawanId: '', sampai: akhirPeriode() < hariIniWIB() ? tambahHari(hariIniWIB(), 30) : akhirPeriode(), alasan: '' })}>+ Beri izin</button>}</div>
        {form && (
          <form className="form" onSubmit={simpanIzin} style={{ padding: '0 16px 16px' }}>
            <div className="fld"><label htmlFor="ek-k">Karyawan</label>
              <select className="input" id="ek-k" required value={form.karyawanId} onChange={(e) => setForm({ ...form, karyawanId: e.target.value })} disabled={form.ubah}>
                <option value="">Pilih karyawan…</option>
                {karyawan.map((k) => <option key={k.id} value={k.id}>{k.nama} · {k.nik} · {k.departemen}{sudahIzin.has(k.id) ? ' (sudah ada izin)' : ''}</option>)}
              </select></div>
            <div className="fld"><label htmlFor="ek-s">Berlaku sampai</label><input className="input" type="date" id="ek-s" required min={hariIniWIB()} max={tambahHari(hariIniWIB(), 365)} value={form.sampai} onChange={(e) => setForm({ ...form, sampai: e.target.value })} /></div>
            <div className="fld full"><label htmlFor="ek-a">Alasan (dilihat karyawan)</label><input className="input" id="ek-a" required minLength={3} maxLength={200} placeholder="Contoh: lembur shift malam tanpa leader" value={form.alasan} onChange={(e) => setForm({ ...form, alasan: e.target.value })} /></div>
            <div className="full"><button type="submit" className="btn">Simpan izin</button><button type="button" className="btn key" onClick={() => setForm(null)}>Batal</button></div>
          </form>
        )}
        {!d.izin.length ? <div className="empty">Belum ada karyawan dengan izin tap eksklusif.</div> : (
          <div className="scroll"><table>
            <thead><tr><th>Karyawan</th><th>Berlaku sampai</th><th>Alasan</th><th>Aksi</th></tr></thead>
            <tbody>{d.izin.map((i) => (
              <tr key={i.karyawan.id}>
                <td><span className="namecell"><Avatar nama={i.karyawan.nama} kunci={i.karyawan.id} kecil /><span>{i.karyawan.nama}<div className="muted" style={{ fontSize: 12 }}>{i.karyawan.nik} · {i.karyawan.departemen}</div></span></span></td>
                <td>{i.berlaku ? tanggalPendek(i.sampai.slice(0, 10)) : <span className="badge b-mute">Berakhir {tanggalPendek(i.sampai.slice(0, 10))}</span>}</td>
                <td style={{ maxWidth: 280 }}>{i.alasan}</td>
                <td><div className="rowacts">
                  <button type="button" className="link" onClick={() => setForm({ ubah: true, karyawanId: String(i.karyawan.id), sampai: i.berlaku ? i.sampai.slice(0, 10) : akhirPeriode(), alasan: i.alasan || '' })}>{i.berlaku ? 'Ubah' : 'Perpanjang'}</button>
                  <button type="button" className="link danger" onClick={() => setCabut(i)}>Cabut</button>
                </div></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>

      <div className="glass form" style={{ gap: 12 }}>
        <h2>Titik lokasi pabrik</h2>
        <p className="hint" style={{ gridColumn: '1 / -1', margin: 0 }}>Jarak HP karyawan dihitung dari titik ini. Kosongkan kalau cukup mencatat koordinat saja.</p>
        <div className="fld"><label htmlFor="lp-n">Nama</label><input className="input" id="lp-n" value={lok.nama} onChange={(e) => setLok({ ...lok, nama: e.target.value })} /></div>
        <div className="fld"><label htmlFor="lp-r">Radius wajar (meter)</label><input className="input num" type="number" id="lp-r" min={50} max={20000} value={lok.radiusM} onChange={(e) => setLok({ ...lok, radiusM: e.target.value })} /></div>
        <div className="fld"><label htmlFor="lp-lat">Garis lintang (lat)</label><input className="input num" id="lp-lat" inputMode="decimal" placeholder="-6.30050" value={lok.lat} onChange={(e) => setLok({ ...lok, lat: e.target.value.replace(',', '.') })} /></div>
        <div className="fld"><label htmlFor="lp-lng">Garis bujur (lng)</label><input className="input num" id="lp-lng" inputMode="decimal" placeholder="107.15200" value={lok.lng} onChange={(e) => setLok({ ...lok, lng: e.target.value.replace(',', '.') })} /></div>
        <div className="full">
          <button type="button" className="btn" onClick={() => simpanLokasi(false)}>Simpan titik</button>
          <button type="button" className="btn key" onClick={pakaiHpIni}>Pakai lokasi HP ini</button>
          {d.lokasiPabrik && <button type="button" className="link danger" onClick={() => simpanLokasi(true)}>Hapus titik</button>}
          {d.lokasiPabrik && <a className="link" href={peta(d.lokasiPabrik)} target="_blank" rel="noreferrer">Lihat di peta</a>}
        </div>
      </div>

      <div className="glass tablebox">
        <div className="tb-head"><b>Tap eksklusif terakhir</b><span className="muted" style={{ fontSize: 13 }}>{d.tap.filter((t) => t.lokasi?.jauh).length} di luar area</span></div>
        {!d.tap.length ? <div className="empty">Belum ada tap eksklusif.</div> : (
          <div className="scroll"><table>
            <thead><tr><th>Tanggal</th><th>Karyawan</th><th>Jam tap</th><th>Hari</th><th className="n">Jam hitung</th><th>Lokasi HP</th></tr></thead>
            <tbody>{d.tap.map((t) => (
              <tr key={t.id} className={t.lokasi?.jauh ? 'warn' : ''}>
                <td>{tanggalPendek(t.tanggal)}</td>
                <td>{t.karyawan.nama}<div className="muted" style={{ fontSize: 12 }}>{t.karyawan.nik}</div></td>
                <td className="num">{t.jam}</td>
                <td><span className={`badge ${t.jenisHari === 'KERJA' ? 'b-ok' : 'b-warn'}`}>{t.jenisHari === 'KERJA' ? 'Hari kerja' : 'Libur'}</span></td>
                <td className="n">{jamFmt(t.jamHitung)}<div className="muted" style={{ fontSize: 12 }}>{rp(t.nominal)}</div></td>
                <td><Lokasi l={t.lokasi} /></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>

      {cabut && (
        <Konfirmasi judul={`Cabut izin ${cabut.karyawan.nama}?`} isi="Karyawan kembali wajib memindai QR dari HP petugas. Tap eksklusif yang sudah tercatat tetap ada di rekap." labelOk="Cabut izin" bahaya
          onBatal={() => setCabut(null)}
          onOk={async () => { const i = cabut; setCabut(null); try { await api(`/api/mandiri/eksklusif/${i.karyawan.id}`, { method: 'DELETE' }); toast('Izin dicabut'); muat(); } catch (e) { toast(e.message, true); } }} />
      )}
    </>
  );
}

export default function LemburMandiri() {
  const [tab, setTab] = useState('wajah');
  return (
    <>
      <div className="ph">
        <div><h1>Tap mandiri</h1><p>Karyawan tap in / tap out sendiri dari portal: verifikasi wajah + QR dinamis petugas. Lembur dihitung jam aktual sesuai PP 35/2021.</p></div>
      </div>
      <div className="seg" role="tablist" aria-label="Bagian" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))', maxWidth: 720 }}>
        {[['wajah', 'Persetujuan wajah'], ['sesi', 'Sedang lembur'], ['eksklusif', 'Tap eksklusif'], ['aturan', 'Aturan hitung']].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === 'wajah' ? <Wajah /> : tab === 'sesi' ? <Sesi /> : tab === 'eksklusif' ? <Eksklusif /> : <Aturan />}
    </>
  );
}
