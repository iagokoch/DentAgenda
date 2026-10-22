import { Router } from 'express';
import { autenticar, exigirPapel } from '../../compartilhado/autenticacao.ts';
import type { Contexto } from '../../compartilhado/contexto.ts';
import { criarControllerFuncionarios } from './funcionarios.controller.ts';
import type { ModuloDocumentado } from '../../compartilhado/openapi.ts';
import { esquemaEdicaoDeFuncionario, esquemaNovoFuncionario } from './funcionarios.schemas.ts';

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

export const rotasDocumentadasFuncionarios: ModuloDocumentado = {
  prefixo: '/api/funcionarios',
  tag: 'Funcionários',
  rotas: [
    { metodo: 'get', caminho: '/', acesso: ['A'], resumo: 'Lista os funcionários' },
    { metodo: 'post', caminho: '/', acesso: ['A'], resumo: 'Cadastra um funcionário', corpo: esquemaNovoFuncionario },
    { metodo: 'patch', caminho: '/:id', acesso: ['A'], resumo: 'Edita um funcionário (inclui ativar e desativar)', corpo: esquemaEdicaoDeFuncionario },
  ],
};

export const rotasDocumentadasDentistas: ModuloDocumentado = {
  prefixo: '/api/dentistas',
  tag: 'Funcionários',
  rotas: [{ metodo: 'get', caminho: '/', acesso: 'logado', resumo: 'Lista os dentistas ativos' }],
};
