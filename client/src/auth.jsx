import { createContext, useContext, useEffect, useState } from 'react';
import { api, bacaUser, hapusSesi, simpanSesi } from './api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(bacaUser);

  useEffect(() => {
    const keluar = () => setUser(null);
    window.addEventListener('lq:logout', keluar);
    return () => window.removeEventListener('lq:logout', keluar);
  }, []);

  async function login(username, password) {
    const r = await api('/api/auth/login', { method: 'POST', body: { username, password } });
    simpanSesi(r.token, r.user);
    setUser(r.user);
    return r.user;
  }

  function logout() {
    hapusSesi();
    setUser(null);
  }

  return <AuthCtx.Provider value={{ user, login, logout }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

export const halamanAwal = (user) => (user?.role === 'ADMIN' ? '/admin' : '/scan');
