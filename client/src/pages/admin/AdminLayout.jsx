import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth.jsx';
import Icon from '../../components/Icon.jsx';
import { Avatar } from '../../components/ui.jsx';

const MENU = [
  ['/admin', 'Dashboard', 'grid', true],
  ['/admin/rekap', 'Rekap lembur', 'chart'],
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

  useEffect(() => { setBuka(false); }, [pathname]);

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
            <span className="sb-current">{halaman}</span>
            <Icon name={buka ? 'x' : 'menu'} size={20} />
          </button>
        </div>
        <div className="sb-menu" id="menu-admin">
          {MENU.map(([to, label, icon, end]) => (
            <NavLink key={to} to={to} end={end} className="nv">
              <span className="ni"><Icon name={icon} /></span>{label}
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
