-- D40 (#4): índices das consultas frequentes e RESTRICT no lugar de SET NULL (D18: nada se apaga se outra tabela
-- aponta; com SET NULL, apagar um funcionário esbarrava nos CHECKs que exigem a coluna preenchida).

-- DropForeignKey
ALTER TABLE "AlertaCliente" DROP CONSTRAINT "AlertaCliente_autorFuncionarioId_fkey";

-- DropForeignKey
ALTER TABLE "AlertaCliente" DROP CONSTRAINT "AlertaCliente_removidoPorFuncionarioId_fkey";

-- DropForeignKey
ALTER TABLE "Consulta" DROP CONSTRAINT "Consulta_canceladoPorFuncionarioId_fkey";

-- DropForeignKey
ALTER TABLE "HistoricoObservacao" DROP CONSTRAINT "HistoricoObservacao_autorFuncionarioId_fkey";

-- DropForeignKey
ALTER TABLE "RefreshToken" DROP CONSTRAINT "RefreshToken_funcionarioId_fkey";

-- DropForeignKey
ALTER TABLE "RefreshToken" DROP CONSTRAINT "RefreshToken_loginId_fkey";

-- CreateIndex
CREATE INDEX "AlertaCliente_clienteId_idx" ON "AlertaCliente"("clienteId");

-- CreateIndex
CREATE INDEX "Bloqueio_dentistaId_inicio_idx" ON "Bloqueio"("dentistaId", "inicio");

-- CreateIndex
CREATE INDEX "Consulta_procedimentoId_idx" ON "Consulta"("procedimentoId");

-- CreateIndex
CREATE INDEX "GradeHorario_dentistaId_idx" ON "GradeHorario"("dentistaId");

-- CreateIndex
CREATE INDEX "HistoricoObservacao_consultaId_idx" ON "HistoricoObservacao"("consultaId");

-- CreateIndex
CREATE INDEX "RefreshToken_loginId_idx" ON "RefreshToken"("loginId");

-- CreateIndex
CREATE INDEX "RefreshToken_funcionarioId_idx" ON "RefreshToken"("funcionarioId");

-- AddForeignKey
ALTER TABLE "AlertaCliente" ADD CONSTRAINT "AlertaCliente_autorFuncionarioId_fkey" FOREIGN KEY ("autorFuncionarioId") REFERENCES "Funcionario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertaCliente" ADD CONSTRAINT "AlertaCliente_removidoPorFuncionarioId_fkey" FOREIGN KEY ("removidoPorFuncionarioId") REFERENCES "Funcionario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consulta" ADD CONSTRAINT "Consulta_canceladoPorFuncionarioId_fkey" FOREIGN KEY ("canceladoPorFuncionarioId") REFERENCES "Funcionario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoObservacao" ADD CONSTRAINT "HistoricoObservacao_autorFuncionarioId_fkey" FOREIGN KEY ("autorFuncionarioId") REFERENCES "Funcionario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_loginId_fkey" FOREIGN KEY ("loginId") REFERENCES "Login"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_funcionarioId_fkey" FOREIGN KEY ("funcionarioId") REFERENCES "Funcionario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
