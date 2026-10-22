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
  rotas.get('/:id/bloqueios', exigirPapel('R', 'D'), controller.listarBloqueios);
  return rotas;
}

// Montado em /api/bloqueios.
export function criarRotasBloqueios(contexto: Contexto): Router {
  const controller = criarControllerDisponibilidade(contexto);
  const rotas = Router();
  rotas.use(autenticar(contexto));
  rotas.post('/', exigirPapel('R', 'D'), controller.criarBloqueios);
  rotas.delete('/:id', exigirPapel('R', 'D'), controller.removerBloqueio);
  return rotas;
}

// Montado em /api: autentica rota a rota para não interceptar o resto de /api (ex.: /api/auth).
export function criarRotasHorarios(contexto: Contexto): Router {
  const controller = criarControllerDisponibilidade(contexto);
  const rotas = Router();
  rotas.get('/horarios-livres', autenticar(contexto), exigirPapel('R', 'D', 'C'), controller.horariosLivres);
  rotas.get('/dias-disponiveis', autenticar(contexto), exigirPapel('R', 'D', 'C'), controller.diasDisponiveis);
  return rotas;
}
