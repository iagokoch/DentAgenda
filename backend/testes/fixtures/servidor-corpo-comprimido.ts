import { criarApp } from '../../src/app.ts';
import type { Contexto } from '../../src/compartilhado/contexto.ts';
import { criarLogger } from '../../src/compartilhado/logger.ts';

// Usa o app real, mas nenhum caminho deste ensaio pode acessar o banco ou enviar mensagens.
const recusarDependencia = () => { throw new Error('dependência externa acionada no ensaio do parser'); };
const contexto = {
  config: { nodeEnv: 'test', proxyConfiavel: false },
  logger: criarLogger(undefined, 'silent'),
  prisma: new Proxy({}, { get: recusarDependencia }),
  relogio: { agora: () => new Date('2026-11-14T12:00:00Z') },
  enviador: { enviar: recusarDependencia },
} as unknown as Contexto;

const servidor = criarApp(contexto).listen(0, '127.0.0.1', () => {
  const endereco = servidor.address();
  if (!endereco || typeof endereco === 'string') throw new Error('porta do ensaio indisponível');
  process.send?.({ porta: endereco.port });
});

// O processo pai encerra somente esta fixture. Não interceptar uncaughtException:
// um erro tardio do descompressor precisa derrubar o filho e reprovar o teste.
process.on('disconnect', () => { servidor.closeAllConnections(); servidor.close(); });
