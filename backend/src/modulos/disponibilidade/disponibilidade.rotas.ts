import { Router } from 'express';
import { autenticar, exigirPapel } from '../../compartilhado/autenticacao.ts';
import type { Contexto } from '../../compartilhado/contexto.ts';
import { criarControllerDisponibilidade } from './disponibilidade.controller.ts';

// Montado em /api/dentistas, ao lado de GET /api/dentistas (funcionarios.rotas.ts).
export function criarRotasDisponibilidade(contexto: Contexto): Router {
  const controller = criarControllerDisponibilidade(contexto);
  const rotas = Router();
  rotas.use(autenticar(contexto));
  rotas.get('/:id/grade', exigirPapel('R', 'A', 'D'), controller.lerGrade);
  rotas.put('/:id/grade', exigirPapel('A'), controller.gravarGrade);
  return rotas;
}
