import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { halamanAwal, useAuth } from '../auth.jsx';

const KUNCI_MODE = 'lq_mode_login';

function bacaMode() {
  try { return localStorage.getItem(KUNCI_MODE) === 'staf' ? 'staf' : 'karyawan'; } catch { return 'karyawan'; }
}

export default function Login() {
  const { login, loginKaryawan } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [mode, setMode] = useState(bacaMode);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [proses, setProses] = useState(false);
  const karyawan = mode === 'karyawan';

  function pilihMode(m) {
    setMode(m);
    setError('');
    setUsername('');
    setPassword('');
    try { localStorage.setItem(KUNCI_MODE, m); } catch { /* abaikan */ }
  }

  async function kirim(e) {
    e.preventDefault();
    setError('');
    setProses(true);
    try {
      if (karyawan) {
        const u = await loginKaryawan(username.trim(), password);
        const dari = loc.state?.dari;
        nav(!u.wajibGantiSandi && dari?.startsWith('/portal') ? dari : halamanAwal(u), { replace: true });
      } else {
        const user = await login(username.trim(), password);
        const dari = loc.state?.dari;
        const boleh = dari && !dari.startsWith('/portal') && (user.role === 'ADMIN' || !dari.startsWith('/admin'));
        nav(boleh ? dari : halamanAwal(user), { replace: true });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setProses(false);
    }
  }

  return (
    <main className="login">
      <span className="orb-deco" aria-hidden="true" style={{ right: -40, top: '12%', width: 160, height: 160, background: 'radial-gradient(circle at 32% 28%,#fff 0,#B4BDFF 30%,#4250D6 100%)', boxShadow: '0 34px 44px -22px rgba(66,80,214,.65)' }} />
      <span className="orb-deco" aria-hidden="true" style={{ left: -30, bottom: '18%', width: 80, height: 80, background: 'radial-gradient(circle at 32% 28%,#fff 0,#FFD38A 30%,#E07B0F 100%)' }} />
      <form className="login-card glass" onSubmit={kirim}>
        <img src="/logo.svg" alt="" width="84" height="84" style={{ filter: 'drop-shadow(0 14px 18px rgba(18,21,43,.35))' }} />
        <div>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: '-.03em' }}>lembur<span style={{ color: 'var(--teal)' }}>in</span></h1>
          <p className="muted" style={{ margin: '6px 0 0' }}>{karyawan ? 'Lihat lembur dan slip Anda sendiri.' : 'Masuk sebagai petugas scan atau admin.'}</p>
        </div>

        <div className="seg" role="tablist" aria-label="Jenis akun">
          <button type="button" role="tab" aria-selected={karyawan} className={karyawan ? 'on' : ''} onClick={() => pilihMode('karyawan')}>Karyawan</button>
          <button type="button" role="tab" aria-selected={!karyawan} className={!karyawan ? 'on' : ''} onClick={() => pilihMode('staf')}>Petugas &amp; admin</button>
        </div>

        <div className="fld">
          <label htmlFor="username">{karyawan ? 'NIK' : 'Username'}</label>
          <input
            className="input" id="username" autoComplete="username" autoCapitalize={karyawan ? 'characters' : 'off'}
            placeholder={karyawan ? 'Contoh: SNL-0142' : ''} value={username} onChange={(e) => setUsername(e.target.value)} required
          />
        </div>
        <div className="fld">
          <label htmlFor="password">Kata sandi</label>
          <input className="input" id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <p className="err" role="alert">{error}</p>}
        <button className="btn lg" type="submit" disabled={proses}>{proses ? 'Memeriksa…' : 'Masuk'}</button>
        {karyawan && <p className="hint" style={{ textAlign: 'center' }}>Belum punya sandi atau lupa sandi? Minta sandi awal ke HRD.</p>}
      </form>
    </main>
  );
}
