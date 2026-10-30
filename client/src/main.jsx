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
