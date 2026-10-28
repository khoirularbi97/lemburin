import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { panaskanServer } from './api.js';
import { halamanAwal, useAuth } from './auth.jsx';
import { Memuat } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import PetugasLayout from './pages/petugas/PetugasLayout.jsx';
import Riwayat from './pages/petugas/Riwayat.jsx';
import Akun from './pages/petugas/Akun.jsx';

// Dimuat terpisah supaya aplikasi petugas di HP tetap ringan
const Scan = lazy(() => import('./pages/petugas/Scan.jsx'));
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout.jsx'));
const Dashboard = lazy(() => import('./pages/admin/Dashboard.jsx'));
const Rekap = lazy(() => import('./pages/admin/Rekap.jsx'));
const Karyawan = lazy(() => import('./pages/admin/Karyawan.jsx'));
const Libur = lazy(() => import('./pages/admin/Libur.jsx'));
const Pengguna = lazy(() => import('./pages/admin/Pengguna.jsx'));

function Wajib({ peran, children }) {
  const { user } = useAuth();
  const loc = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ dari: loc.pathname }} />;
  if (peran && !peran.includes(user.role)) return <Navigate to={halamanAwal(user)} replace />;
  return children;
}

/** Banner saat backend Render masih bangun dari tidur (cold start). */
function StatusServer() {
  const [status, setStatus] = useState('cek');
  useEffect(() => {
    let batal = false;
    const lambat = setTimeout(() => { if (!batal) setStatus((s) => (s === 'cek' ? 'lambat' : s)); }, 2500);
    panaskanServer().then((ok) => { if (!batal) setStatus(ok ? 'siap' : 'gagal'); });
    return () => { batal = true; clearTimeout(lambat); };
  }, []);
  if (status === 'lambat') return <div className="banner" role="status"><span className="spin" />Menyambungkan ke server… bisa sampai 1 menit kalau server baru bangun.</div>;
  if (status === 'gagal') return <div className="banner" role="alert">Server tidak bisa dihubungi. Periksa internet, lalu muat ulang halaman.</div>;
  return null;
}

export default function App() {
  const { user } = useAuth();
  return (
    <>
      <StatusServer />
      <Suspense fallback={<Memuat teks="Memuat halaman…" />}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to={halamanAwal(user)} replace /> : <Login />} />
        <Route element={<Wajib peran={['PETUGAS', 'ADMIN']}><PetugasLayout /></Wajib>}>
          <Route path="/scan" element={<Scan />} />
          <Route path="/riwayat" element={<Riwayat />} />
          <Route path="/akun" element={<Akun />} />
        </Route>
        <Route path="/admin" element={<Wajib peran={['ADMIN']}><AdminLayout /></Wajib>}>
          <Route index element={<Dashboard />} />
          <Route path="rekap" element={<Rekap />} />
          <Route path="karyawan" element={<Karyawan />} />
          <Route path="libur" element={<Libur />} />
          <Route path="pengguna" element={<Pengguna />} />
        </Route>
        <Route path="*" element={<Navigate to={user ? halamanAwal(user) : '/login'} replace />} />
      </Routes>
      </Suspense>
    </>
  );
}
