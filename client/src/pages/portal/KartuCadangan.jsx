import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../../api.js';
import { Memuat, Modal } from '../../components/ui.jsx';

/** QR cadangan di HP, untuk dipakai sendiri kalau ID card tertinggal. */
export default function KartuCadangan({ onClose }) {
  const [data, setData] = useState(null);
  const [gambar, setGambar] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    api('/api/portal/qr').then(async (d) => {
      setData(d);
      setGambar(await QRCode.toDataURL(d.qrToken, { margin: 2, width: 520, errorCorrectionLevel: 'M' }));
    }).catch((e) => setErr(e.message));
  }, []);

  return (
    <Modal judul="Kartu QR cadangan" onClose={onClose}>
      {err ? <p className="err">{err}</p> : !data ? <Memuat /> : (
        <>
          <div className="qr-cadangan">
            {gambar && <img src={gambar} alt={`QR lembur ${data.karyawan.nama}`} />}
            <b style={{ fontSize: 17 }}>{data.karyawan.nama}</b>
            <span className="muted num" style={{ fontSize: 13 }}>{data.karyawan.nik} · {data.karyawan.departemen}</span>
          </div>
          {data.perluCetakUlang && <p className="err">QR Anda baru diganti HRD. ID card lama sudah tidak berlaku, pakai QR ini sampai kartu baru dicetak.</p>}
          <p>Tunjukkan ke petugas hanya kalau ID card tertinggal. Naikkan kecerahan layar supaya mudah discan.</p>
          <p><b>Jangan kirim tangkapan layar QR ini ke orang lain.</b> Setiap tap tercatat atas nama Anda dan diperiksa HRD.</p>
          <div className="acts"><button type="button" className="btn key" onClick={onClose} autoFocus>Tutup</button></div>
        </>
      )}
    </Modal>
  );
}
