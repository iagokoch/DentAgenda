import { Router } from 'express';
import { autenticar, exigirPapel } from '../../compartilhado/autenticacao.ts';
import type { Contexto } from '../../compartilhado/contexto.ts';
import { criarControllerDisponibilidade } from './disponibilidade.controller.ts';
import type { ModuloDocumentado } from '../../compartilhado/openapi.ts';
import { esquemaDiasDisponiveis, esquemaGrade, esquemaHorariosLivres, esquemaNovoBloqueio, esquemaPeriodo } from './disponibilidade.schemas.ts';

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

export const rotasDocumentadasDisponibilidade: ModuloDocumentado = {
  prefixo: '/api/dentistas',
  tag: 'Disponibilidade',
  rotas: [
    { metodo: 'get', caminho: '/:id/grade', acesso: ['R', 'A', 'D'], resumo: 'Lê a grade semanal do dentista' },
    { metodo: 'put', caminho: '/:id/grade', acesso: ['A'], resumo: 'Substitui a grade semanal do dentista', corpo: esquemaGrade },
    { metodo: 'get', caminho: '/:id/bloqueios', acesso: ['R', 'D'], resumo: 'Lista os bloqueios do dentista em um período', consulta: esquemaPeriodo },
  ],
};

export const rotasDocumentadasBloqueios: ModuloDocumentado = {
  prefixo: '/api/bloqueios',
  tag: 'Disponibilidade',
  rotas: [
    { metodo: 'post', caminho: '/', acesso: ['R', 'D'], resumo: 'Cria um bloqueio de agenda', corpo: esquemaNovoBloqueio },
    { metodo: 'delete', caminho: '/:id', acesso: ['R', 'D'], resumo: 'Remove um bloqueio' },
  ],
};

export const rotasDocumentadasHorarios: ModuloDocumentado = {
  prefixo: '/api',
  tag: 'Disponibilidade',
  rotas: [
    { metodo: 'get', caminho: '/horarios-livres', acesso: ['R', 'D', 'C'], resumo: 'Horários livres de um dia', consulta: esquemaHorariosLivres },
    { metodo: 'get', caminho: '/dias-disponiveis', acesso: ['R', 'D', 'C'], resumo: 'Dias do mês com pelo menos um horário livre', consulta: esquemaDiasDisponiveis },
  ],
};
