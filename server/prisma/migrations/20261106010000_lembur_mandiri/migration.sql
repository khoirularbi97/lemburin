-- Lembur jam aktual (PP 35/2021), QR mandiri + verifikasi wajah, pengaturan

ALTER TABLE "Lembur" ADD COLUMN "metode" TEXT NOT NULL DEFAULT 'TETAP';
ALTER TABLE "Lembur" ADD COLUMN "mulai" TIMESTAMP(3);
ALTER TABLE "Lembur" ADD COLUMN "selesai" TIMESTAMP(3);
ALTER TABLE "Lembur" ADD COLUMN "menitLembur" INTEGER;
ALTER TABLE "Lembur" ADD COLUMN "rincianHitung" JSONB;
ALTER TABLE "Lembur" ADD COLUMN "sumber" TEXT;
ALTER TABLE "Lembur" ADD COLUMN "jarakWajah" DOUBLE PRECISION;

CREATE TABLE "SesiLembur" (
    "id" SERIAL NOT NULL,
    "karyawanId" INTEGER NOT NULL,
    "tanggal" DATE NOT NULL,
    "mulai" TIMESTAMP(3) NOT NULL,
    "petugasId" INTEGER NOT NULL,
    "jarakWajah" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SesiLembur_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SesiLembur_karyawanId_key" ON "SesiLembur"("karyawanId");
ALTER TABLE "SesiLembur" ADD CONSTRAINT "SesiLembur_karyawanId_fkey" FOREIGN KEY ("karyawanId") REFERENCES "Karyawan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SesiLembur" ADD CONSTRAINT "SesiLembur_petugasId_fkey" FOREIGN KEY ("petugasId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "WajahKaryawan" (
    "karyawanId" INTEGER NOT NULL,
    "vektor" JSONB NOT NULL,
    "foto" BYTEA NOT NULL,
    "fotoMime" TEXT NOT NULL DEFAULT 'image/webp',
    "status" TEXT NOT NULL DEFAULT 'MENUNGGU',
    "persetujuan" TIMESTAMP(3) NOT NULL,
    "catatan" TEXT,
    "diprosesOlehId" INTEGER,
    "diprosesPada" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WajahKaryawan_pkey" PRIMARY KEY ("karyawanId")
);
CREATE INDEX "WajahKaryawan_status_idx" ON "WajahKaryawan"("status");
ALTER TABLE "WajahKaryawan" ADD CONSTRAINT "WajahKaryawan_karyawanId_fkey" FOREIGN KEY ("karyawanId") REFERENCES "Karyawan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WajahKaryawan" ADD CONSTRAINT "WajahKaryawan_diprosesOlehId_fkey" FOREIGN KEY ("diprosesOlehId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Pengaturan" (
    "kunci" TEXT NOT NULL,
    "nilai" JSONB NOT NULL,
    "diubah" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Pengaturan_pkey" PRIMARY KEY ("kunci")
);
