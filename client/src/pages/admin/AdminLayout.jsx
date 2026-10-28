import { NavLink, Outlet } from 'react-router-dom';
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
  return (
    <div className="a-wrap">
      <nav className="side" aria-label="Menu admin">
        <div className="sb-brand">
          <img src="/logo.svg" alt="" width="46" height="46" />
          <span>lembur<span style={{ color: 'var(--tealGlow)' }}>in</span></span>
        </div>
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
      </nav>
      <section className="content">
        <Outlet />
      </section>
    </div>
  );
}
