import type { RequestHandler } from 'express';
import type { Contexto } from '../../compartilhado/contexto.ts';
import { idDaRota, validar } from '../../compartilhado/validacao.ts';
import { esquemaEdicaoDeFuncionario, esquemaNovoFuncionario } from './funcionarios.schemas.ts';
import { criarFuncionario, editarFuncionario, listarDentistas, listarFuncionarios } from './funcionarios.service.ts';

export function criarControllerFuncionarios(
  contexto: Contexto,
): Record<'listar' | 'criar' | 'editar' | 'listarDentistas', RequestHandler> {
  return {
    listar: async (_req, res) => {
      res.json(await listarFuncionarios(contexto));
    },
    criar: async (req, res) => {
      res.status(201).json(await criarFuncionario(contexto, validar(esquemaNovoFuncionario, req.body)));
    },
    editar: async (req, res) => {
      const entrada = validar(esquemaEdicaoDeFuncionario, req.body);
      res.json(await editarFuncionario(contexto, idDaRota(req.params.id), entrada));
    },
    listarDentistas: async (_req, res) => {
      res.json(await listarDentistas(contexto));
    },
  };
}
