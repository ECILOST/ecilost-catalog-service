-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "catalog";

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('AVAILABLE', 'IN_LOT', 'IN_ROUND', 'SOLD', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ItemCondition" AS ENUM ('NEW', 'GOOD', 'FAIR', 'DAMAGED');

-- CreateTable
CREATE TABLE "items" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "condition" "ItemCondition" NOT NULL,
    "category" TEXT NOT NULL,
    "status" "ItemStatus" NOT NULL DEFAULT 'AVAILABLE',
    "lotId" TEXT,
    "roundId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "registeredBy" TEXT NOT NULL,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastModifiedBy" TEXT NOT NULL,
    "lastModifiedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "items_status_idx" ON "items"("status");

-- CreateIndex
CREATE INDEX "items_category_idx" ON "items"("category");

