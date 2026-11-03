-- CreateTable
CREATE TABLE "PemakaianOcr" (
    "bulan" TEXT NOT NULL,
    "jumlah" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PemakaianOcr_pkey" PRIMARY KEY ("bulan")
);
