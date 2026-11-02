import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import Icon from '../../components/Icon.jsx';
import { Avatar } from '../../components/ui.jsx';

const MENU = [
  ['/admin', 'Dashboard', 'grid', true],
  ['/admin/rekap', 'Rekap lembur', 'chart'],
  ['/admin/massal', 'Input lembur massal', 'plus'],
  ['/admin/pengajuan', 'Pengajuan tap', 'clock'],
  ['/admin/karyawan', 'Data karyawan & ID card', 'users'],
  ['/admin/libur', 'Kalender hari libur', 'cal'],
  ['/admin/pengguna', 'Pengguna & petugas', 'shield'],
  ['/scan', 'Buka scanner', 'scan'],
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  // Hanya dipakai di layar HP: menu tampil sebagai dropdown dari navbar atas
  const [buka, setBuka] = useState(false);

  const [menunggu, setMenunggu] = useState(0);

  useEffect(() => { setBuka(false); }, [pathname]);

  // Jumlah pengajuan karyawan yang belum diproses, untuk badge di menu
  useEffect(() => {
    const muat = () => api('/api/pengajuan/jumlah').then((r) => setMenunggu(r.menunggu)).catch(() => {});
    muat();
    window.addEventListener('lq:pengajuan', muat);
    return () => window.removeEventListener('lq:pengajuan', muat);
  }, [pathname]);

  useEffect(() => {
    if (!buka) return undefined;
    const esc = (e) => { if (e.key === 'Escape') setBuka(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [buka]);

  const halaman = MENU.find(([to, , , end]) => (end ? pathname === to : pathname.startsWith(to)))?.[1] || 'Menu';

  return (
    <div className="a-wrap">
      {buka && <div className="sb-scrim" onClick={() => setBuka(false)} aria-hidden="true" />}
      <nav className={`side${buka ? ' buka' : ''}`} aria-label="Menu admin">
        <div className="sb-top">
          <div className="sb-brand">
            <img src="/logo.svg" alt="" width="46" height="46" />
            <span>lembur<span style={{ color: 'var(--tealGlow)' }}>in</span></span>
          </div>
          <button
            type="button"
            className="sb-toggle"
            aria-expanded={buka}
            aria-controls="menu-admin"
            aria-label={buka ? 'Tutup menu' : `Buka menu, halaman ${halaman}`}
            onClick={() => setBuka((b) => !b)}
          >
            <span className="sb-current">{halaman}{menunggu > 0 && <span className="nbadge-side" style={{ marginLeft: 8 }}>{menunggu}</span>}</span>
            <Icon name={buka ? 'x' : 'menu'} size={20} />
          </button>
        </div>
        <div className="sb-menu" id="menu-admin">
          {MENU.map(([to, label, icon, end]) => (
            <NavLink key={to} to={to} end={end} className="nv">
              <span className="ni"><Icon name={icon} /></span>{label}
              {to === '/admin/pengajuan' && menunggu > 0 && <span className="nbadge-side" aria-label={`${menunggu} menunggu`}>{menunggu}</span>}
            </NavLink>
          ))}
          <div className="me">
            <Avatar nama={user.nama || user.username} kunci={user.username} kecil />
            <div><b>{user.username}</b><span>Admin</span></div>
            <button type="button" onClick={logout}>Keluar</button>
          </div>
        </div>
      </nav>
      <section className="content">
        <Outlet />
      </section>
    </div>
  );
}
