import express, { type Express } from 'express';
import { pinoHttp } from 'pino-http';
import type { Contexto } from './compartilhado/contexto.ts';
import { criarMiddlewareDeErro, rotaInexistente } from './compartilhado/middleware-de-erro.ts';
import { criarRotasAuth } from './modulos/auth/auth.rotas.ts';

// Monta o app sem abrir porta, para o Supertest (D23).
export function criarApp(contexto: Contexto): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(pinoHttp({ logger: contexto.logger }));
  app.use(express.json());

  app.use('/api/auth', criarRotasAuth(contexto));

  app.use(rotaInexistente);
  app.use(criarMiddlewareDeErro(contexto.logger));
  return app;
}
