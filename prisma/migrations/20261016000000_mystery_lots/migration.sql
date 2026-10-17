-- Lote misterioso (subastas dinamicas, ADR-0002). Solo agrega columnas con valor por defecto:
-- la version anterior las ignora y ningun objeto existente queda oculto.

-- Pistas que el funcionario escribe al registrar: lo unico que ve el estudiante de un objeto
-- que sale en lote misterioso, ademas de su categoria y su estado.
ALTER TABLE "items"
  ADD COLUMN "clues" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "mystery" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "awardedTo" TEXT;

ALTER TABLE "lots"
  ADD COLUMN "mystery" BOOLEAN NOT NULL DEFAULT false;
