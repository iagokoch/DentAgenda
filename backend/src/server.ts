import { criarApp } from './app.ts';
import { criarPrisma } from './compartilhado/banco.ts';
import { criarLogger } from './compartilhado/logger.ts';
import { EnviadorLog } from './compartilhado/mensageria.ts';
import { relogioDoSistema } from './compartilhado/relogio.ts';
import { carregarConfig } from './config/env.ts';

const config = carregarConfig(process.env);
const logger = criarLogger();

const app = criarApp({
  prisma: criarPrisma(config.databaseUrl),
  relogio: relogioDoSistema,
  enviador: new EnviadorLog(logger),
  config,
  logger,
});

app.listen(config.porta, () => logger.info(`API ouvindo em http://localhost:${config.porta}`));
