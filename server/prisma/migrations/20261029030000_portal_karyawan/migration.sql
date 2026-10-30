-- CreateEnum
CREATE TYPE "StatusPengajuan" AS ENUM ('MENUNGGU', 'DISETUJUI', 'DITOLAK', 'DIBATALKAN');

-- AlterTable
ALTER TABLE "Karyawan" ADD COLUMN "sandiHash" TEXT,
ADD COLUMN "wajibGantiSandi" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "sandiDiubah" TIMESTAMP(3),
ADD COLUMN "loginTerakhir" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PengajuanTap" (
    "id" SERIAL NOT NULL,
    "karyawanId" INTEGER NOT NULL,
    "tanggal" DATE NOT NULL,
    "jam" TEXT NOT NULL,
    "alasan" TEXT NOT NULL,
    "status" "StatusPengajuan" NOT NULL DEFAULT 'MENUNGGU',
    "catatanAdmin" TEXT,
    "diprosesOlehId" INTEGER,
    "diprosesPada" TIMESTAMP(3),
    "lemburId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PengajuanTap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LanggananPush" (
    "id" SERIAL NOT NULL,
    "karyawanId" INTEGER NOT NULL,
    "jenis" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT,
    "auth" TEXT,
    "perangkat" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "terakhirDipakai" TIMESTAMP(3),

    CONSTRAINT "LanggananPush_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PengajuanTap_lemburId_key" ON "PengajuanTap"("lemburId");

-- CreateIndex
CREATE INDEX "PengajuanTap_status_idx" ON "PengajuanTap"("status");

-- CreateIndex
CREATE INDEX "PengajuanTap_karyawanId_tanggal_idx" ON "PengajuanTap"("karyawanId", "tanggal");

-- CreateIndex
CREATE UNIQUE INDEX "LanggananPush_endpoint_key" ON "LanggananPush"("endpoint");

-- CreateIndex
CREATE INDEX "LanggananPush_karyawanId_idx" ON "LanggananPush"("karyawanId");

-- AddForeignKey
ALTER TABLE "PengajuanTap" ADD CONSTRAINT "PengajuanTap_karyawanId_fkey" FOREIGN KEY ("karyawanId") REFERENCES "Karyawan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PengajuanTap" ADD CONSTRAINT "PengajuanTap_diprosesOlehId_fkey" FOREIGN KEY ("diprosesOlehId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PengajuanTap" ADD CONSTRAINT "PengajuanTap_lemburId_fkey" FOREIGN KEY ("lemburId") REFERENCES "Lembur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LanggananPush" ADD CONSTRAINT "LanggananPush_karyawanId_fkey" FOREIGN KEY ("karyawanId") REFERENCES "Karyawan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
