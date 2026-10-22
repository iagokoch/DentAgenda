import type { Request, RequestHandler } from 'express';
import type { Contexto } from '../../compartilhado/contexto.ts';
import { naoAutenticado, naoEncontrado } from '../../compartilhado/erros.ts';
import { idDaRota, validar } from '../../compartilhado/validacao.ts';
import { esquemaGrade } from './disponibilidade.schemas.ts';
import { exigirDentista, lerGrade, substituirGrade } from './grade.service.ts';

const usuarioDe = (req: Request) => {
  if (!req.usuario) throw naoAutenticado();
  return req.usuario;
};

export function criarControllerDisponibilidade(contexto: Contexto): Record<'lerGrade' | 'gravarGrade', RequestHandler> {
  return {
    lerGrade: async (req, res) => {
      const usuario = usuarioDe(req);
      const id = idDaRota(req.params.id);
      // D10: dentista só enxerga a própria grade; a de um colega responde como inexistente (D20).
      if (usuario.tipo === 'FUNCIONARIO' && usuario.categoria === 'DENTISTA' && usuario.funcionarioId !== id) {
        throw naoEncontrado();
      }
      await exigirDentista(contexto, id);
      res.json(await lerGrade(contexto, id));
    },
    gravarGrade: async (req, res) => {
      const id = idDaRota(req.params.id);
      const faixas = validar(esquemaGrade, req.body);
      await exigirDentista(contexto, id);
      res.json(await substituirGrade(contexto, id, faixas));
    },
  };
}
