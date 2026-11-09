ALTER TABLE "Consulta" ADD COLUMN "versaoObservacao" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "HistoricoObservacao" ADD COLUMN "versao" INTEGER;

-- Empates legados não revelam a ordem real. O texto atual da consulta é preservado.
WITH ordenado AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "consultaId" ORDER BY "editadoEm", "id")::INTEGER AS versao
  FROM "HistoricoObservacao"
)
UPDATE "HistoricoObservacao" AS historico SET "versao" = ordenado.versao
FROM ordenado WHERE historico."id" = ordenado."id";

UPDATE "Consulta" AS consulta SET "versaoObservacao" = COALESCE(
  (SELECT MAX("versao") FROM "HistoricoObservacao" WHERE "consultaId" = consulta."id"), 0
);

ALTER TABLE "HistoricoObservacao" ALTER COLUMN "versao" SET NOT NULL;
CREATE UNIQUE INDEX "HistoricoObservacao_consultaId_versao_key" ON "HistoricoObservacao"("consultaId", "versao");
ALTER TABLE "Consulta" ADD CONSTRAINT consulta_versao_observacao_nao_negativa CHECK ("versaoObservacao" >= 0);
ALTER TABLE "HistoricoObservacao" ADD CONSTRAINT historico_observacao_versao_positiva CHECK ("versao" > 0);
