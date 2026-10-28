import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import Icon from './Icon.jsx';
import { Modal } from './ui.jsx';

const NAMA_PERUSAHAAN = import.meta.env.VITE_NAMA_PERUSAHAAN || '[NAMA PERUSAHAAN]';

function bulat(x, px, py, w, h, r) {
  x.beginPath();
  x.moveTo(px + r, py);
  x.arcTo(px + w, py, px + w, py + h, r);
  x.arcTo(px + w, py + h, px, py + h, r);
  x.arcTo(px, py + h, px, py, r);
  x.arcTo(px, py, px + w, py, r);
  x.closePath();
}

/** Gambar ID card ke canvas ukuran 1012x638 px (rasio kartu CR80, ±300 dpi). */
async function gambarKartu(k) {
  const qr = await QRCode.toDataURL(k.qrToken, { margin: 2, width: 600, errorCorrectionLevel: 'M' });
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = qr; });
  const W = 1012; const H = 638;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const F = "'Plus Jakarta Sans', Arial, sans-serif";
  x.fillStyle = '#FFFFFF'; bulat(x, 0, 0, W, H, 36); x.fill();
  x.save(); bulat(x, 0, 0, W, H, 36); x.clip();
  const g = x.createLinearGradient(0, 0, W, 120); g.addColorStop(0, '#2E3672'); g.addColorStop(1, '#12152B');
  x.fillStyle = g; x.fillRect(0, 0, W, 120);
  const g2 = x.createLinearGradient(0, 0, W, 0); g2.addColorStop(0, '#2CC9A8'); g2.addColorStop(0.5, '#8C9BFF'); g2.addColorStop(1, '#FFC861');
  x.fillStyle = g2; x.fillRect(0, 120, W, 10);
  x.restore();
  x.fillStyle = '#FFFFFF'; x.font = `800 32px ${F}`; x.fillText(NAMA_PERUSAHAAN, 44, 72);
  x.fillStyle = '#C5CAE6'; x.font = `700 18px ${F}`; x.textAlign = 'right'; x.fillText('KARTU KARYAWAN', W - 44, 70); x.textAlign = 'left';
  x.fillStyle = '#E4E7F2'; bulat(x, 44, 180, 170, 220, 24); x.fill();
  x.fillStyle = '#4F5670'; x.font = `600 18px ${F}`; x.fillText('Tempel foto', 78, 296);
  x.fillStyle = '#161A2E'; x.font = `800 44px ${F}`; x.fillText(k.nama, 244, 236);
  x.fillStyle = '#4F5670'; x.font = `600 26px ${F}`; x.fillText(`${k.jabatan} · ${k.departemen}`, 244, 282);
  x.fillStyle = '#EEF0F7'; bulat(x, 244, 318, 240, 76, 16); x.fill();
  x.fillStyle = '#4F5670'; x.font = `800 16px ${F}`; x.fillText('NIK', 264, 346);
  x.fillStyle = '#161A2E'; x.font = `800 28px ${F}`; x.fillText(k.nik, 264, 380);
  x.imageSmoothingEnabled = false; x.drawImage(img, W - 44 - 300, 160, 300, 300);
  x.fillStyle = '#4F5670'; x.font = `800 18px ${F}`; x.textAlign = 'center'; x.fillText('SCAN UNTUK LEMBUR', W - 44 - 150, 495);
  return c;
}

export default function IdCard({ karyawan: k, onClose, onSudahDicetak }) {
  const [qr, setQr] = useState('');

  useEffect(() => {
    QRCode.toDataURL(k.qrToken, { margin: 1, width: 360, errorCorrectionLevel: 'M' }).then(setQr);
  }, [k.qrToken]);

  async function unduh() {
    const c = await gambarKartu(k);
    const a = document.createElement('a');
    a.href = c.toDataURL('image/png');
    a.download = `id-card-${k.nik}.png`;
    a.click();
  }

  return (
    <Modal judul={`ID card ${k.nama}`} onClose={onClose}>
      <div className="idstage print-area">
        <div className="idcard">
          <div className="hd">{NAMA_PERUSAHAAN}<span>KARTU KARYAWAN</span></div>
          <div className="holo" />
          <div className="bd">
            <div className="info">
              <b>{k.nama}</b>
              <span>{k.jabatan} · {k.departemen}</span>
              <span className="nik num">{k.nik}</span>
            </div>
            <div className="qr">{qr && <img src={qr} alt={`QR lembur ${k.nama}`} />}</div>
          </div>
        </div>
      </div>
      <p>QR berisi token acak. Kalau kartu hilang, pakai Ganti QR supaya kartu lama langsung ditolak.</p>
      {k.perluCetakUlang && <p className="err">QR kartu ini baru diganti. Cetak ulang sebelum dipakai.</p>}
      <div className="acts">
        {k.perluCetakUlang && <button type="button" className="btn key" onClick={onSudahDicetak}>Tandai sudah dicetak</button>}
        <button type="button" className="btn key" onClick={() => window.print()}><Icon name="print" size={18} />Cetak</button>
        <button type="button" className="btn" onClick={unduh}><Icon name="down" size={18} />Unduh PNG</button>
      </div>
    </Modal>
  );
}
