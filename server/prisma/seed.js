// Data awal: akun admin & petugas, contoh karyawan, dan hari libur tanggal tetap.
// Jalankan sekali setelah migrasi: npm run db:seed
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { buatTokenQr } from '../src/lib/util.js';
import { keTanggalDb, waktuJakarta } from '../src/lib/lembur.js';

const prisma = new PrismaClient();

async function main() {
  const sandiAdmin = process.env.SEED_ADMIN_PASSWORD || 'admin123';
  const sandiPetugas = process.env.SEED_PETUGAS_PASSWORD || 'petugas123';
  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.warn('! SEED_ADMIN_PASSWORD kosong, memakai "admin123". Ganti setelah login pertama.');
  }

  const users = [
    { username: 'admin.hrd', nama: 'Admin HRD', role: 'ADMIN', area: 'Semua', sandi: sandiAdmin },
    { username: 'petugas.line1', nama: 'Leader Line 1', role: 'PETUGAS', area: 'Painting Line 1', sandi: sandiPetugas },
    { username: 'petugas.line2', nama: 'Leader Line 2', role: 'PETUGAS', area: 'Painting Line 2', sandi: sandiPetugas },
  ];
  for (const u of users) {
    const { sandi, ...data } = u;
    await prisma.user.upsert({
      where: { username: u.username },
      update: {},
      create: { ...data, passwordHash: await bcrypt.hash(sandi, 10) },
    });
  }

  if (process.env.SEED_CONTOH_KARYAWAN !== 'false') {
    const karyawan = [
      ['SNL-0118', 'Ahmad Fauzi', 'Injection', 'Operator', 5_000_000],
      ['SNL-0142', 'Budi Santoso', 'Painting Line 1', 'Operator', 5_000_000],
      ['SNL-0063', 'Dewi Lestari', 'QC', 'Inspector', 5_400_000],
      ['SNL-0156', 'Rudi Hartono', 'Painting Line 1', 'Operator', 5_000_000],
      ['SNL-0087', 'Siti Rahmawati', 'Painting Line 2', 'Operator', 5_200_000],
      ['SNL-0171', 'Yuni Kartika', 'Warehouse', 'Staff gudang', 4_900_000],
    ];
    for (const [nik, nama, departemen, jabatan, upahBulanan] of karyawan) {
      await prisma.karyawan.upsert({
        where: { nik },
        update: {},
        create: { nik, nama, departemen, jabatan, upahBulanan, qrToken: buatTokenQr() },
      });
    }
  }

  // Hanya hari libur bertanggal tetap. Libur yang tanggalnya berubah tiap tahun
  // (Idulfitri, Waisak, Imlek, cuti bersama) diisi admin dari SKB resmi.
  const tahun = Number(waktuJakarta().tanggal.slice(0, 4));
  const libur = [
    [`${tahun}-01-01`, 'Tahun Baru Masehi'],
    [`${tahun}-05-01`, 'Hari Buruh Internasional'],
    [`${tahun}-06-01`, 'Hari Lahir Pancasila'],
    [`${tahun}-08-17`, 'Hari Kemerdekaan RI'],
    [`${tahun}-12-25`, 'Hari Raya Natal'],
    [`${tahun + 1}-01-01`, 'Tahun Baru Masehi'],
  ];
  for (const [tanggal, keterangan] of libur) {
    await prisma.hariLibur.upsert({
      where: { tanggal: keTanggalDb(tanggal) },
      update: {},
      create: { tanggal: keTanggalDb(tanggal), keterangan },
    });
  }

  console.log('Seed selesai: 3 akun, contoh karyawan, dan hari libur tanggal tetap.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
