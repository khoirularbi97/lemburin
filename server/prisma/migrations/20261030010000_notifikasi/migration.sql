-- CreateTable
CREATE TABLE "Notifikasi" (
    "id" SERIAL NOT NULL,
    "karyawanId" INTEGER NOT NULL,
    "judul" TEXT NOT NULL,
    "isi" TEXT NOT NULL,
    "url" TEXT NOT NULL DEFAULT '/portal',
    "dibaca" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notifikasi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notifikasi_karyawanId_createdAt_idx" ON "Notifikasi"("karyawanId", "createdAt");

-- AddForeignKey
ALTER TABLE "Notifikasi" ADD CONSTRAINT "Notifikasi_karyawanId_fkey" FOREIGN KEY ("karyawanId") REFERENCES "Karyawan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
