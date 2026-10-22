import { Router } from 'express';
import { autenticar, exigirPapel } from '../../compartilhado/autenticacao.ts';
import type { Contexto } from '../../compartilhado/contexto.ts';
import { criarControllerProcedimentos } from './procedimentos.controller.ts';
import type { ModuloDocumentado } from '../../compartilhado/openapi.ts';
import { esquemaEdicaoDeProcedimento, esquemaNovoProcedimento } from './procedimentos.schemas.ts';

export function criarRotasProcedimentos(contexto: Contexto): Router {
  const controller = criarControllerProcedimentos(contexto);
  const rotas = Router();
  rotas.use(autenticar(contexto));
  rotas.get('/', controller.listar);
  rotas.post('/', exigirPapel('A'), controller.criar);
  rotas.patch('/:id', exigirPapel('A'), controller.editar);
  return rotas;
}

export const rotasDocumentadasProcedimentos: ModuloDocumentado = {
  prefixo: '/api/procedimentos',
  tag: 'Procedimentos',
  rotas: [
    { metodo: 'get', caminho: '/', acesso: 'logado', resumo: 'Lista os procedimentos (paciente vê só os ativos)' },
    { metodo: 'post', caminho: '/', acesso: ['A'], resumo: 'Cadastra um procedimento', corpo: esquemaNovoProcedimento },
    { metodo: 'patch', caminho: '/:id', acesso: ['A'], resumo: 'Edita um procedimento (inclui ativar e desativar)', corpo: esquemaEdicaoDeProcedimento },
  ],
};
