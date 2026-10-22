import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import { pinoHttp } from 'pino-http';
import type { Contexto } from './compartilhado/contexto.ts';
import { criarMiddlewareDeErro, rotaInexistente } from './compartilhado/middleware-de-erro.ts';
import { criarRotasAuth } from './modulos/auth/auth.rotas.ts';
import { criarRotasDentistas, criarRotasFuncionarios } from './modulos/funcionarios/funcionarios.rotas.ts';
import { criarRotasDisponibilidade } from './modulos/disponibilidade/disponibilidade.rotas.ts';
import { criarRotasPacientes } from './modulos/pacientes/pacientes.rotas.ts';
import { criarRotasProcedimentos } from './modulos/procedimentos/procedimentos.rotas.ts';

// Monta o app sem abrir porta, para o Supertest (D23).
export function criarApp(contexto: Contexto): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(pinoHttp({ logger: contexto.logger }));
  app.use(express.json());
  app.use(cookieParser());

  app.use('/api/auth', criarRotasAuth(contexto));
  app.use('/api/funcionarios', criarRotasFuncionarios(contexto));
  app.use('/api/dentistas', criarRotasDentistas(contexto));
  app.use('/api/dentistas', criarRotasDisponibilidade(contexto));
  app.use('/api/pacientes', criarRotasPacientes(contexto));
  app.use('/api/procedimentos', criarRotasProcedimentos(contexto));

  app.use(rotaInexistente);
  app.use(criarMiddlewareDeErro(contexto.logger));
  return app;
}
