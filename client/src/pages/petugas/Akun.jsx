import { Link } from 'react-router-dom';
import { useAuth } from '../../auth.jsx';
import { Avatar } from '../../components/ui.jsx';

export default function Akun() {
  const { user, logout } = useAuth();
  const admin = user.role === 'ADMIN';
  return (
    <main className="p-body">
      <div className="p-head"><div><h1>Akun</h1><p>Masuk sebagai {user.username}</p></div></div>
      <div className="glass who">
        <Avatar nama={user.nama || user.username} kunci={user.username} />
        <div><b style={{ fontSize: 17 }}>{user.nama}</b><div className="muted" style={{ fontSize: 13 }}>{admin ? 'Admin' : 'Petugas scan'} · {user.area}</div></div>
      </div>
      <div className="glass kv">
        <div><span>Username</span><b>{user.username}</b></div>
        <div><span>Peran</span><b>{admin ? 'Admin' : 'Petugas scan'}</b></div>
        <div><span>Hak akses</span><b>{admin ? 'Semua fitur' : 'Scan & riwayat sendiri'}</b></div>
      </div>
      {admin && <Link className="btn key lg" to="/admin">Buka panel admin</Link>}
      <button type="button" className="btn ink lg" onClick={logout}>Keluar</button>
    </main>
  );
}
