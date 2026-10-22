import { fileURLToPath } from 'node:url';
import * as z from 'zod';
import { criarPrisma } from '../src/compartilhado/banco.ts';
import { dataEmSaoPaulo } from '../src/compartilhado/datas.ts';
import { gerarHashDeSenha, gerarSenhaAleatoria } from '../src/compartilhado/senhas.ts';
import { esquemaCpf, esquemaEmail } from '../src/compartilhado/validacao.ts';
import type { PrismaClient } from '../src/generated/prisma/client.ts';

const esquemaDoAdminInicial = z
  .object({
    ADMIN_INICIAL_EMAIL: esquemaEmail,
    ADMIN_INICIAL_NOME: z.string().trim().min(1),
    ADMIN_INICIAL_CPF: esquemaCpf,
    ADMIN_INICIAL_CATEGORIA: z.enum(['RECEPCIONISTA', 'DENTISTA']),
    // O .env.example deixa a variável vazia para quem não é dentista.
    ADMIN_INICIAL_CRO: z.preprocess((valor) => (valor === '' ? undefined : valor), z.string().trim().min(1).optional()),
  })
  .refine((variaveis) => variaveis.ADMIN_INICIAL_CATEGORIA !== 'DENTISTA' || variaveis.ADMIN_INICIAL_CRO, {
    error: 'obrigatória quando a categoria é DENTISTA',
    path: ['ADMIN_INICIAL_CRO'],
  });

// D23, D25.12: cria o primeiro admin, com senha desconhecida (ele define a dele por "Recuperar senha").
// Só confere as variáveis ADMIN_INICIAL_* se ainda não existir admin.
export async function semearAdminInicial(
  prisma: PrismaClient,
  variaveis: NodeJS.ProcessEnv,
  hoje: Date,
): Promise<'criado' | 'ja-existe'> {
  if ((await prisma.funcionario.count({ where: { isAdmin: true } })) > 0) return 'ja-existe';

  const resultado = esquemaDoAdminInicial.safeParse(variaveis);
  if (!resultado.success) {
    // Só nome da variável e motivo: o valor pode ser dado pessoal.
    const problemas = resultado.error.issues.map((problema) => `${problema.path.join('.')}: ${problema.message}`);
    throw new Error(`Variáveis do primeiro admin inválidas — ${problemas.join('; ')}`);
  }
  const dados = resultado.data;
  await prisma.funcionario.create({
    data: {
      nome: dados.ADMIN_INICIAL_NOME,
      cpf: dados.ADMIN_INICIAL_CPF,
      email: dados.ADMIN_INICIAL_EMAIL,
      categoria: dados.ADMIN_INICIAL_CATEGORIA,
      cro: dados.ADMIN_INICIAL_CATEGORIA === 'DENTISTA' ? (dados.ADMIN_INICIAL_CRO ?? null) : null,
      isAdmin: true,
      dataInicio: new Date(`${dataEmSaoPaulo(hoje)}T00:00:00Z`),
      senhaHash: await gerarHashDeSenha(gerarSenhaAleatoria()),
    },
  });
  return 'criado';
}

async function principal(): Promise<void> {
  const prisma = criarPrisma(process.env.DATABASE_URL ?? '');
  try {
    const resultado = await semearAdminInicial(prisma, process.env, new Date());
    console.log(resultado === 'criado' ? 'Admin inicial criado. Defina a senha em "Recuperar senha".' : 'Já existe admin; nada a fazer.');
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
