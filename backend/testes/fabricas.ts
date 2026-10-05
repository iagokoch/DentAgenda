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

// Access token com sessaoId aleatório: as rotas protegidas não consultam a sessão (D19).
export function tokenDe(contexto: Contexto, conta: Funcionario | Cliente): string {
  const sessaoId = randomUUID();
  if ('categoria' in conta) {
    return gerarAccessToken(
      { tipo: 'FUNCIONARIO', funcionarioId: conta.id, categoria: conta.categoria, isAdmin: conta.isAdmin, sessaoId },
      contexto,
    );
  }
  return gerarAccessToken({ tipo: 'CLIENTE', clienteId: conta.id, sessaoId }, contexto);
}
