// Pembungkus fetch ke backend. JWT disimpan di localStorage dan dikirim lewat
// header Authorization (bukan cookie), karena frontend (Vercel) dan backend
// (Render) beda domain.

export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '');

const KUNCI_TOKEN = 'lq_token';
const KUNCI_USER = 'lq_user';

export function simpanSesi(token, user) {
  localStorage.setItem(KUNCI_TOKEN, token);
  localStorage.setItem(KUNCI_USER, JSON.stringify(user));
}

export function bacaUser() {
  try { return JSON.parse(localStorage.getItem(KUNCI_USER) || 'null'); } catch { return null; }
}

export function hapusSesi() {
  localStorage.removeItem(KUNCI_TOKEN);
  localStorage.removeItem(KUNCI_USER);
}

export class ApiError extends Error {
  constructor(pesan, status, data) {
    super(pesan);
    this.status = status;
    this.data = data;
  }
}

export async function api(path, { method = 'GET', body, raw = false } = {}) {
  const token = localStorage.getItem(KUNCI_TOKEN);
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Tidak bisa terhubung ke server. Periksa koneksi internet lalu coba lagi.', 0, null);
  }

  if (res.status === 401 && path !== '/api/auth/login') {
    hapusSesi();
    window.dispatchEvent(new Event('lq:logout'));
  }

  if (raw) {
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new ApiError(data?.pesan || `Permintaan gagal (${res.status})`, res.status, data);
    }
    return res;
  }

  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.pesan || `Permintaan gagal (${res.status})`, res.status, data);
  return data;
}

/** Bangunkan backend Render yang tertidur. Resolve true kalau server menjawab. */
export async function panaskanServer(timeoutMs = 70000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${API_URL}/health`, { signal: ctrl.signal });
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}
