import type { Request, RequestHandler } from 'express';
import type { Contexto } from '../../compartilhado/contexto.ts';
import { naoAutenticado, naoEncontrado } from '../../compartilhado/erros.ts';
import { idDaRota, validar } from '../../compartilhado/validacao.ts';
import { criarBloqueios, listarBloqueios, removerBloqueio } from './bloqueios.service.ts';
import {
  esquemaDiasDisponiveis,
  esquemaGrade,
  esquemaHorariosLivres,
  esquemaNovoBloqueio,
  esquemaPeriodo,
} from './disponibilidade.schemas.ts';
import { exigirDentista, lerGrade, substituirGrade } from './grade.service.ts';
import { diasDisponiveis, horariosLivres } from './horarios.service.ts';

const usuarioDe = (req: Request) => {
  if (!req.usuario) throw naoAutenticado();
  return req.usuario;
};

// D10: dentista só enxerga a própria agenda; a de um colega responde como inexistente (D20).
function conferirAgendaDoDentista(req: Request, dentistaId: string): void {
  const usuario = usuarioDe(req);
  if (usuario.tipo === 'FUNCIONARIO' && usuario.categoria === 'DENTISTA' && usuario.funcionarioId !== dentistaId) {
    throw naoEncontrado();
  }
}

export function criarControllerDisponibilidade(
  contexto: Contexto,
): Record<
  'lerGrade' | 'gravarGrade' | 'listarBloqueios' | 'criarBloqueios' | 'removerBloqueio' | 'horariosLivres' | 'diasDisponiveis',
  RequestHandler
> {
  return {
    lerGrade: async (req, res) => {
      const id = idDaRota(req.params.id);
      conferirAgendaDoDentista(req, id);
      await exigirDentista(contexto, id);
      res.json(await lerGrade(contexto, id));
    },
    gravarGrade: async (req, res) => {
      const id = idDaRota(req.params.id);
      const faixas = validar(esquemaGrade, req.body);
      await exigirDentista(contexto, id);
      res.json(await substituirGrade(contexto, id, faixas));
    },
    listarBloqueios: async (req, res) => {
      const id = idDaRota(req.params.id);
      conferirAgendaDoDentista(req, id);
      const periodo = validar(esquemaPeriodo, req.query);
      await exigirDentista(contexto, id);
      res.json(await listarBloqueios(contexto, id, periodo));
    },
    criarBloqueios: async (req, res) => {
      const entrada = validar(esquemaNovoBloqueio, req.body);
      res.status(201).json(await criarBloqueios(contexto, usuarioDe(req), entrada));
    },
    horariosLivres: async (req, res) => {
      res.json(await horariosLivres(contexto, usuarioDe(req), validar(esquemaHorariosLivres, req.query)));
    },
    diasDisponiveis: async (req, res) => {
      res.json(await diasDisponiveis(contexto, usuarioDe(req), validar(esquemaDiasDisponiveis, req.query)));
    },
    removerBloqueio: async (req, res) => {
      await removerBloqueio(contexto, usuarioDe(req), idDaRota(req.params.id));
      res.status(204).end();
    },
  };
}
