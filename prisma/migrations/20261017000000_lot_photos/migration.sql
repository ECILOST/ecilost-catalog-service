-- Fotografias de los lotes: su portada en el catalogo y en la subasta.

-- CreateTable
CREATE TABLE "lot_photos" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "uploadedBy" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lot_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lot_photos_storageKey_key" ON "lot_photos"("storageKey");

-- CreateIndex
CREATE INDEX "lot_photos_lotId_idx" ON "lot_photos"("lotId");

-- AddForeignKey
ALTER TABLE "lot_photos" ADD CONSTRAINT "lot_photos_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
