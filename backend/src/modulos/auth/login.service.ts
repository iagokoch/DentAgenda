import type { Transacao } from '../../compartilhado/banco.ts';
import type { Contexto } from '../../compartilhado/contexto.ts';
import { ErroDeNegocio } from '../../compartilhado/erros.ts';
import { conferirSenha, gerarHashDeSenha, gerarSenhaAleatoria } from '../../compartilhado/senhas.ts';
import { gerarAccessToken } from '../../compartilhado/tokens.ts';
import type { ResultadoTentativa, TipoConta } from '../../generated/prisma/client.ts';
import { clienteEstaBloqueado, funcionarioBloqueadoAte, type Tentativa } from './bloqueio-de-login.ts';
import { criarSessao, revogarTodasAsSessoes } from './sessoes.ts';
import {
  autenticadoDoFuncionario,
  usuarioDoCliente,
  usuarioDoFuncionario,
  type UsuarioDaResposta,
} from './usuario-da-resposta.ts';

export type ResultadoDoLogin = {
  accessToken: string;
  refreshToken: string;
  expiraEm: Date;
  usuario: UsuarioDaResposta;
};

type EntradaDoLogin = { senha: string; ip: string };

const credenciaisInvalidasDoCliente = () =>
  new ErroDeNegocio(401, 'CREDENCIAIS_INVALIDAS', 'CPF ou senha incorretos.');
const credenciaisInvalidasDoFuncionario = () =>
  new ErroDeNegocio(401, 'CREDENCIAIS_INVALIDAS', 'E-mail ou senha incorretos.');
const contaDoClienteBloqueada = () =>
  new ErroDeNegocio(423, 'CONTA_BLOQUEADA', 'Conta bloqueada após 3 tentativas. Use "Recuperar senha" para desbloquear.');
const contaDoFuncionarioBloqueada = () =>
  new ErroDeNegocio(423, 'CONTA_BLOQUEADA', 'Conta bloqueada por 15 minutos após 3 tentativas.');

export async function loginCliente(
  contexto: Contexto,
  entrada: EntradaDoLogin & { cpf: string },
): Promise<ResultadoDoLogin> {
  const registrar = (resultado: ResultadoTentativa) =>
    registrarTentativa(contexto.prisma, contexto, entrada.cpf, 'CLIENTE', entrada.ip, resultado);
  const tentativas = await tentativasDesdeUltimaLiberacao(contexto, entrada.cpf, 'CLIENTE');
  if (clienteEstaBloqueado(tentativas)) {
    await registrar('FALHA');
    throw contaDoClienteBloqueada();
  }

  const cliente = await contexto.prisma.cliente.findUnique({ where: { cpf: entrada.cpf }, include: { login: true } });
  const senhaCerta = await conferirSenhaSemRevelarConta(entrada.senha, cliente?.login?.senhaHash);
  if (!cliente?.login || !senhaCerta) {
    const falha = await registrar('FALHA');
    if (!clienteEstaBloqueado([...tentativas, falha])) throw credenciaisInvalidasDoCliente();
    // D19: conta bloqueada derruba todas as sessões.
    if (cliente?.login) await revogarTodasAsSessoes(contexto.prisma, { loginId: cliente.login.id }, contexto);
    throw contaDoClienteBloqueada();
  }

  const login = cliente.login;
  return contexto.prisma.$transaction(async (tx) => {
    await registrarTentativa(tx, contexto, entrada.cpf, 'CLIENTE', entrada.ip, 'SUCESSO');
    const sessao = await criarSessao(tx, { loginId: login.id }, contexto);
    const accessToken = gerarAccessToken({ tipo: 'CLIENTE', clienteId: cliente.id, sessaoId: sessao.sessaoId }, contexto);
    return {
      accessToken,
      refreshToken: sessao.refreshToken,
      expiraEm: sessao.expiraEm,
      usuario: usuarioDoCliente(cliente),
    };
  });
}

export async function loginFuncionario(
  contexto: Contexto,
  entrada: EntradaDoLogin & { email: string },
): Promise<ResultadoDoLogin> {
  const registrar = (resultado: ResultadoTentativa) =>
    registrarTentativa(contexto.prisma, contexto, entrada.email, 'FUNCIONARIO', entrada.ip, resultado);
  const agora = contexto.relogio.agora();
  const tentativas = await tentativasDesdeUltimaLiberacao(contexto, entrada.email, 'FUNCIONARIO');
  if (funcionarioBloqueadoAte(tentativas, agora)) {
    await registrar('FALHA');
    throw contaDoFuncionarioBloqueada();
  }

  const funcionario = await contexto.prisma.funcionario.findUnique({ where: { email: entrada.email } });
  const senhaCerta = await conferirSenhaSemRevelarConta(entrada.senha, funcionario?.senhaHash);
  if (!funcionario?.ativo || !senhaCerta) {
    const falha = await registrar('FALHA');
    if (funcionarioBloqueadoAte([...tentativas, falha], agora)) throw contaDoFuncionarioBloqueada();
    throw credenciaisInvalidasDoFuncionario();
  }

  return contexto.prisma.$transaction(async (tx) => {
    await registrarTentativa(tx, contexto, entrada.email, 'FUNCIONARIO', entrada.ip, 'SUCESSO');
    const sessao = await criarSessao(tx, { funcionarioId: funcionario.id }, contexto);
    const accessToken = gerarAccessToken(autenticadoDoFuncionario(funcionario, sessao.sessaoId), contexto);
    return {
      accessToken,
      refreshToken: sessao.refreshToken,
      expiraEm: sessao.expiraEm,
      usuario: usuarioDoFuncionario(funcionario),
    };
  });
}

// Busca só a partir do último acerto/redefinição: o histórico de um identificador atacado cresce sem limite.
async function tentativasDesdeUltimaLiberacao(
  contexto: Contexto,
  identificador: string,
  tipo: TipoConta,
): Promise<Tentativa[]> {
  const ultimaLiberacao = await contexto.prisma.tentativaLogin.findFirst({
    where: { identificador, tipo, resultado: { not: 'FALHA' } },
    orderBy: { ocorridoEm: 'desc' },
  });
  return contexto.prisma.tentativaLogin.findMany({
    where: { identificador, tipo, ocorridoEm: { gte: ultimaLiberacao?.ocorridoEm ?? new Date(0) } },
    orderBy: { ocorridoEm: 'asc' },
    select: { ocorridoEm: true, resultado: true },
  });
}

async function registrarTentativa(
  tx: Transacao,
  contexto: Contexto,
  identificador: string,
  tipo: TipoConta,
  ip: string,
  resultado: ResultadoTentativa,
): Promise<Tentativa> {
  return tx.tentativaLogin.create({
    data: { identificador, tipo, ip, ocorridoEm: contexto.relogio.agora(), resultado },
    select: { ocorridoEm: true, resultado: true },
  });
}

// Conta inexistente também paga o custo do bcrypt: o tempo de resposta não revela se ela existe (D5).
let hashFicticio: Promise<string> | undefined;

async function conferirSenhaSemRevelarConta(senha: string, hash: string | undefined): Promise<boolean> {
  if (hash) return conferirSenha(senha, hash);
  await conferirSenha(senha, await (hashFicticio ??= gerarHashDeSenha(gerarSenhaAleatoria())));
  return false;
}
