import type { Request, RequestHandler } from 'express';
import type { Contexto } from '../../compartilhado/contexto.ts';
import { naoAutenticado } from '../../compartilhado/erros.ts';
import { idDaRota, validar } from '../../compartilhado/validacao.ts';
import { criarAlerta, listarAlertas, removerAlerta } from './alertas.service.ts';
import { gravarEndereco, removerEndereco } from './endereco.service.ts';
import {
  esquemaBuscaDeAlertas,
  esquemaBuscaDePacientes,
  esquemaEndereco,
  esquemaNovoAlerta,
  esquemaNovoPaciente,
} from './pacientes.schemas.ts';
import { buscarPacientes, cadastrarPaciente, editarPaciente, verPaciente } from './pacientes.service.ts';

const usuarioDe = (req: Request) => {
  if (!req.usuario) throw naoAutenticado();
  return req.usuario;
};

export function criarControllerPacientes(
  contexto: Contexto,
): Record<
  | 'buscar' | 'cadastrar' | 'ver' | 'editar'
  | 'gravarEndereco' | 'removerEndereco' | 'listarAlertas' | 'criarAlerta' | 'removerAlerta',
  RequestHandler
> {
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
    gravarEndereco: async (req, res) => {
      const entrada = validar(esquemaEndereco, req.body);
      res.json(await gravarEndereco(contexto, usuarioDe(req), idDaRota(req.params.id), entrada));
    },
    removerEndereco: async (req, res) => {
      await removerEndereco(contexto, usuarioDe(req), idDaRota(req.params.id));
      res.status(204).end();
    },
    listarAlertas: async (req, res) => {
      const { incluirRemovidos } = validar(esquemaBuscaDeAlertas, req.query);
      res.json(await listarAlertas(contexto, usuarioDe(req), idDaRota(req.params.id), incluirRemovidos === 'true'));
    },
    criarAlerta: async (req, res) => {
      const { texto } = validar(esquemaNovoAlerta, req.body);
      res.status(201).json(await criarAlerta(contexto, usuarioDe(req), idDaRota(req.params.id), texto));
    },
    removerAlerta: async (req, res) => {
      await removerAlerta(contexto, usuarioDe(req), idDaRota(req.params.id), idDaRota(req.params.alertaId));
      res.status(204).end();
    },
  };
}
