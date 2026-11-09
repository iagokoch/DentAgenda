import { criarApp } from './app.ts';
import { criarPrisma } from './compartilhado/banco.ts';
import { criarLogger } from './compartilhado/logger.ts';
import { EnviadorLog } from './compartilhado/mensageria.ts';
import { relogioDoSistema } from './compartilhado/relogio.ts';
import { carregarConfig } from './config/env.ts';
import { criarSaude } from './compartilhado/saude.ts';
import { criarEncerramento } from './compartilhado/encerramento.ts';

const config = carregarConfig(process.env);
const logger = criarLogger();
const prisma = criarPrisma(config.databaseUrl);
const saude = criarSaude(() => prisma.$queryRaw`SELECT 1`);

const app = criarApp({
  prisma,
  relogio: relogioDoSistema,
  enviador: new EnviadorLog(logger),
  config,
  logger,
}, { saude });

const servidor = app.listen(config.porta, () => logger.info(`API ouvindo em http://localhost:${config.porta}`));
const encerrar = criarEncerramento({
  iniciar: saude.iniciarEncerramento,
  fechar: (concluiu) => { servidor.close(concluiu); },
  forcarFechamento: () => servidor.closeAllConnections(),
  desconectar: () => prisma.$disconnect(),
  registrar: (sucesso) => {
    if (sucesso) logger.info('API encerrada');
    else logger.error('API encerrada com falha ou prazo excedido');
  },
  finalizar: (codigo) => {
    process.exitCode = codigo;
    if (codigo !== 0) process.exit(codigo);
  },
});
process.on('SIGTERM', () => { void encerrar(); });
process.on('SIGINT', () => { void encerrar(); });
