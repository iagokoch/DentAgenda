import type { PrismaClient } from '../src/generated/prisma/client.ts';

export async function limparBanco(prisma: PrismaClient): Promise<void> {
  const [linha] = await prisma.$queryRaw<{ banco: string }[]>`SELECT current_database() AS banco`;
  const banco = linha?.banco;
  if (!banco?.endsWith('_test')) {
    throw new Error(`limparBanco só roda em banco com nome terminado em _test; o banco atual é "${banco}".`);
  }
  const tabelas = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tabelas.length === 0) return;
  const lista = tabelas.map(({ tablename }) => `"public"."${tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${lista} CASCADE`);
}
