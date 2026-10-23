import cookieParser from 'cookie-parser';
import express, { type Express, type Request } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Contexto } from './compartilhado/contexto.ts';
import { limitarRequisicoesPorIp } from './compartilhado/limite-de-requisicoes.ts';
import { serializarRequisicao } from './compartilhado/logger.ts';
import { criarMiddlewareDeErro, rotaInexistente } from './compartilhado/middleware-de-erro.ts';
import { criarRotasDeDocumentacao } from './compartilhado/openapi.ts';
import { MODULOS_DOCUMENTADOS } from './modulos-documentados.ts';
import { criarRotasAuth } from './modulos/auth/auth.rotas.ts';
import { criarRotasConsultas } from './modulos/consultas/consultas.rotas.ts';
import { criarRotasDentistas, criarRotasFuncionarios } from './modulos/funcionarios/funcionarios.rotas.ts';
import { criarRotasBloqueios, criarRotasDisponibilidade, criarRotasHorarios } from './modulos/disponibilidade/disponibilidade.rotas.ts';
import { criarRotasPacientes } from './modulos/pacientes/pacientes.rotas.ts';
import { criarRotasProcedimentos } from './modulos/procedimentos/procedimentos.rotas.ts';

// Pedidos por IP em 15 min nas rotas de autenticação: folgado para uma clínica atrás do mesmo IP,
// curto para quem tenta esgotar a CPU com bcrypt (D32).
const LIMITE_PADRAO_DE_AUTH_POR_IP = 200;

// Monta o app sem abrir porta, para o Supertest (D23).
export function criarApp(contexto: Contexto, opcoes: { limiteDeAuth?: number } = {}): Express {
  const app = express();
  app.disable('x-powered-by');
  // D40: com proxy na frente, o IP de quem pediu vem do X-Forwarded-For; sem PROXY_CONFIAVEL, o cabeçalho é ignorado.
  if (contexto.config.proxyConfiavel !== false) app.set('trust proxy', contexto.config.proxyConfiavel);
  app.use(helmet());
  app.use(pinoHttp({ logger: contexto.logger, serializers: { req: serializarRequisicao } }));
  app.use(express.json());
  app.use(cookieParser());

  // Swagger só fora de produção (D23, D34).
  if (contexto.config.nodeEnv !== 'production') {
    app.use(criarRotasDeDocumentacao(MODULOS_DOCUMENTADOS.map(({ documentado }) => documentado)));
  }

  const ehRefresh = (req: Request) => req.path === '/refresh';
  app.use('/api/auth', limitarRequisicoesPorIp(opcoes.limiteDeAuth ?? LIMITE_PADRAO_DE_AUTH_POR_IP, ehRefresh), criarRotasAuth(contexto));
  app.use('/api/funcionarios', criarRotasFuncionarios(contexto));
  app.use('/api/dentistas', criarRotasDentistas(contexto));
  app.use('/api/dentistas', criarRotasDisponibilidade(contexto));
  app.use('/api/bloqueios', criarRotasBloqueios(contexto));
  app.use('/api/consultas', criarRotasConsultas(contexto));
  app.use('/api', criarRotasHorarios(contexto));
  app.use('/api/pacientes', criarRotasPacientes(contexto));
  app.use('/api/procedimentos', criarRotasProcedimentos(contexto));

  app.use(rotaInexistente);
  app.use(criarMiddlewareDeErro(contexto.logger));
  return app;
}
