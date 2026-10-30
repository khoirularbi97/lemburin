import { createContext, useContext, useEffect, useState } from 'react';
import { api, bacaUser, hapusSesi, simpanSesi } from './api.js';

const AuthCtx = createContext(null);

// Satu sesi per perangkat: petugas/admin (role PETUGAS/ADMIN) atau karyawan
// (role KARYAWAN, portal). Token keduanya berbeda jenis di server.

function userKaryawan(k) {
  return { ...k, role: 'KARYAWAN', username: k.nik };
}

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

  async function loginKaryawan(nik, sandi) {
    const r = await api('/api/portal/login', { method: 'POST', body: { nik, sandi } });
    const u = userKaryawan(r.karyawan);
    simpanSesi(r.token, u);
    setUser(u);
    return u;
  }

  /** Setelah ganti sandi server memberi token baru. */
  function perbaruiKaryawan(token, karyawan) {
    const u = userKaryawan(karyawan);
    simpanSesi(token, u);
    setUser(u);
  }

  /** Segarkan profil dari server (upah, departemen bisa diubah HRD). */
  function perbaruiProfil(karyawan) {
    const u = userKaryawan(karyawan);
    try { localStorage.setItem('lq_user', JSON.stringify(u)); } catch { /* abaikan */ }
    setUser(u);
  }

  async function logout() {
    if (user?.role === 'KARYAWAN') {
      // Perangkat bisa dipakai bergantian: berhenti kirim notifikasi ke sini
      try { const { berhentiLangganan } = await import('./push.js'); await berhentiLangganan(); } catch { /* abaikan */ }
    }
    hapusSesi();
    setUser(null);
  }

  return <AuthCtx.Provider value={{ user, login, loginKaryawan, perbaruiKaryawan, perbaruiProfil, logout }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

export function halamanAwal(user) {
  if (user?.role === 'KARYAWAN') return user.wajibGantiSandi ? '/portal/sandi' : '/portal';
  return user?.role === 'ADMIN' ? '/admin' : '/scan';
}
