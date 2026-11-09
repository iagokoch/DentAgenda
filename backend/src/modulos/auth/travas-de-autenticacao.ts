import type { Transacao } from '../../compartilhado/banco.ts';
import { travarChave } from '../../compartilhado/travas.ts';
import type { TipoConta } from '../../generated/prisma/client.ts';
import type { ContaDaSessao } from './sessoes.ts';

export function travarIdentificador(tx: Transacao, tipo: TipoConta, identificador: string): Promise<void> {
  return travarChave(tx, `login:${tipo}:${identificador}`);
}

// Ordem comum: identificador (quando aplicável), conta, sessão. Refresh começa pela conta.
export function travarConta(tx: Transacao, conta: ContaDaSessao): Promise<void> {
  const chave = 'loginId' in conta ? `cliente:${conta.loginId}` : `funcionario:${conta.funcionarioId}`;
  return travarChave(tx, `conta:${chave}`);
}
