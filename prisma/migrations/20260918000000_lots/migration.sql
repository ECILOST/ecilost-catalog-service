CREATE TYPE "LotStatus" AS ENUM ('DRAFT', 'ACTIVE', 'IN_ROUND', 'CLOSED', 'CANCELLED');

CREATE TABLE "lots" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "LotStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "lots_status_idx" ON "lots"("status");

ALTER TABLE "items" ADD CONSTRAINT "items_lotId_fkey"
  FOREIGN KEY ("lotId") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
