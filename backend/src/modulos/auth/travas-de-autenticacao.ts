import type { Transacao } from '../../compartilhado/banco.ts';
import { travarChave } from '../../compartilhado/travas.ts';
import type { TipoConta } from '../../generated/prisma/client.ts';
import type { ContaDaSessao } from './sessoes.ts';

export function travarIdentificador(tx: Transacao, tipo: TipoConta, identificador: string): Promise<void> {
  return travarChave(tx, `login:${tipo}:${identificador}`);
}

export async function travarCodigos(tx: Transacao, tipo: TipoConta, identificadores: string[]): Promise<void> {
  for (const identificador of [...new Set(identificadores)].sort()) {
    await travarChave(tx, `codigo:${tipo}:${identificador}`);
  }
}

export async function travarIdentificadores(tx: Transacao, tipo: TipoConta, identificadores: string[]): Promise<void> {
  for (const identificador of [...new Set(identificadores)].sort()) {
    await travarIdentificador(tx, tipo, identificador);
  }
}

// Estabiliza o e-mail antigo antes de adquirir as travas dos endereços antigo e novo.
export function travarEdicaoFuncionario(tx: Transacao, id: string): Promise<void> {
  return travarChave(tx, `edicao-funcionario:${id}`);
}

// Ordem comum: código → identificador → conta → linhas/sessão. Refresh começa pela conta.
export function travarConta(tx: Transacao, conta: ContaDaSessao): Promise<void> {
  const chave = 'loginId' in conta ? `cliente:${conta.loginId}` : `funcionario:${conta.funcionarioId}`;
  return travarChave(tx, `conta:${chave}`);
}
