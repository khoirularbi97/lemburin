import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { keluarAplikasi, pasangTombolKembali, PLATFORM } from '../platform.js';
import { Konfirmasi } from './ui.jsx';

// Halaman utama tiap bagian: tombol Kembali di sini menanyakan "Keluar dari lemburin?"
const AKAR = ['/login', '/scan', '/portal', '/portal/sandi', '/admin'];

/** Halaman tujuan saat Kembali ditekan di sub-halaman (tab lain → tab utama). */
function induk(path) {
  if (path.startsWith('/portal/')) return '/portal';
  if (path.startsWith('/admin/')) return '/admin';
  if (path === '/riwayat' || path === '/akun') return '/scan';
  return null;
}

/**
 * Perilaku tombol Kembali di aplikasi Android:
 * 1. tutup hasil scan / popup / menu yang sedang terbuka;
 * 2. dari tab lain, kembali ke tab utama (Scan, Beranda, Dashboard);
 * 3. di halaman utama, tanya dulu sebelum keluar dari aplikasi.
 */
export default function TombolKembali() {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const { user } = useAuth();
  const [tanya, setTanya] = useState(false);
  const ref = useRef({});
  ref.current = { pathname, tanya, user };

  useEffect(() => {
    if (PLATFORM !== 'android') return undefined;
    let lepas = () => {};
    pasangTombolKembali(() => {
      const { pathname: p, tanya: t } = ref.current;
      if (t) { setTanya(false); return true; }
      const hasil = document.querySelector('.result .btn');
      if (hasil) { hasil.click(); return true; }
      if (document.querySelector('.scrim, .side.buka')) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        return true;
      }
      const ke = induk(p);
      if (ke) { nav(ke, { replace: true }); return true; }
      if (AKAR.includes(p)) { setTanya(true); return true; }
      return false;
    }).then((f) => { lepas = f; });
    return () => lepas();
  }, [nav]);

  if (!tanya) return null;
  return (
    <Konfirmasi
      judul="Keluar dari lemburin?"
      isi={user ? 'Aplikasi ditutup. Anda tetap masuk, jadi tidak perlu login lagi saat membukanya.' : 'Aplikasi akan ditutup.'}
      labelOk="Keluar"
      onBatal={() => setTanya(false)}
      onOk={() => { setTanya(false); keluarAplikasi(); }}
    />
  );
}
