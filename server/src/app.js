import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { wajibLogin, wajibPeran } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import scanRoutes from './routes/scan.js';
import karyawanRoutes from './routes/karyawan.js';
import liburRoutes from './routes/libur.js';
import rekapRoutes from './routes/rekap.js';
import dashboardRoutes from './routes/dashboard.js';
import penggunaRoutes from './routes/pengguna.js';
import portalRoutes from './routes/portal.js';
import pengajuanRoutes from './routes/pengajuan.js';
import massalRoutes from './routes/massal.js';

export function buatApp() {
  const app = express();
  app.set('trust proxy', 1); // Render berada di balik proxy

  // CORS_ORIGIN: daftar domain frontend dipisah koma, mis. https://lembur-qr.vercel.app
  // Aplikasi native selalu diizinkan: Android (Capacitor) = https://localhost,
  // iOS (Capacitor) = capacitor://localhost, desktop (Electron) = app://lemburin.
  // Login memakai token di header, bukan cookie, jadi origin ini aman dibuka.
  const izin = [
    ...(process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
    ...(process.env.IZINKAN_APLIKASI_NATIVE === 'false' ? [] : ['https://localhost', 'capacitor://localhost', 'app://lemburin']),
  ];
  app.use(cors({
    origin(origin, cb) {
      if (!origin || izin.includes(origin)) return cb(null, true);
      return cb(new Error(`Origin ${origin} tidak diizinkan`));
    },
  }));
  app.use(helmet());
  // Input massal boleh membawa foto SPL (sudah dikompres di HP), jadi batasnya lebih besar
  app.use('/api/lembur-massal', express.json({ limit: '4mb' }));
  app.use(express.json({ limit: '100kb' }));

  // Dipakai cron ping & health check Render. Sengaja tidak menyentuh database
  // supaya Neon tetap boleh "tidur" dan jatah compute hemat.
  app.get('/health', (req, res) => res.json({ ok: true, waktu: new Date().toISOString() }));

  app.use('/api/auth', authRoutes);
  app.use('/api/scan', wajibLogin, scanRoutes);
  app.use('/api/libur', wajibLogin, liburRoutes);
  app.use('/api/karyawan', wajibLogin, wajibPeran('ADMIN'), karyawanRoutes);
  app.use('/api/rekap', wajibLogin, wajibPeran('ADMIN'), rekapRoutes);
  app.use('/api/dashboard', wajibLogin, wajibPeran('ADMIN'), dashboardRoutes);
  app.use('/api/pengguna', wajibLogin, wajibPeran('ADMIN'), penggunaRoutes);
  app.use('/api/pengajuan', wajibLogin, wajibPeran('ADMIN'), pengajuanRoutes);
  app.use('/api/lembur-massal', wajibLogin, wajibPeran('ADMIN', 'PETUGAS'), massalRoutes);
  // Portal karyawan memakai token jenis KARYAWAN (lihat middleware/auth.js)
  app.use('/api/portal', portalRoutes);

  app.use((req, res) => res.status(404).json({ pesan: 'Alamat API tidak ditemukan.' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof ZodError) {
      return res.status(400).json({ pesan: err.issues[0]?.message || 'Data tidak valid.', detail: err.issues });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        const kolom = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : 'data';
        return res.status(409).json({ pesan: `Sudah ada ${kolom} yang sama.` });
      }
      if (err.code === 'P2025') return res.status(404).json({ pesan: 'Data tidak ditemukan.' });
    }
    if (err.status) return res.status(err.status).json({ pesan: err.message, ...err.extra });
    if (err.message?.startsWith('Origin ')) return res.status(403).json({ pesan: err.message });
    console.error(err);
    return res.status(500).json({ pesan: 'Terjadi kesalahan di server.' });
  });

  return app;
}
