import { PrismaClient } from '@prisma/client';

// Satu instance untuk seluruh aplikasi supaya koneksi ke Neon tidak membengkak.
export const prisma = new PrismaClient();
