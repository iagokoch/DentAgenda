import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, expect, it } from 'vitest';
import { criarContextoDeTeste } from '../../../testes/contexto-de-teste.ts';

const contexto = criarContextoDeTeste();
afterAll(() => contexto.prisma.$disconnect());

it('migration numera legado com empates, preserva texto atual e inicializa contadores sem histórico', async () => {
  const esquema = `migracao_${randomUUID().replaceAll('-', '')}`;
  const reverter = new Error('Fim do ensaio isolado');
  const sql = readFileSync(new URL('../../../prisma/migrations/20261109150000_versoes_observacao/migration.sql', import.meta.url), 'utf8');
  await contexto.prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`CREATE SCHEMA "${esquema}"`);
    await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${esquema}"`);
    await tx.$executeRawUnsafe('CREATE TABLE "Consulta" (id UUID PRIMARY KEY, observacao TEXT)');
    await tx.$executeRawUnsafe('CREATE TABLE "HistoricoObservacao" (id UUID PRIMARY KEY, "consultaId" UUID, "editadoEm" TIMESTAMPTZ, texto TEXT)');
    await tx.$executeRawUnsafe(`INSERT INTO "Consulta" VALUES
      ('00000000-0000-0000-0000-000000000001', 'Texto atual preservado'),
      ('00000000-0000-0000-0000-000000000002', NULL)`);
    await tx.$executeRawUnsafe(`INSERT INTO "HistoricoObservacao" VALUES
      ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '2026-01-01T12:00:00Z', 'B'),
      ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '2026-01-01T12:00:00Z', 'A')`);
    for (const comando of sql.split(';').map((parte) => parte.trim()).filter(Boolean)) {
      await tx.$executeRawUnsafe(comando);
    }
    expect(await tx.$queryRawUnsafe('SELECT observacao, "versaoObservacao" FROM "Consulta" ORDER BY id'))
      .toEqual([{ observacao: 'Texto atual preservado', versaoObservacao: 2 }, { observacao: null, versaoObservacao: 0 }]);
    expect(await tx.$queryRawUnsafe('SELECT texto, versao FROM "HistoricoObservacao" ORDER BY versao'))
      .toEqual([{ texto: 'A', versao: 1 }, { texto: 'B', versao: 2 }]);
    // Rollback também remove o schema criado pelo próprio ensaio, sem tocar no schema da aplicação.
    throw reverter;
  }).catch((erro: unknown) => { if (erro !== reverter) throw erro; });
});
