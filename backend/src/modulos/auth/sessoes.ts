import type { Response } from 'express';
import type { Transacao } from '../../compartilhado/banco.ts';
import type { Contexto } from '../../compartilhado/contexto.ts';
import { gerarRefreshToken } from '../../compartilhado/tokens.ts';

export type ContaDaSessao = { loginId: string } | { funcionarioId: string };

export const NOME_DO_COOKIE_DE_REFRESH = 'dentagenda_refresh';

const HORA = 60 * 60 * 1000;
// D19: sessão esquecida aberta no computador da recepção não pode durar dias.
const DURACAO_DO_REFRESH_DO_CLIENTE = 30 * 24 * HORA;
const DURACAO_DO_REFRESH_DO_FUNCIONARIO = 12 * HORA;

export async function criarSessao(
  tx: Transacao,
  conta: ContaDaSessao,
  contexto: Contexto,
): Promise<{ refreshToken: string; sessaoId: string; expiraEm: Date }> {
  const { token, tokenHash } = gerarRefreshToken();
  const criadoEm = contexto.relogio.agora();
  const duracao = 'loginId' in conta ? DURACAO_DO_REFRESH_DO_CLIENTE : DURACAO_DO_REFRESH_DO_FUNCIONARIO;
  const expiraEm = new Date(criadoEm.getTime() + duracao);
  const sessao = await tx.refreshToken.create({ data: { ...conta, tokenHash, criadoEm, expiraEm } });
  return { refreshToken: token, sessaoId: sessao.id, expiraEm };
}

export async function revogarTodasAsSessoes(tx: Transacao, conta: ContaDaSessao, contexto: Contexto): Promise<void> {
  await tx.refreshToken.updateMany({
    where: { ...conta, revogadoEm: null },
    data: { revogadoEm: contexto.relogio.agora() },
  });
}

// D19: o cookie só vai para a rota de refresh; fora do desenvolvimento, só por HTTPS.
export function definirCookieDeRefresh(res: Response, token: string, expiraEm: Date, contexto: Contexto): void {
  res.cookie(NOME_DO_COOKIE_DE_REFRESH, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: contexto.config.nodeEnv !== 'development' && contexto.config.nodeEnv !== 'test',
    path: '/api/auth/refresh',
    expires: expiraEm,
  });
}
