import { Router } from 'express';
import { autenticar, exigirPapel } from '../../compartilhado/autenticacao.ts';
import type { Contexto } from '../../compartilhado/contexto.ts';
import { criarControllerConsultas } from './consultas.controller.ts';

export function criarRotasConsultas(contexto: Contexto): Router {
  const controller = criarControllerConsultas(contexto);
  const rotas = Router();
  rotas.use(autenticar(contexto));
  rotas.post('/', exigirPapel('R', 'D', 'C'), controller.criar);
  rotas.get('/', exigirPapel('R', 'D', 'C'), controller.listar);
  // Antes de /:id, senão "pendentes" seria lido como id.
  rotas.get('/pendentes', exigirPapel('R', 'D'), controller.pendentes);
  rotas.get('/:id', exigirPapel('R', 'D', 'C'), controller.ver);
  rotas.post('/:id/cancelamento', exigirPapel('R', 'D', 'C'), controller.cancelar);
  rotas.post('/:id/remarcacao', exigirPapel('R', 'D', 'C'), controller.remarcar);
  rotas.post('/:id/realizacao', exigirPapel('R', 'D'), controller.realizar);
  rotas.put('/:id/observacao', exigirPapel('R', 'D', 'C'), controller.gravarObservacao);
  rotas.get('/:id/observacao/historico', exigirPapel('R', 'D', 'C'), controller.historicoDaObservacao);
  return rotas;
}
