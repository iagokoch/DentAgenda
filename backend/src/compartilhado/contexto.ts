import type { Logger } from 'pino';
import type { Config } from '../config/env.ts';
import type { PrismaClient } from '../generated/prisma/client.ts';
import type { EnviadorMensagem } from './mensageria.ts';
import type { Relogio } from './relogio.ts';

export type Contexto = {
  prisma: PrismaClient;
  relogio: Relogio;
  enviador: EnviadorMensagem;
  config: Config;
  logger: Logger;
};
