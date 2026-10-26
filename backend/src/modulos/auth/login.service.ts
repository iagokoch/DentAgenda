import type { Transacao } from '../../compartilhado/banco.ts';
import type { Contexto } from '../../compartilhado/contexto.ts';
import { ErroDeNegocio } from '../../compartilhado/erros.ts';
import { travarChave } from '../../compartilhado/travas.ts';
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

// D38: o bcrypt roda fora de transação; a decisão (falhas, bloqueio, tentativa e sessão) roda numa transação curta,
// travada por conta, para tentativas simultâneas contarem umas com as outras. O erro sai depois do commit: a tentativa
// registrada não pode ser desfeita junto com a resposta 401/423.
type Decisao = { erro: ErroDeNegocio } | { sucesso: ResultadoDoLogin };

function aplicar(decisao: Decisao): ResultadoDoLogin {
  if ('erro' in decisao) throw decisao.erro;
  return decisao.sucesso;
}

const chaveDoLogin = (tipo: TipoConta, identificador: string) => `login:${tipo}:${identificador}`;

export async function loginCliente(
  contexto: Contexto,
  entrada: EntradaDoLogin & { cpf: string },
): Promise<ResultadoDoLogin> {
  const cliente = await contexto.prisma.cliente.findUnique({ where: { cpf: entrada.cpf }, include: { login: true } });
  const senhaCerta = await conferirSenhaSemRevelarConta(entrada.senha, cliente?.login?.senhaHash);

  const decisao = await contexto.prisma.$transaction(async (tx): Promise<Decisao> => {
    await travarChave(tx, chaveDoLogin('CLIENTE', entrada.cpf));
    const registrar = (resultado: ResultadoTentativa) =>
      registrarTentativa(tx, contexto, entrada.cpf, 'CLIENTE', entrada.ip, resultado);
    const tentativas = await tentativasDesdeUltimaLiberacao(tx, entrada.cpf, 'CLIENTE');
    if (clienteEstaBloqueado(tentativas)) {
      await registrar('FALHA');
      return { erro: contaDoClienteBloqueada() };
    }
    const login = cliente?.login;
    if (!cliente || !login || !senhaCerta) {
      const falha = await registrar('FALHA');
      if (!clienteEstaBloqueado([...tentativas, falha])) return { erro: credenciaisInvalidasDoCliente() };
      // D19: conta bloqueada derruba todas as sessões.
      if (login) await revogarTodasAsSessoes(tx, { loginId: login.id }, contexto);
      return { erro: contaDoClienteBloqueada() };
    }

    await registrar('SUCESSO');
    const sessao = await criarSessao(tx, { loginId: login.id }, contexto);
    const accessToken = gerarAccessToken({ tipo: 'CLIENTE', clienteId: cliente.id, sessaoId: sessao.sessaoId }, contexto);
    return {
      sucesso: { accessToken, refreshToken: sessao.refreshToken, expiraEm: sessao.expiraEm, usuario: usuarioDoCliente(cliente) },
    };
  });
  return aplicar(decisao);
}

export async function loginFuncionario(
  contexto: Contexto,
  entrada: EntradaDoLogin & { email: string },
): Promise<ResultadoDoLogin> {
  const funcionario = await contexto.prisma.funcionario.findUnique({ where: { email: entrada.email } });
  const senhaCerta = await conferirSenhaSemRevelarConta(entrada.senha, funcionario?.senhaHash);

  const decisao = await contexto.prisma.$transaction(async (tx): Promise<Decisao> => {
    await travarChave(tx, chaveDoLogin('FUNCIONARIO', entrada.email));
    const registrar = (resultado: ResultadoTentativa) =>
      registrarTentativa(tx, contexto, entrada.email, 'FUNCIONARIO', entrada.ip, resultado);
    const agora = contexto.relogio.agora();
    const tentativas = await tentativasDesdeUltimaLiberacao(tx, entrada.email, 'FUNCIONARIO');
    if (funcionarioBloqueadoAte(tentativas, agora)) {
      await registrar('FALHA');
      return { erro: contaDoFuncionarioBloqueada() };
    }
    if (!funcionario?.ativo || !senhaCerta) {
      const falha = await registrar('FALHA');
      if (funcionarioBloqueadoAte([...tentativas, falha], agora)) return { erro: contaDoFuncionarioBloqueada() };
      return { erro: credenciaisInvalidasDoFuncionario() };
    }

    await registrar('SUCESSO');
    const sessao = await criarSessao(tx, { funcionarioId: funcionario.id }, contexto);
    const accessToken = gerarAccessToken(autenticadoDoFuncionario(funcionario, sessao.sessaoId), contexto);
    return {
      sucesso: { accessToken, refreshToken: sessao.refreshToken, expiraEm: sessao.expiraEm, usuario: usuarioDoFuncionario(funcionario) },
    };
  });
  return aplicar(decisao);
}

// Busca só a partir do último acerto/redefinição: o histórico de um identificador atacado cresce sem limite.
async function tentativasDesdeUltimaLiberacao(
  tx: Transacao,
  identificador: string,
  tipo: TipoConta,
): Promise<Tentativa[]> {
  const ultimaLiberacao = await tx.tentativaLogin.findFirst({
    where: { identificador, tipo, resultado: { not: 'FALHA' } },
    orderBy: { ocorridoEm: 'desc' },
  });
  return tx.tentativaLogin.findMany({
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
