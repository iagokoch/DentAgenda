import { randomInt, randomUUID } from 'node:crypto';
import type { Contexto } from '../src/compartilhado/contexto.ts';
import { gerarHashDeSenha } from '../src/compartilhado/senhas.ts';
import { gerarAccessToken } from '../src/compartilhado/tokens.ts';
import type { Cliente, Funcionario, Procedimento } from '../src/generated/prisma/client.ts';

export const SENHA_DE_TESTE = 'senha-de-teste-123';

// bcrypt custo 12 leva ~250 ms por hash: calcula uma vez por arquivo de teste.
let hashDaSenhaDeTeste: Promise<string> | undefined;
const hashDeTeste = () => (hashDaSenhaDeTeste ??= gerarHashDeSenha(SENHA_DE_TESTE));

export function gerarCpfValido(): string {
  const digitos = Array.from({ length: 9 }, () => randomInt(10));
  if (digitos.every((digito) => digito === digitos[0])) return gerarCpfValido();
  for (const quantidade of [9, 10]) {
    const soma = digitos.reduce((total, digito, indice) => total + digito * (quantidade + 1 - indice), 0);
    const resto = (soma * 10) % 11;
    digitos.push(resto === 10 ? 0 : resto);
  }
  return digitos.join('');
}

export async function criarFuncionario(
  contexto: Contexto,
  dados: Partial<Pick<Funcionario, 'categoria' | 'isAdmin' | 'ativo' | 'email' | 'nome'>> = {},
): Promise<Funcionario> {
  const cpf = gerarCpfValido();
  const categoria = dados.categoria ?? 'RECEPCIONISTA';
  return contexto.prisma.funcionario.create({
    data: {
      nome: 'Funcionário de Teste',
      cpf,
      email: `${cpf}@colzani.com.br`,
      senhaHash: await hashDeTeste(),
      categoria,
      cro: categoria === 'DENTISTA' ? `CRO-SC ${cpf}` : null,
      dataInicio: contexto.relogio.agora(),
      ...dados,
    },
  });
}

export async function criarPaciente(
  contexto: Contexto,
  dados: Partial<Omit<Cliente, 'id'>> = {},
  opcoes: { comLogin?: boolean } = {},
): Promise<Cliente> {
  const agora = contexto.relogio.agora();
  const paciente = await contexto.prisma.cliente.create({
    data: {
      nome: 'Paciente de Teste',
      cpf: gerarCpfValido(),
      telefone: `479${String(randomInt(100_000_000)).padStart(8, '0')}`,
      criadoEm: agora,
      pacienteDesde: agora,
      ...dados,
    },
  });
  if (opcoes.comLogin) {
    await contexto.prisma.login.create({ data: { clienteId: paciente.id, senhaHash: await hashDeTeste() } });
  }
  return paciente;
}

export function criarProcedimento(
  contexto: Contexto,
  dados: Partial<Omit<Procedimento, 'id'>> = {},
): Promise<Procedimento> {
  return contexto.prisma.procedimento.create({
    data: { nome: `Procedimento ${randomUUID()}`, duracaoMinutos: 60, precoCentavos: 18000, ...dados },
  });
}

const DOZE_HORAS_EM_MS = 12 * 60 * 60 * 1000;

// As rotas protegidas conferem a sessão no banco (AUD-005): o token precisa de uma sessão real, ativa e da conta.
export async function tokenDe(contexto: Contexto, conta: Funcionario | Cliente): Promise<string> {
  const criadoEm = contexto.relogio.agora();
  const sessao = { tokenHash: randomUUID(), criadoEm, expiraEm: new Date(criadoEm.getTime() + DOZE_HORAS_EM_MS) };
  if ('categoria' in conta) {
    const { id: sessaoId } = await contexto.prisma.refreshToken.create({ data: { ...sessao, funcionarioId: conta.id } });
    return gerarAccessToken(
      { tipo: 'FUNCIONARIO', funcionarioId: conta.id, categoria: conta.categoria, isAdmin: conta.isAdmin, sessaoId },
      contexto,
    );
  }
  const login =
    (await contexto.prisma.login.findUnique({ where: { clienteId: conta.id } })) ??
    (await contexto.prisma.login.create({ data: { clienteId: conta.id, senhaHash: await hashDeTeste() } }));
  const { id: sessaoId } = await contexto.prisma.refreshToken.create({ data: { ...sessao, loginId: login.id } });
  return gerarAccessToken({ tipo: 'CLIENTE', clienteId: conta.id, sessaoId }, contexto);
}
