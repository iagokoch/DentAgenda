import { Router } from 'express';
import { autenticar, exigirPapel } from '../../compartilhado/autenticacao.ts';
import type { Contexto } from '../../compartilhado/contexto.ts';
import { criarControllerProcedimentos } from './procedimentos.controller.ts';

export function criarRotasProcedimentos(contexto: Contexto): Router {
  const controller = criarControllerProcedimentos(contexto);
  const rotas = Router();
  rotas.use(autenticar(contexto));
  rotas.get('/', controller.listar);
  rotas.post('/', exigirPapel('A'), controller.criar);
  rotas.patch('/:id', exigirPapel('A'), controller.editar);
  return rotas;
}
