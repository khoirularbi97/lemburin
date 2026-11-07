-- Tap eksklusif: karyawan tertentu boleh scan ID card sendiri (+ verifikasi wajah) tanpa petugas.
-- Lokasi HP disimpan di Lembur.rincianHitung.lokasi.
ALTER TABLE "Karyawan" ADD COLUMN "eksklusifSampai" TIMESTAMP(3),
ADD COLUMN "eksklusifAlasan" TEXT,
ADD COLUMN "eksklusifOlehId" INTEGER;
