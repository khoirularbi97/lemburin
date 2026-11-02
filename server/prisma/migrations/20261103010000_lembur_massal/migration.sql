-- CreateTable
CREATE TABLE "Spl" (
    "id" SERIAL NOT NULL,
    "nomor" TEXT,
    "tanggal" DATE NOT NULL,
    "jamSelesai" TEXT NOT NULL,
    "alasan" TEXT NOT NULL,
    "sumber" TEXT NOT NULL DEFAULT 'CENTANG',
    "foto" BYTEA,
    "fotoMime" TEXT,
    "teksOcr" TEXT,
    "dibuatOlehId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Spl_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Lembur" ADD COLUMN "splId" INTEGER;

-- CreateIndex
CREATE INDEX "Spl_tanggal_idx" ON "Spl"("tanggal");

-- AddForeignKey
ALTER TABLE "Spl" ADD CONSTRAINT "Spl_dibuatOlehId_fkey" FOREIGN KEY ("dibuatOlehId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lembur" ADD CONSTRAINT "Lembur_splId_fkey" FOREIGN KEY ("splId") REFERENCES "Spl"("id") ON DELETE SET NULL ON UPDATE CASCADE;
