import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';
import { Avatar, Konfirmasi, Memuat, Modal, useToast } from '../../components/ui.jsx';
import { jamFmt, rp } from '../../format.js';
import { hitungLemburAktual } from '../../lib/hitungAktual.js';

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
  useEffect(() => { api('/api/mandiri/aturan').then((r) => setA(r.aturan)).catch((e) => toast(e.message, true)); }, [toast]);
  if (!a) return <Memuat />;
  const ubah = (p) => setA((x) => ({ ...x, ...p }));
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
        <label htmlFor="at-pulang">Jam pulang normal hari kerja</label>
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

export default function LemburMandiri() {
  const [tab, setTab] = useState('wajah');
  return (
    <>
      <div className="ph">
        <div><h1>Tap mandiri</h1><p>Karyawan tap in / tap out sendiri dari portal: verifikasi wajah + QR dinamis petugas. Lembur dihitung jam aktual sesuai PP 35/2021.</p></div>
      </div>
      <div className="seg" role="tablist" aria-label="Bagian" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))', maxWidth: 560 }}>
        {[['wajah', 'Persetujuan wajah'], ['sesi', 'Sedang lembur'], ['aturan', 'Aturan hitung']].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === 'wajah' ? <Wajah /> : tab === 'sesi' ? <Sesi /> : <Aturan />}
    </>
  );
}
