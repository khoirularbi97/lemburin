// Kode yang sama dipakai di web (Vercel), Android/iOS (Capacitor), dan
// desktop (Electron). Bedanya cuma di sini.
import { Capacitor } from '@capacitor/core';

/** 'web' | 'android' | 'ios' | 'desktop' */
export const PLATFORM = Capacitor.isNativePlatform()
  ? Capacitor.getPlatform()
  : navigator.userAgent.includes('lemburin-desktop') ? 'desktop' : 'web';

export const NATIVE_HP = PLATFORM === 'android' || PLATFORM === 'ios';

function keBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/**
 * Simpan file hasil aplikasi (Excel rekap, PNG ID card).
 * Web & desktop: unduhan biasa (desktop menampilkan dialog Simpan).
 * Android/iOS: WebView tidak bisa mengunduh blob, jadi file ditulis ke cache
 * lalu dibuka lembar Bagikan (Simpan ke Files/Drive, kirim WhatsApp, dll).
 */
export async function simpanFile(blob, namaFile) {
  if (NATIVE_HP) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ]);
    const { uri } = await Filesystem.writeFile({
      path: namaFile,
      data: await keBase64(blob),
      directory: Directory.Cache,
    });
    try {
      await Share.share({ title: namaFile, files: [uri], dialogTitle: 'Simpan atau bagikan' });
    } catch (e) {
      // Pengguna menutup lembar Bagikan: bukan error
      if (!/cancel/i.test(String(e?.message))) throw e;
      return false;
    }
    return true;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = namaFile;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

/** Tombol Kembali Android: mundur satu halaman, atau keluar di halaman awal. */
export async function pasangTombolKembali(onKembali) {
  if (PLATFORM !== 'android') return () => {};
  const { App } = await import('@capacitor/app');
  const h = await App.addListener('backButton', ({ canGoBack }) => {
    if (onKembali?.()) return; // ditangani (mis. menutup modal)
    if (canGoBack) window.history.back();
    else App.exitApp();
  });
  return () => h.remove();
}
