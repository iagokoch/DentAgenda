import { Router } from 'express';
import { autenticar, exigirPapel } from '../../compartilhado/autenticacao.ts';
import type { Contexto } from '../../compartilhado/contexto.ts';
import { criarControllerFuncionarios } from './funcionarios.controller.ts';

export function criarRotasFuncionarios(contexto: Contexto): Router {
  const controller = criarControllerFuncionarios(contexto);
  const rotas = Router();
  rotas.use(autenticar(contexto));
  rotas.get('/', exigirPapel('A'), controller.listar);
  rotas.post('/', exigirPapel('A'), controller.criar);
  rotas.patch('/:id', exigirPapel('A'), controller.editar);
  return rotas;
}

// GET /api/dentistas: qualquer usuário logado (api.md). As rotas /api/dentistas/{id}/... entram nas Tarefas 14 e 16.
export function criarRotasDentistas(contexto: Contexto): Router {
  const controller = criarControllerFuncionarios(contexto);
  const rotas = Router();
  rotas.use(autenticar(contexto));
  rotas.get('/', controller.listarDentistas);
  return rotas;
}
