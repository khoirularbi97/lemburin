import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';
import { Avatar, Memuat, Modal, useToast } from '../../components/ui.jsx';
import { jamFmt, rp, tanggalPanjang, tanggalPendek } from '../../format.js';

const TAB = [
  ['MENUNGGU', 'Menunggu'],
  ['DISETUJUI', 'Disetujui'],
  ['DITOLAK', 'Ditolak'],
  ['DIBATALKAN', 'Dibatalkan'],
];

function waktu(iso) {
  return new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function Proses({ p, aksi, onTutup, onSelesai }) {
  const toast = useToast();
  const setuju = aksi === 'setujui';
  const [jam, setJam] = useState(p.jam);
  const [catatan, setCatatan] = useState('');
  const [err, setErr] = useState('');
  const [proses, setProses] = useState(false);

  async function kirim(e) {
    e.preventDefault();
    if (!setuju && catatan.trim().length < 3) return setErr('Tulis alasan penolakan supaya karyawan tahu.');
    setProses(true);
    try {
      if (setuju) {
        const r = await api(`/api/pengajuan/${p.id}/setujui`, { method: 'POST', body: { jam, ...(catatan.trim() ? { catatan: catatan.trim() } : {}) } });
        toast(`Disetujui · ${p.karyawan.nama} ${tanggalPendek(p.tanggal)} tercatat ${rp(r.tap.nominal)}`);
      } else {
        await api(`/api/pengajuan/${p.id}/tolak`, { method: 'POST', body: { catatan: catatan.trim() } });
        toast(`Pengajuan ${p.karyawan.nama} ditolak`);
      }
      onSelesai();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setProses(false);
    }
  }

  return (
    <Modal judul={setuju ? 'Setujui pengajuan?' : 'Tolak pengajuan?'} onClose={onTutup}>
      <p>
        <b>{p.karyawan.nama}</b> · {tanggalPanjang(p.tanggal)}.{' '}
        {setuju ? 'Lembur akan dicatat sebagai tap manual atas nama Anda dan karyawan diberi notifikasi.' : 'Karyawan akan melihat catatan penolakan di portalnya.'}
      </p>
      <form onSubmit={kirim} noValidate style={{ display: 'grid', gap: 14 }}>
        {setuju && (
          <>
            <div className="glass kv">
              <div><span>Jenis hari</span><b>{p.perkiraan.label}</b></div>
              <div><span>Jam hitung × upah sejam</span><b className="num">{jamFmt(p.perkiraan.jamHitung)} × {rp(p.perkiraan.upahSejam)}</b></div>
              <div><span>Upah lembur</span><b className="num">{rp(p.perkiraan.nominal)}</b></div>
            </div>
            <div className="fld" style={{ maxWidth: 200 }}>
              <label htmlFor="pr-jam">Jam selesai (WIB)</label>
              <input className="input" type="time" id="pr-jam" value={jam} onChange={(e) => setJam(e.target.value)} />
            </div>
          </>
        )}
        <div className="fld">
          <label htmlFor="pr-cat">{setuju ? 'Catatan (opsional)' : 'Alasan penolakan'}</label>
          <input className="input" id="pr-cat" maxLength={200} autoFocus={!setuju} placeholder={setuju ? 'Contoh: sesuai SPL 045' : 'Contoh: tidak ada SPL di tanggal itu'} value={catatan} onChange={(e) => { setCatatan(e.target.value); setErr(''); }} />
        </div>
        {err && <p className="err" role="alert">{err}</p>}
        <div className="acts">
          <button type="button" className="btn key" onClick={onTutup}>Batal</button>
          <button type="submit" className={`btn${setuju ? '' : ' danger'}`} disabled={proses}>{proses ? 'Memproses…' : setuju ? 'Setujui & catat' : 'Tolak'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Pengajuan() {
  const toast = useToast();
  const [status, setStatus] = useState('MENUNGGU');
  const [list, setList] = useState(null);
  const [aksi, setAksi] = useState(null); // { p, aksi }

  const muat = useCallback(() => {
    setList(null);
    api(`/api/pengajuan?status=${status}`).then(setList).catch((e) => toast(e.message, true));
  }, [status, toast]);
  useEffect(() => { muat(); }, [muat]);

  return (
    <>
      <div className="ph">
        <div><h1>Pengajuan tap terlewat</h1><p>Laporan karyawan dari portal. Disetujui = otomatis jadi tap manual dengan aturan 5,5 / 14 jam yang sama.</p></div>
      </div>

      <div className="seg" role="tablist" aria-label="Status pengajuan" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))', maxWidth: 560 }}>
        {TAB.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={status === k} className={status === k ? 'on' : ''} onClick={() => setStatus(k)}>{l}</button>)}
      </div>

      {!list ? <Memuat /> : !list.length ? (
        <div className="glass tablebox"><div className="empty">{status === 'MENUNGGU' ? 'Tidak ada pengajuan yang menunggu.' : 'Belum ada pengajuan di sini.'}</div></div>
      ) : (
        <div className="glass tablebox">
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Karyawan</th><th>Tanggal lembur</th><th>Jam</th><th>Alasan karyawan</th>
                  {status === 'MENUNGGU' ? <><th className="n">Perkiraan</th><th>Aksi</th></> : <><th className="n">Nominal</th><th>Diproses</th></>}
                </tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span className="namecell"><Avatar nama={p.karyawan.nama} kunci={p.karyawan.id} kecil />
                        <span>{p.karyawan.nama}<div className="muted" style={{ fontSize: 12 }}>{p.karyawan.nik} · {p.karyawan.departemen}</div></span>
                      </span>
                    </td>
                    <td>{tanggalPendek(p.tanggal)}{p.perkiraan && <div className="muted" style={{ fontSize: 12 }}>{p.perkiraan.label}</div>}</td>
                    <td className="num">{p.jam}</td>
                    <td style={{ maxWidth: 280 }}>
                      {p.alasan}
                      <div className="muted" style={{ fontSize: 12 }}>Diajukan {waktu(p.dibuat)}</div>
                      {p.kendala && <div className="err" style={{ fontSize: 12, marginTop: 4 }}>{p.kendala}</div>}
                    </td>
                    {status === 'MENUNGGU' ? (
                      <>
                        <td className="n" style={{ fontWeight: 800 }}>{rp(p.perkiraan.nominal)}<div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>{jamFmt(p.perkiraan.jamHitung)} jam</div></td>
                        <td>
                          <div className="rowacts">
                            <button type="button" className="link" disabled={Boolean(p.kendala)} title={p.kendala || ''} onClick={() => setAksi({ p, aksi: 'setujui' })}>Setujui</button>
                            <button type="button" className="link danger" onClick={() => setAksi({ p, aksi: 'tolak' })}>Tolak</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="n">{p.nominal != null ? rp(p.nominal) : '–'}</td>
                        <td>
                          {p.diprosesOleh ? <>{p.diprosesOleh}<div className="muted" style={{ fontSize: 12 }}>{waktu(p.diprosesPada)}</div></> : <span className="muted">Dibatalkan karyawan</span>}
                          {p.catatanAdmin && <div className="muted" style={{ fontSize: 12 }}>“{p.catatanAdmin}”</div>}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Pengajuan hanya bisa untuk tanggal 1 bulan lalu sampai hari ini. Kalau karyawan sudah punya tap di tanggal itu, pengajuan tidak bisa disetujui. Cocokkan dengan Surat Perintah Lembur sebelum menyetujui.
      </p>

      {aksi && (
        <Proses
          p={aksi.p}
          aksi={aksi.aksi}
          onTutup={() => setAksi(null)}
          onSelesai={() => { setAksi(null); muat(); window.dispatchEvent(new Event('lq:pengajuan')); }}
        />
      )}
    </>
  );
}
