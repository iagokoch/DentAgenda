import { Router } from 'express';
import type { Contexto } from '../../compartilhado/contexto.ts';
import { criarControllerAuth } from './auth.controller.ts';

export function criarRotasAuth(contexto: Contexto): Router {
  const controller = criarControllerAuth(contexto);
  const rotas = Router();
  rotas.post('/cliente/login', controller.loginCliente);
  rotas.post('/funcionario/login', controller.loginFuncionario);
  return rotas;
}
