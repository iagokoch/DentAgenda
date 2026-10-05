-- CreateEnum
CREATE TYPE "Categoria" AS ENUM ('RECEPCIONISTA', 'DENTISTA');

-- CreateEnum
CREATE TYPE "StatusConsulta" AS ENUM ('CONFIRMADA', 'REALIZADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "Autor" AS ENUM ('PACIENTE', 'CLINICA');

-- CreateEnum
CREATE TYPE "TipoConta" AS ENUM ('CLIENTE', 'FUNCIONARIO');

-- CreateEnum
CREATE TYPE "ResultadoTentativa" AS ENUM ('SUCESSO', 'FALHA', 'REDEFINICAO');

-- CreateEnum
CREATE TYPE "FinalidadeCodigo" AS ENUM ('RECUPERACAO', 'ATIVACAO', 'CADASTRO');

-- CreateTable
CREATE TABLE "Cliente" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "cpf" CHAR(11) NOT NULL,
    "telefone" TEXT NOT NULL,
    "email" TEXT,
    "nascimento" DATE,
    "convenio" TEXT,
    "criadoEm" TIMESTAMPTZ NOT NULL,
    "pacienteDesde" DATE NOT NULL,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnderecoCliente" (
    "clienteId" UUID NOT NULL,
    "cep" CHAR(8) NOT NULL,
    "logradouro" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "complemento" TEXT,
    "bairro" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "uf" CHAR(2) NOT NULL,

    CONSTRAINT "EnderecoCliente_pkey" PRIMARY KEY ("clienteId")
);

