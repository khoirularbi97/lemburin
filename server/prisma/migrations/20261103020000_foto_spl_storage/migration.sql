-- AlterTable
ALTER TABLE "Spl" ADD COLUMN "fotoKey" TEXT,
ADD COLUMN "fotoUkuran" INTEGER,
ADD COLUMN "fotoDihapus" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Spl_createdAt_idx" ON "Spl"("createdAt");
