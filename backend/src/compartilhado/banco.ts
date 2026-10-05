import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../generated/prisma/client.ts';

// Aceita tanto o PrismaClient quanto o "tx" de dentro de prisma.$transaction.
export type Transacao = Prisma.TransactionClient;

export function criarPrisma(url: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}
