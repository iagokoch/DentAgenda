import type { Request, RequestHandler } from 'express';
import type { Contexto } from '../../compartilhado/contexto.ts';
import { naoAutenticado } from '../../compartilhado/erros.ts';
import { idDaRota, validar } from '../../compartilhado/validacao.ts';
import { esquemaEdicaoDeProcedimento, esquemaNovoProcedimento } from './procedimentos.schemas.ts';
import { criarProcedimento, editarProcedimento, listarProcedimentos } from './procedimentos.service.ts';

const usuarioDe = (req: Request) => {
  if (!req.usuario) throw naoAutenticado();
  return req.usuario;
};

export function criarControllerProcedimentos(contexto: Contexto): Record<'listar' | 'criar' | 'editar', RequestHandler> {
  return {
    listar: async (req, res) => {
      res.json(await listarProcedimentos(contexto, usuarioDe(req)));
    },
    criar: async (req, res) => {
      res.status(201).json(await criarProcedimento(contexto, validar(esquemaNovoProcedimento, req.body)));
    },
    editar: async (req, res) => {
      const entrada = validar(esquemaEdicaoDeProcedimento, req.body);
      res.json(await editarProcedimento(contexto, idDaRota(req.params.id), entrada));
    },
  };
}
