import { NavLink, Outlet } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';

export default function PetugasLayout() {
  return (
    <div className="p-shell">
      <Outlet />
      <nav className="tabs t5 glass" aria-label="Navigasi aplikasi">
        <NavLink to="/scan"><Icon name="scan" /><span>Scan</span></NavLink>
        <NavLink to="/qr"><Icon name="qr" /><span>QR</span></NavLink>
        <NavLink to="/input"><Icon name="users" /><span>Input</span></NavLink>
        <NavLink to="/riwayat"><Icon name="clock" /><span>Riwayat</span></NavLink>
        <NavLink to="/akun"><Icon name="user" /><span>Akun</span></NavLink>
      </nav>
    </div>
  );
}
