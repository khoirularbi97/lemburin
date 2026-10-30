import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { inisial, warnaAvatar } from '../format.js';

/* ---------- Toast ---------- */
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timer = useRef();
  const show = useCallback((pesan, error = false) => {
    setToast({ pesan, error, id: Date.now() });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && <div key={toast.id} role="status" className={`toast${toast.error ? ' err' : ''}`}>{toast.pesan}</div>}
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/* ---------- Modal ---------- */
export function Modal({ judul, onClose, children, lebar }) {
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={judul} style={lebar ? { width: `min(${lebar}px,100%)` } : undefined}>
        <h2>{judul}</h2>
        {children}
      </div>
    </div>
  );
}

/** Konfirmasi sebelum aksi yang tidak bisa dibatalkan. */
export function Konfirmasi({ judul, isi, labelOk, bahaya, onOk, onBatal }) {
  const [proses, setProses] = useState(false);
  return (
    <Modal judul={judul} onClose={onBatal}>
      <p>{isi}</p>
      <div className="acts">
        <button type="button" className="btn key" onClick={onBatal}>Batal</button>
        <button
          type="button"
          className={`btn${bahaya ? ' danger' : ''}`}
          disabled={proses}
          autoFocus
          onClick={async () => { setProses(true); try { await onOk(); } finally { setProses(false); } }}
        >
          {proses ? 'Memproses…' : labelOk}
        </button>
      </div>
    </Modal>
  );
}

export function Avatar({ nama, kunci, kecil }) {
  return <span className={`av${kecil ? ' s' : ''} ${warnaAvatar(kunci ?? nama)}`} aria-hidden="true">{inisial(nama)}</span>;
}

export function Tile({ icon, warna = 't-teal', size = 46 }) {
  return (
    <span className={`tile ${warna}`} style={{ width: size, height: size, borderRadius: size * 0.3 }}>
      <Icon name={icon} />
    </span>
  );
}

export function Stat({ icon, warna, label, nilai, sub, gelap }) {
  return (
    <div className={`stat ${gelap ? 'dark' : 'glass'}`}>
      <Tile icon={icon} warna={warna} />
      <div style={{ minWidth: 0 }}>
        <div className="k">{label}</div>
        <div className="v num">{nilai}</div>
        {sub && <div className="s">{sub}</div>}
      </div>
    </div>
  );
}

export function Memuat({ teks = 'Memuat data…' }) {
  return <div className="empty" role="status">{teks}</div>;
}

/** Input kata sandi dengan tombol tampilkan/sembunyikan di dalam kolom. */
export function InputSandi({ className = 'input', ...props }) {
  const [lihat, setLihat] = useState(false);
  return (
    <span className="pw-wrap">
      <input {...props} className={className} type={lihat ? 'text' : 'password'} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      <button
        type="button"
        className="pw-eye"
        onClick={() => setLihat((v) => !v)}
        aria-label={lihat ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
        aria-pressed={lihat}
        aria-controls={props.id}
        title={lihat ? 'Sembunyikan' : 'Tampilkan'}
      >
        <Icon name={lihat ? 'mataTutup' : 'mata'} size={20} />
      </button>
    </span>
  );
}
