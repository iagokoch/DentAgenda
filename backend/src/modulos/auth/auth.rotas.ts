import { Router } from 'express';
import { autenticar } from '../../compartilhado/autenticacao.ts';
import type { Contexto } from '../../compartilhado/contexto.ts';
import { criarControllerAuth } from './auth.controller.ts';

export function criarRotasAuth(contexto: Contexto): Router {
  const controller = criarControllerAuth(contexto);
  const rotas = Router();
  rotas.post('/cliente/login', controller.loginCliente);
  rotas.post('/funcionario/login', controller.loginFuncionario);
  rotas.post('/refresh', controller.renovar);
  rotas.post('/logout', autenticar(contexto), controller.sair);
  rotas.get('/eu', autenticar(contexto), controller.eu);
  return rotas;
}
