import { useEffect } from 'react';
import { Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import Icon from '../../components/Icon.jsx';
import { pasangPenerimaNotifikasi } from '../../push.js';
import { useToast } from '../../components/ui.jsx';

export default function PortalLayout() {
  const { user, perbaruiProfil } = useAuth();
  const nav = useNavigate();

  const toast = useToast();
  useEffect(() => { pasangPenerimaNotifikasi({ buka: (url) => nav(url), tampil: (t) => toast(t) }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Ambil profil terbaru sekali saat portal dibuka (401 → otomatis keluar lewat api.js)
  useEffect(() => { api('/api/portal/saya').then((s) => perbaruiProfil(s.karyawan)).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (user.wajibGantiSandi) return <Navigate to="/portal/sandi" replace />;

  return (
    <div className="p-shell">
      <Outlet />
      <nav className="tabs t4 glass" aria-label="Navigasi portal karyawan">
        <NavLink to="/portal" end><Icon name="grid" /><span>Beranda</span></NavLink>
        <NavLink to="/portal/riwayat"><Icon name="clock" /><span>Riwayat</span></NavLink>
        <NavLink to="/portal/pengajuan"><Icon name="plus" /><span>Pengajuan</span></NavLink>
        <NavLink to="/portal/akun"><Icon name="user" /><span>Akun</span></NavLink>
      </nav>
    </div>
  );
}
