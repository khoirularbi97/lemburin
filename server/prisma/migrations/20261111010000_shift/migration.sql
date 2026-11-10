-- Dua shift bergilir per grup: grup karyawan + penanda "shift 1 lembur" per tanggal kerja
ALTER TABLE "Karyawan" ADD COLUMN "grup" TEXT;

CREATE TABLE "HariShift" (
    "tanggal" DATE NOT NULL,
    "shift1Lembur" BOOLEAN NOT NULL DEFAULT false,
    "diubahOlehId" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HariShift_pkey" PRIMARY KEY ("tanggal")
);
