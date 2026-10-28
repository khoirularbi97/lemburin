-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'PETUGAS');

-- CreateEnum
CREATE TYPE "JenisHari" AS ENUM ('KERJA', 'LIBUR');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'PETUGAS',
    "area" TEXT NOT NULL DEFAULT 'Semua',
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "lastLogin" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Karyawan" (
    "id" SERIAL NOT NULL,
    "nik" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "departemen" TEXT NOT NULL,
    "jabatan" TEXT NOT NULL DEFAULT 'Operator',
    "upahBulanan" INTEGER NOT NULL,
    "qrToken" TEXT NOT NULL,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "perluCetakUlang" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Karyawan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QrTokenLama" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "karyawanId" INTEGER NOT NULL,
    "diganti" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QrTokenLama_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lembur" (
    "id" SERIAL NOT NULL,
    "karyawanId" INTEGER NOT NULL,
    "tanggal" DATE NOT NULL,
    "waktuTap" TIMESTAMP(3) NOT NULL,
    "jenisHari" "JenisHari" NOT NULL,
    "jamHitung" DOUBLE PRECISION NOT NULL,
    "upahSejam" INTEGER NOT NULL,
    "nominal" INTEGER NOT NULL,
    "petugasId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lembur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HariLibur" (
    "tanggal" DATE NOT NULL,
    "keterangan" TEXT NOT NULL,

    CONSTRAINT "HariLibur_pkey" PRIMARY KEY ("tanggal")
);

-- CreateTable
CREATE TABLE "TapDitolak" (
    "id" SERIAL NOT NULL,
    "tanggal" DATE NOT NULL,
    "waktu" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "karyawanId" INTEGER,
    "alasan" TEXT NOT NULL,
    "petugasId" INTEGER NOT NULL,

    CONSTRAINT "TapDitolak_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Karyawan_nik_key" ON "Karyawan"("nik");

-- CreateIndex
CREATE UNIQUE INDEX "Karyawan_qrToken_key" ON "Karyawan"("qrToken");

-- CreateIndex
CREATE UNIQUE INDEX "QrTokenLama_token_key" ON "QrTokenLama"("token");

-- CreateIndex
CREATE INDEX "Lembur_tanggal_idx" ON "Lembur"("tanggal");

-- CreateIndex
CREATE UNIQUE INDEX "Lembur_karyawanId_tanggal_key" ON "Lembur"("karyawanId", "tanggal");

-- CreateIndex
CREATE INDEX "TapDitolak_tanggal_idx" ON "TapDitolak"("tanggal");

-- AddForeignKey
ALTER TABLE "QrTokenLama" ADD CONSTRAINT "QrTokenLama_karyawanId_fkey" FOREIGN KEY ("karyawanId") REFERENCES "Karyawan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lembur" ADD CONSTRAINT "Lembur_karyawanId_fkey" FOREIGN KEY ("karyawanId") REFERENCES "Karyawan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lembur" ADD CONSTRAINT "Lembur_petugasId_fkey" FOREIGN KEY ("petugasId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TapDitolak" ADD CONSTRAINT "TapDitolak_karyawanId_fkey" FOREIGN KEY ("karyawanId") REFERENCES "Karyawan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TapDitolak" ADD CONSTRAINT "TapDitolak_petugasId_fkey" FOREIGN KEY ("petugasId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
