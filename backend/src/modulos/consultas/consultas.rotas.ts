import { Router } from 'express';
import { autenticar, exigirPapel } from '../../compartilhado/autenticacao.ts';
import type { Contexto } from '../../compartilhado/contexto.ts';
import { criarControllerConsultas } from './consultas.controller.ts';
import type { ModuloDocumentado } from '../../compartilhado/openapi.ts';
import { esquemaPaginacao } from '../../compartilhado/paginacao.ts';
import { esquemaCancelamento, esquemaFiltroDeConsultas, esquemaNovaConsultaDaClinica, esquemaObservacao, esquemaRemarcacao } from './consultas.schemas.ts';

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

export const rotasDocumentadasConsultas: ModuloDocumentado = {
  prefixo: '/api/consultas',
  tag: 'Consultas',
  rotas: [
    { metodo: 'post', caminho: '/', acesso: ['R', 'D', 'C'], resumo: 'Marca uma consulta (o paciente não envia pacienteId)', corpo: esquemaNovaConsultaDaClinica },
    { metodo: 'get', caminho: '/', acesso: ['R', 'D', 'C'], resumo: 'Lista consultas por período, dentista, paciente ou status', consulta: esquemaFiltroDeConsultas },
    { metodo: 'get', caminho: '/pendentes', acesso: ['R', 'D'], resumo: 'Consultas confirmadas que já terminaram e não foram marcadas como realizadas', consulta: esquemaPaginacao },
    { metodo: 'get', caminho: '/:id', acesso: ['R', 'D', 'C'], resumo: 'Consulta uma consulta' },
    { metodo: 'post', caminho: '/:id/cancelamento', acesso: ['R', 'D', 'C'], resumo: 'Cancela uma consulta', corpo: esquemaCancelamento },
    { metodo: 'post', caminho: '/:id/remarcacao', acesso: ['R', 'D', 'C'], resumo: 'Cancela e cria a nova consulta numa transação só', corpo: esquemaRemarcacao },
    { metodo: 'post', caminho: '/:id/realizacao', acesso: ['R', 'D'], resumo: 'Marca a consulta como realizada' },
    { metodo: 'put', caminho: '/:id/observacao', acesso: ['R', 'D', 'C'], resumo: 'Grava a observação e registra no histórico', corpo: esquemaObservacao },
    { metodo: 'get', caminho: '/:id/observacao/historico', acesso: ['R', 'D', 'C'], resumo: 'Histórico das versões da observação' },
  ],
};
