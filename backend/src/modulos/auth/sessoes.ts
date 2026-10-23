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
// D38: duas abas renovam o mesmo cookie quase juntas; a atrasada recebe 401 sem derrubar a sessão da outra.
export const JANELA_DE_CORRIDA_DO_REFRESH_MS = 10_000;

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

type Renovacao = { accessToken: string; refreshToken: string; expiraEm: Date };

// D38: a sessão é lida com FOR UPDATE na transação da rotação: duas renovações do mesmo cookie esperam uma pela outra, e
// a segunda já vê o token revogado. O 401 sai depois do commit, para a revogação geral (D19) não ser desfeita junto.
export async function renovarSessao(contexto: Contexto, tokenDoCookie: string): Promise<Renovacao> {
  const agora = contexto.relogio.agora();
  const renovacao = await contexto.prisma.$transaction(async (tx): Promise<Renovacao | null> => {
    const [travada] = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "RefreshToken" WHERE "tokenHash" = ${hashDoRefreshToken(tokenDoCookie)} FOR UPDATE`;
    if (!travada) return null;
    const sessao = await tx.refreshToken.findUniqueOrThrow({ where: { id: travada.id }, include: { login: true, funcionario: true } });
    const conta: ContaDaSessao = sessao.loginId ? { loginId: sessao.loginId } : { funcionarioId: sessao.funcionarioId ?? '' };
    if (sessao.revogadoEm) {
      // Dentro da janela é a outra aba que pediu junto (D38); depois dela, sinal de roubo: derruba todas as sessões (D19).
      if (agora.getTime() - sessao.revogadoEm.getTime() >= JANELA_DE_CORRIDA_DO_REFRESH_MS) await revogarTodasAsSessoes(tx, conta, contexto);
      return null;
    }
    if (sessao.expiraEm <= agora || sessao.funcionario?.ativo === false) return null;

    await tx.refreshToken.update({ where: { id: sessao.id }, data: { revogadoEm: agora } });
    const nova = await criarSessao(tx, conta, contexto, sessao.expiraEm);
    const usuario: UsuarioAutenticado = sessao.funcionario
      ? autenticadoDoFuncionario(sessao.funcionario, nova.sessaoId)
      : { tipo: 'CLIENTE', clienteId: sessao.login?.clienteId ?? '', sessaoId: nova.sessaoId };
    return { accessToken: gerarAccessToken(usuario, contexto), refreshToken: nova.refreshToken, expiraEm: nova.expiraEm };
  });
  if (!renovacao) throw naoAutenticado();
  return renovacao;
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
