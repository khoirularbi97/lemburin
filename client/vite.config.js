import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// mode 'native' = build untuk Android/iOS (Capacitor) dan desktop (Electron).
// File aplikasi sudah ada di dalam paket, jadi service worker PWA tidak dipakai.
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    mode !== 'native' && VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icon.svg', 'logo.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'lemburin',
        short_name: 'lemburin',
        description: 'Pencatatan dan perhitungan lembur karyawan dengan QR code',
        lang: 'id',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#12152B',
        // Warna latar splash Android = warna malam logo
        background_color: '#12152B',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Hanya file aplikasi yang di-cache. Panggilan API selalu ke server.
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Splash iPhone cukup diambil saat dibutuhkan, tidak perlu di-cache semua
        globIgnores: ['splash/**', 'push-sw.js', 'ocr/**'],
        // Penangan notifikasi push untuk portal karyawan
        importScripts: ['push-sw.js'],
      },
    }),
  ].filter(Boolean),
  server: { port: 5173 },
}));
