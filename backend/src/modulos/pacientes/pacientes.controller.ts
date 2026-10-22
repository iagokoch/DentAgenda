import type { Request, RequestHandler } from 'express';
import type { Contexto } from '../../compartilhado/contexto.ts';
import { naoAutenticado } from '../../compartilhado/erros.ts';
import { idDaRota, validar } from '../../compartilhado/validacao.ts';
import { esquemaBuscaDePacientes, esquemaNovoPaciente } from './pacientes.schemas.ts';
import { buscarPacientes, cadastrarPaciente, editarPaciente, verPaciente } from './pacientes.service.ts';

const usuarioDe = (req: Request) => {
  if (!req.usuario) throw naoAutenticado();
  return req.usuario;
};

export function criarControllerPacientes(
  contexto: Contexto,
): Record<'buscar' | 'cadastrar' | 'ver' | 'editar', RequestHandler> {
  return {
    buscar: async (req, res) => {
      const { busca, pagina, porPagina } = validar(esquemaBuscaDePacientes, req.query);
      res.json(await buscarPacientes(contexto, busca, pagina, porPagina));
    },
    cadastrar: async (req, res) => {
      res.status(201).json(await cadastrarPaciente(contexto, validar(esquemaNovoPaciente, req.body)));
    },
    ver: async (req, res) => {
      res.json(await verPaciente(contexto, usuarioDe(req), idDaRota(req.params.id)));
    },
    editar: async (req, res) => {
      res.json(await editarPaciente(contexto, usuarioDe(req), idDaRota(req.params.id), req.body));
    },
  };
}
