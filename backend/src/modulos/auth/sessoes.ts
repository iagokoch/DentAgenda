import type { CookieOptions, Response } from 'express';
import type { UsuarioAutenticado } from '../../compartilhado/autenticacao.ts';
import type { Transacao } from '../../compartilhado/banco.ts';
import type { Contexto } from '../../compartilhado/contexto.ts';
import { naoAutenticado } from '../../compartilhado/erros.ts';
import { gerarAccessToken, gerarRefreshToken, hashDoRefreshToken } from '../../compartilhado/tokens.ts';
import { autenticadoDoFuncionario } from './usuario-da-resposta.ts';

export type ContaDaSessao = { loginId: string } | { funcionarioId: string };

export const NOME_DO_COOKIE_DE_REFRESH = 'dentagenda_refresh';

const HORA = 60 * 60 * 1000;
// D19: sessão esquecida aberta no computador da recepção não pode durar dias.
const DURACAO_DO_REFRESH_DO_CLIENTE = 30 * 24 * HORA;
const DURACAO_DO_REFRESH_DO_FUNCIONARIO = 12 * HORA;

// D29: na rotação, a sessão nova herda o prazo da original (expiraEm), em vez de ganhar um prazo novo.
export async function criarSessao(
  tx: Transacao,
  conta: ContaDaSessao,
  contexto: Contexto,
  expiraEm?: Date,
): Promise<{ refreshToken: string; sessaoId: string; expiraEm: Date }> {
  const { token, tokenHash } = gerarRefreshToken();
  const criadoEm = contexto.relogio.agora();
  const duracao = 'loginId' in conta ? DURACAO_DO_REFRESH_DO_CLIENTE : DURACAO_DO_REFRESH_DO_FUNCIONARIO;
  const prazo = expiraEm ?? new Date(criadoEm.getTime() + duracao);
  const sessao = await tx.refreshToken.create({ data: { ...conta, tokenHash, criadoEm, expiraEm: prazo } });
  return { refreshToken: token, sessaoId: sessao.id, expiraEm: prazo };
}

export async function revogarTodasAsSessoes(tx: Transacao, conta: ContaDaSessao, contexto: Contexto): Promise<void> {
  await tx.refreshToken.updateMany({
    where: { ...conta, revogadoEm: null },
    data: { revogadoEm: contexto.relogio.agora() },
  });
}

export async function renovarSessao(
  contexto: Contexto,
  tokenDoCookie: string,
): Promise<{ accessToken: string; refreshToken: string; expiraEm: Date }> {
  const agora = contexto.relogio.agora();
  const sessao = await contexto.prisma.refreshToken.findUnique({
    where: { tokenHash: hashDoRefreshToken(tokenDoCookie) },
    include: { login: true, funcionario: true },
  });
  if (!sessao) throw naoAutenticado();
  const conta: ContaDaSessao = sessao.loginId ? { loginId: sessao.loginId } : { funcionarioId: sessao.funcionarioId ?? '' };
  if (sessao.revogadoEm) {
    // D19: token já revogado reapresentado é sinal de roubo; derruba todas as sessões da conta.
    await revogarTodasAsSessoes(contexto.prisma, conta, contexto);
    throw naoAutenticado();
  }
  if (sessao.expiraEm <= agora || sessao.funcionario?.ativo === false) throw naoAutenticado();

  return contexto.prisma.$transaction(async (tx) => {
    // Só revoga se ninguém revogou antes: duas renovações simultâneas do mesmo token não geram duas sessões.
    const revogada = await tx.refreshToken.updateMany({
      where: { id: sessao.id, revogadoEm: null },
      data: { revogadoEm: agora },
    });
    if (revogada.count === 0) throw naoAutenticado();
    const nova = await criarSessao(tx, conta, contexto, sessao.expiraEm);
    const usuario: UsuarioAutenticado = sessao.funcionario
      ? autenticadoDoFuncionario(sessao.funcionario, nova.sessaoId)
      : { tipo: 'CLIENTE', clienteId: sessao.login?.clienteId ?? '', sessaoId: nova.sessaoId };
    return { accessToken: gerarAccessToken(usuario, contexto), refreshToken: nova.refreshToken, expiraEm: nova.expiraEm };
  });
}

// D25.6: o cookie não chega ao logout; a sessão vem do sessaoId do access token.
export async function encerrarSessao(contexto: Contexto, usuario: UsuarioAutenticado): Promise<void> {
  const dono = usuario.tipo === 'CLIENTE' ? { login: { clienteId: usuario.clienteId } } : { funcionarioId: usuario.funcionarioId };
  await contexto.prisma.refreshToken.updateMany({
    where: { id: usuario.sessaoId, revogadoEm: null, ...dono },
    data: { revogadoEm: contexto.relogio.agora() },
  });
}

// D19: o cookie só vai para a rota de refresh; fora do desenvolvimento, só por HTTPS.
function opcoesDoCookie(contexto: Contexto): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: contexto.config.nodeEnv !== 'development' && contexto.config.nodeEnv !== 'test',
    path: '/api/auth/refresh',
  };
}

export function definirCookieDeRefresh(res: Response, token: string, expiraEm: Date, contexto: Contexto): void {
  res.cookie(NOME_DO_COOKIE_DE_REFRESH, token, { ...opcoesDoCookie(contexto), expires: expiraEm });
}

export function apagarCookieDeRefresh(res: Response, contexto: Contexto): void {
  res.clearCookie(NOME_DO_COOKIE_DE_REFRESH, opcoesDoCookie(contexto));
}
