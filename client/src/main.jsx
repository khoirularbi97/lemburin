import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './auth.jsx';
import { ToastProvider } from './components/ui.jsx';
import { PLATFORM } from './platform.js';
import './styles.css';

// StrictMode sengaja tidak dipakai: di mode development ia memasang komponen
// dua kali, sehingga kamera scanner dibuka dua kali dan sering error.
createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </AuthProvider>
  </BrowserRouter>,
);

// Hilangkan splash setelah tampilan pertama siap (minimal 600 ms supaya tidak berkedip)
const mulai = performance.now();
requestAnimationFrame(() => {
  const splash = document.getElementById('splash');
  if (!splash) return;
  setTimeout(() => {
    splash.classList.add('hilang');
    setTimeout(() => splash.remove(), 400);
  }, Math.max(0, 600 - (performance.now() - mulai)));
});

document.documentElement.dataset.platform = PLATFORM;

// Push web masuk → segarkan angka lonceng
navigator.serviceWorker?.addEventListener?.('message', (e) => {
  if (e.data?.jenis === 'lq:notif') window.dispatchEvent(new Event('lq:notif'));
});

// Setelah deploy baru, file lama (mis. assets/ocr-xxxx.js) sudah tidak ada di server, tapi
// halaman yang masih terbuka/ter-cache masih mencarinya → "Failed to fetch dynamically imported
// module". Muat ulang sekali supaya memakai versi terbaru (dijaga agar tidak berulang terus).
window.addEventListener('vite:preloadError', (e) => {
  const KUNCI = 'lq:muatUlangVersi';
  let terakhir = 0;
  try { terakhir = Number(sessionStorage.getItem(KUNCI)) || 0; } catch { /* abaikan */ }
  if (Date.now() - terakhir < 30000) return; // baru saja dimuat ulang: biarkan error tampil
  try { sessionStorage.setItem(KUNCI, String(Date.now())); } catch { /* abaikan */ }
  e.preventDefault();
  window.location.reload();
});