-- CreateTable
CREATE TABLE "AlertaCliente" (
    "id" UUID NOT NULL,
    "clienteId" UUID NOT NULL,
    "texto" TEXT NOT NULL,
    "autor" "Autor" NOT NULL,
    "autorFuncionarioId" UUID,
    "criadoEm" TIMESTAMPTZ NOT NULL,
    "removidoEm" TIMESTAMPTZ,
    "removidoPorFuncionarioId" UUID,

    CONSTRAINT "AlertaCliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Login" (
    "id" UUID NOT NULL,
    "clienteId" UUID NOT NULL,
    "senhaHash" CHAR(60) NOT NULL,

    CONSTRAINT "Login_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Funcionario" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "cpf" CHAR(11) NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" CHAR(60) NOT NULL,
    "categoria" "Categoria" NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "cro" TEXT,
    "dataInicio" DATE NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Funcionario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Procedimento" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "duracaoMinutos" INTEGER NOT NULL,
    "precoCentavos" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Procedimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradeHorario" (
    "id" UUID NOT NULL,
    "dentistaId" UUID NOT NULL,
    "diaSemana" SMALLINT NOT NULL,
    "inicio" TIME(0) NOT NULL,
    "fim" TIME(0) NOT NULL,

    CONSTRAINT "GradeHorario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bloqueio" (
    "id" UUID NOT NULL,
    "dentistaId" UUID NOT NULL,
    "inicio" TIMESTAMPTZ NOT NULL,
    "fim" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Bloqueio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consulta" (
    "id" UUID NOT NULL,
    "clienteId" UUID NOT NULL,
    "dentistaId" UUID NOT NULL,
    "procedimentoId" UUID NOT NULL,
    "inicio" TIMESTAMPTZ NOT NULL,
    "fim" TIMESTAMPTZ NOT NULL,
    "status" "StatusConsulta" NOT NULL,
    "observacao" TEXT,
    "criadoEm" TIMESTAMPTZ NOT NULL,
    "canceladoEm" TIMESTAMPTZ,
    "canceladoPor" "Autor",
    "canceladoPorFuncionarioId" UUID,
    "justificativa" TEXT,

    CONSTRAINT "Consulta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricoObservacao" (
    "id" UUID NOT NULL,
    "consultaId" UUID NOT NULL,
    "texto" TEXT,
    "autor" "Autor" NOT NULL,
    "autorFuncionarioId" UUID,
    "editadoEm" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "HistoricoObservacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TentativaLogin" (
    "id" UUID NOT NULL,
    "identificador" TEXT NOT NULL,
    "tipo" "TipoConta" NOT NULL,
    "ip" TEXT NOT NULL,
    "ocorridoEm" TIMESTAMPTZ NOT NULL,
    "resultado" "ResultadoTentativa" NOT NULL,

    CONSTRAINT "TentativaLogin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodigoVerificacao" (
    "id" UUID NOT NULL,
    "identificador" TEXT NOT NULL,
    "tipo" "TipoConta" NOT NULL,
    "finalidade" "FinalidadeCodigo" NOT NULL,
    "destino" TEXT,
    "codigoHash" TEXT NOT NULL,
    "criadoEm" TIMESTAMPTZ NOT NULL,
    "expiraEm" TIMESTAMPTZ NOT NULL,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "usadoEm" TIMESTAMPTZ,

    CONSTRAINT "CodigoVerificacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL,
    "loginId" UUID,
    "funcionarioId" UUID,
    "tokenHash" TEXT NOT NULL,
    "criadoEm" TIMESTAMPTZ NOT NULL,
    "expiraEm" TIMESTAMPTZ NOT NULL,
    "revogadoEm" TIMESTAMPTZ,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_cpf_key" ON "Cliente"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "Login_clienteId_key" ON "Login"("clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "Funcionario_cpf_key" ON "Funcionario"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "Funcionario_email_key" ON "Funcionario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Funcionario_cro_key" ON "Funcionario"("cro");

-- CreateIndex
CREATE UNIQUE INDEX "Procedimento_nome_key" ON "Procedimento"("nome");

-- CreateIndex
CREATE INDEX "TentativaLogin_identificador_tipo_ocorridoEm_idx" ON "TentativaLogin"("identificador", "tipo", "ocorridoEm");

-- CreateIndex
CREATE INDEX "CodigoVerificacao_identificador_tipo_criadoEm_idx" ON "CodigoVerificacao"("identificador", "tipo", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- AddForeignKey
ALTER TABLE "EnderecoCliente" ADD CONSTRAINT "EnderecoCliente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertaCliente" ADD CONSTRAINT "AlertaCliente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertaCliente" ADD CONSTRAINT "AlertaCliente_autorFuncionarioId_fkey" FOREIGN KEY ("autorFuncionarioId") REFERENCES "Funcionario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertaCliente" ADD CONSTRAINT "AlertaCliente_removidoPorFuncionarioId_fkey" FOREIGN KEY ("removidoPorFuncionarioId") REFERENCES "Funcionario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Login" ADD CONSTRAINT "Login_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeHorario" ADD CONSTRAINT "GradeHorario_dentistaId_fkey" FOREIGN KEY ("dentistaId") REFERENCES "Funcionario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bloqueio" ADD CONSTRAINT "Bloqueio_dentistaId_fkey" FOREIGN KEY ("dentistaId") REFERENCES "Funcionario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consulta" ADD CONSTRAINT "Consulta_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consulta" ADD CONSTRAINT "Consulta_dentistaId_fkey" FOREIGN KEY ("dentistaId") REFERENCES "Funcionario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consulta" ADD CONSTRAINT "Consulta_procedimentoId_fkey" FOREIGN KEY ("procedimentoId") REFERENCES "Procedimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consulta" ADD CONSTRAINT "Consulta_canceladoPorFuncionarioId_fkey" FOREIGN KEY ("canceladoPorFuncionarioId") REFERENCES "Funcionario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoObservacao" ADD CONSTRAINT "HistoricoObservacao_consultaId_fkey" FOREIGN KEY ("consultaId") REFERENCES "Consulta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoObservacao" ADD CONSTRAINT "HistoricoObservacao_autorFuncionarioId_fkey" FOREIGN KEY ("autorFuncionarioId") REFERENCES "Funcionario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_loginId_fkey" FOREIGN KEY ("loginId") REFERENCES "Login"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_funcionarioId_fkey" FOREIGN KEY ("funcionarioId") REFERENCES "Funcionario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ===========================================================================================
-- Escrito à mão (D6, D18, D19): o Prisma não declara exclusion constraint nem CHECK.
-- ===========================================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS unaccent;   -- busca de paciente sem acento

-- D6, D18: sem sobreposição de consultas não canceladas
ALTER TABLE "Consulta" ADD CONSTRAINT consulta_dentista_sem_sobreposicao
  EXCLUDE USING gist ("dentistaId" WITH =, tstzrange("inicio", "fim", '[)') WITH &&)
  WHERE ("status" <> 'CANCELADA');
ALTER TABLE "Consulta" ADD CONSTRAINT consulta_paciente_sem_sobreposicao
  EXCLUDE USING gist ("clienteId" WITH =, tstzrange("inicio", "fim", '[)') WITH &&)
  WHERE ("status" <> 'CANCELADA');

ALTER TABLE "Consulta" ADD CONSTRAINT consulta_inicio_antes_do_fim CHECK ("inicio" < "fim");
ALTER TABLE "Consulta" ADD CONSTRAINT consulta_cancelamento_coerente CHECK (
  ("status" = 'CANCELADA' AND "canceladoEm" IS NOT NULL AND "canceladoPor" IS NOT NULL)
  OR ("status" <> 'CANCELADA' AND "canceladoEm" IS NULL AND "canceladoPor" IS NULL));
ALTER TABLE "Consulta" ADD CONSTRAINT consulta_cancelamento_clinica_tem_funcionario CHECK (
  ("canceladoPor" IS NOT DISTINCT FROM 'CLINICA') = ("canceladoPorFuncionarioId" IS NOT NULL));
ALTER TABLE "Consulta" ADD CONSTRAINT consulta_justificativa_menos_de_24h CHECK (
  "canceladoPor" IS DISTINCT FROM 'PACIENTE'
  OR "inicio" - "canceladoEm" >= interval '24 hours'
  OR "justificativa" IS NOT NULL);

ALTER TABLE "Funcionario" ADD CONSTRAINT funcionario_dentista_tem_cro
  CHECK ("categoria" <> 'DENTISTA' OR "cro" IS NOT NULL);
ALTER TABLE "Procedimento" ADD CONSTRAINT procedimento_duracao_positiva CHECK ("duracaoMinutos" > 0);
ALTER TABLE "Procedimento" ADD CONSTRAINT procedimento_preco_nao_negativo CHECK ("precoCentavos" >= 0);
ALTER TABLE "GradeHorario" ADD CONSTRAINT grade_inicio_antes_do_fim CHECK ("inicio" < "fim");
ALTER TABLE "GradeHorario" ADD CONSTRAINT grade_dia_semana_valido CHECK ("diaSemana" BETWEEN 0 AND 6);
ALTER TABLE "Bloqueio" ADD CONSTRAINT bloqueio_inicio_antes_do_fim CHECK ("inicio" < "fim");

ALTER TABLE "AlertaCliente" ADD CONSTRAINT alerta_autor_clinica_tem_funcionario CHECK (
  ("autor" = 'CLINICA') = ("autorFuncionarioId" IS NOT NULL));
ALTER TABLE "AlertaCliente" ADD CONSTRAINT alerta_remocao_coerente CHECK (
  ("removidoEm" IS NULL) = ("removidoPorFuncionarioId" IS NULL));
ALTER TABLE "HistoricoObservacao" ADD CONSTRAINT historico_autor_clinica_tem_funcionario CHECK (
  ("autor" = 'CLINICA') = ("autorFuncionarioId" IS NOT NULL));

ALTER TABLE "CodigoVerificacao" ADD CONSTRAINT codigo_tentativas_ate_3 CHECK ("tentativas" BETWEEN 0 AND 3);
ALTER TABLE "RefreshToken" ADD CONSTRAINT refresh_uma_conta
  CHECK (num_nonnulls("loginId", "funcionarioId") = 1);
