import { afterAll, describe, expect, it } from 'vitest';
import { criarContextoDeTeste } from '../../testes/contexto-de-teste.ts';

// #4 (D40): os índices das consultas mais frequentes existem, e nenhuma FK usa SET NULL (D18: nada se apaga se outra
// tabela aponta).
const contexto = criarContextoDeTeste();
afterAll(() => contexto.prisma.$disconnect());

const INDICES_ESPERADOS = [
  ['RefreshToken', '"loginId"'],
  ['RefreshToken', '"funcionarioId"'],
  ['Bloqueio', '"dentistaId", inicio'],
  ['GradeHorario', '"dentistaId"'],
  ['AlertaCliente', '"clienteId"'],
  ['Consulta', '"procedimentoId"'],
  ['HistoricoObservacao', '"consultaId"'],
] as const;

describe('índices e FKs (D40)', () => {
  it.each(INDICES_ESPERADOS)('%s tem índice em (%s)', async (tabela, colunas) => {
    const indices = await contexto.prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = ${tabela}`;

    expect(indices.map((indice) => indice.indexdef.match(/USING btree \((.*)\)/)?.[1])).toContain(colunas);
  });

  it('nenhuma FK apaga em cascata nem anula a coluna: todas RESTRICT', async () => {
    const regras = await contexto.prisma.$queryRaw<{ nome: string; regra: string }[]>`
      SELECT conname AS nome, confdeltype::text AS regra FROM pg_constraint WHERE contype = 'f' ORDER BY conname`;

    expect(regras.length).toBeGreaterThan(0);
    expect(regras.filter((fk) => fk.regra !== 'r')).toEqual([]);
  });
});
