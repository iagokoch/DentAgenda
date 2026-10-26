import type { Transacao } from './banco.ts';

// D22.7: a exclusion constraint compara linhas de uma tabela só, então consulta e bloqueio criados ao mesmo
// tempo passariam um pelo outro. Quem cria um dos dois trava a linha do dentista (FOR UPDATE) dentro da
// transação; a segunda transação espera a primeira terminar. Os ids vão ordenados para dois pedidos em lote
// não se travarem em ordem inversa.
export async function travarDentistas(tx: Transacao, dentistaIds: string[]): Promise<void> {
  if (dentistaIds.length === 0) return;
  await tx.$queryRaw`
    SELECT id FROM "Funcionario" WHERE id = ANY(${dentistaIds}::uuid[]) ORDER BY id FOR UPDATE`;
}

// D38: serializa pedidos sobre a mesma chave (ex.: login do mesmo CPF) até o fim da transação, sem linha para travar:
// a trava consultiva do Postgres vale por chave e some no commit ou rollback.
export async function travarChave(tx: Transacao, chave: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${chave}, 0))`;
}
