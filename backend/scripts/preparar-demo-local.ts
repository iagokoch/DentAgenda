import { fileURLToPath } from 'node:url';
import { semearAdminInicial } from '../prisma/seed.ts';
import { semearDadosDeDesenvolvimento } from '../prisma/seed-dev.ts';
import { criarPrisma } from '../src/compartilhado/banco.ts';
import { conferirSenha, gerarHashDeSenha } from '../src/compartilhado/senhas.ts';

// Ferramenta exclusiva da demonstração local. Nunca carrega o .env do projeto.
export const CONTAS_DEMO = {
  admin: { email: 'admin@exemplo.dev', cpf: '93541134780', senha: 'DEMO_ADMIN_SENHA' },
  recepcao: { email: 'carla.souza@exemplo.dev', cpf: '11144477735', senha: 'DEMO_RECEPCAO_SENHA' },
  dentista: { email: 'ana.costa@exemplo.dev', cpf: '52998224725', senha: 'DEMO_DENTISTA_SENHA' },
  paciente: { cpf: '12345678909', senha: 'DEMO_PACIENTE_SENHA' },
} as const;

export function ambienteDemoLocal(): { databaseUrl: string; porta: number } {
  if (process.env.NODE_ENV !== 'development' || process.env.ENVIADOR_MENSAGEM !== 'log') {
    throw new Error('Ambiente exclusivo de demonstração local requerido.');
  }
  const databaseUrl = process.env.DATABASE_URL ?? '';
  const destino = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(destino.protocol)
      || destino.hostname !== '127.0.0.1' || destino.port !== '5434'
      || !/^\/dentagenda_demo_(local|restore_[0-9]+)$/.test(destino.pathname)
      || destino.search || destino.hash) {
    throw new Error('Destino do banco fora da demonstração local.');
  }
  const porta = Number(process.env.PORTA);
  if (porta !== 3000) throw new Error('Porta da API fora da demonstração local.');
  for (const conta of Object.values(CONTAS_DEMO)) {
    const senha = process.env[conta.senha] ?? '';
    if (senha.length < 12 || Buffer.byteLength(senha, 'utf8') > 72) {
      throw new Error('Credenciais privadas da demonstração ausentes ou inválidas.');
    }
  }
  return { databaseUrl, porta };
}

async function preparar(): Promise<void> {
  const { databaseUrl } = ambienteDemoLocal();
  const prisma = criarPrisma(databaseUrl);
  try {
    await semearAdminInicial(prisma, {
      ADMIN_INICIAL_EMAIL: CONTAS_DEMO.admin.email,
      ADMIN_INICIAL_NOME: 'Administrador (demonstração local)',
      ADMIN_INICIAL_CPF: CONTAS_DEMO.admin.cpf,
      ADMIN_INICIAL_CATEGORIA: 'RECEPCIONISTA',
    }, new Date());
    await semearDadosDeDesenvolvimento(prisma, 'development');

    // Confere identidades antes de atualizar somente as quatro contas fictícias.
    const funcionarios = await Promise.all(
      [CONTAS_DEMO.admin, CONTAS_DEMO.recepcao, CONTAS_DEMO.dentista].map(
        (conta) => prisma.funcionario.findUniqueOrThrow({ where: { email: conta.email } }),
      ),
    );
    const contas = [CONTAS_DEMO.admin, CONTAS_DEMO.recepcao, CONTAS_DEMO.dentista];
    for (const [indice, funcionario] of funcionarios.entries()) {
      if (funcionario.cpf !== contas[indice]!.cpf || !funcionario.ativo
          || funcionario.isAdmin !== (indice === 0)
          || funcionario.categoria !== (indice === 2 ? 'DENTISTA' : 'RECEPCIONISTA')) {
        throw new Error('Identidade fictícia divergente; banco preservado.');
      }
    }
    const paciente = await prisma.cliente.findUniqueOrThrow({
      where: { cpf: CONTAS_DEMO.paciente.cpf }, include: { login: true },
    });
    if (paciente.nome !== 'Marcos Oliveira (exemplo)' || paciente.telefone !== '47999990000') {
      throw new Error('Paciente fictício divergente; banco preservado.');
    }

    for (const [indice, funcionario] of funcionarios.entries()) {
      const senha = process.env[contas[indice]!.senha]!;
      if (!await conferirSenha(senha, funcionario.senhaHash)) {
        const senhaHash = await gerarHashDeSenha(senha);
        await prisma.$transaction(async (tx) => {
          await tx.funcionario.update({ where: { id: funcionario.id }, data: { senhaHash } });
          await tx.refreshToken.updateMany({ where: { funcionarioId: funcionario.id, revogadoEm: null }, data: { revogadoEm: new Date() } });
        });
      }
    }
    const senhaPaciente = process.env[CONTAS_DEMO.paciente.senha]!;
    if (!paciente.login || !await conferirSenha(senhaPaciente, paciente.login.senhaHash)) {
      const senhaHash = await gerarHashDeSenha(senhaPaciente);
      await prisma.$transaction(async (tx) => {
        const login = await tx.login.upsert({ where: { clienteId: paciente.id }, create: { clienteId: paciente.id, senhaHash }, update: { senhaHash } });
        await tx.refreshToken.updateMany({ where: { loginId: login.id, revogadoEm: null }, data: { revogadoEm: new Date() } });
      });
    }
    console.log('OK: dados fictícios e quatro perfis locais preparados; senhas mantidas no arquivo privado.');
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  preparar().catch(() => {
    // Erros do driver podem conter URLs/credenciais: nunca imprimir o objeto ou message.
    console.error('FALHA: preparação local interrompida. Confira o banco exclusivo e a configuração privada.');
    process.exitCode = 1;
  });
}
