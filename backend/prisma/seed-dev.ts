import { fileURLToPath } from 'node:url';
import { criarPrisma } from '../src/compartilhado/banco.ts';
import { gerarHashDeSenha, gerarSenhaAleatoria } from '../src/compartilhado/senhas.ts';
import type { PrismaClient } from '../src/generated/prisma/client.ts';

// Dados fictícios (CPFs de exemplo com dígito verificador válido). Nunca roda em produção.
const PROCEDIMENTOS = [
  { nome: 'Avaliação', duracaoMinutos: 30, precoCentavos: 12000 },
  { nome: 'Limpeza', duracaoMinutos: 60, precoCentavos: 18000 },
  { nome: 'Restauração', duracaoMinutos: 60, precoCentavos: 25000 },
  { nome: 'Clareamento', duracaoMinutos: 90, precoCentavos: 60000 },
];

const DENTISTA = {
  nome: 'Dra. Ana Costa',
  cpf: '52998224725',
  email: 'ana.costa@exemplo.dev',
  categoria: 'DENTISTA' as const,
  cro: 'SP-12345',
};

const RECEPCIONISTA = {
  nome: 'Carla Souza',
  cpf: '11144477735',
  email: 'carla.souza@exemplo.dev',
  categoria: 'RECEPCIONISTA' as const,
};

const hora = (texto: string) => new Date(`1970-01-01T${texto}:00Z`);

// Segunda a sexta, 08:00–12:00 e 14:00–18:00 (D12).
const FAIXAS_DA_GRADE = [1, 2, 3, 4, 5].flatMap((diaSemana) => [
  { diaSemana, inicio: hora('08:00'), fim: hora('12:00') },
  { diaSemana, inicio: hora('14:00'), fim: hora('18:00') },
]);

// Idempotente: pula o que já existe.
export async function semearDadosDeDesenvolvimento(prisma: PrismaClient, nodeEnv: string | undefined): Promise<void> {
  if (nodeEnv === 'production') throw new Error('O seed de desenvolvimento não roda com NODE_ENV=production.');

  for (const procedimento of PROCEDIMENTOS) {
    await prisma.procedimento.upsert({ where: { nome: procedimento.nome }, update: {}, create: procedimento });
  }

  const dataInicio = new Date('2026-01-01T00:00:00Z');
  const dentista = await garantirFuncionario(prisma, DENTISTA, dataInicio);
  await garantirFuncionario(prisma, RECEPCIONISTA, dataInicio);

  if ((await prisma.gradeHorario.count({ where: { dentistaId: dentista.id } })) === 0) {
    await prisma.gradeHorario.createMany({ data: FAIXAS_DA_GRADE.map((faixa) => ({ ...faixa, dentistaId: dentista.id })) });
  }
}

// Senha aleatória (D21.1): quem for usar a conta define a senha em "Recuperar senha"; o código sai no log da API.
async function garantirFuncionario(
  prisma: PrismaClient,
  dados: { nome: string; cpf: string; email: string; categoria: 'DENTISTA' | 'RECEPCIONISTA'; cro?: string },
  dataInicio: Date,
) {
  const existente = await prisma.funcionario.findUnique({ where: { email: dados.email } });
  if (existente) return existente;
  return prisma.funcionario.create({
    data: { ...dados, dataInicio, senhaHash: await gerarHashDeSenha(gerarSenhaAleatoria()) },
  });
}

async function principal(): Promise<void> {
  const prisma = criarPrisma(process.env.DATABASE_URL ?? '');
  try {
    await semearDadosDeDesenvolvimento(prisma, process.env.NODE_ENV);
    console.log('Dados fictícios de desenvolvimento prontos.');
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  principal().catch((erro: unknown) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  });
}
