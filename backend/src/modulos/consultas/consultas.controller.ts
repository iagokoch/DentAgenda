import type { Request, RequestHandler } from 'express';
import type { Contexto } from '../../compartilhado/contexto.ts';
import { naoAutenticado } from '../../compartilhado/erros.ts';
import { esquemaPaginacao } from '../../compartilhado/paginacao.ts';
import { idDaRota, validar } from '../../compartilhado/validacao.ts';
import { cancelarConsulta, remarcarConsulta } from './cancelamento.service.ts';
import { listarConsultas, listarPendentes, verConsulta } from './consulta.service.ts';
import {
  esquemaCancelamento,
  esquemaFiltroDeConsultas,
  esquemaNovaConsultaDaClinica,
  esquemaNovaConsultaDoCliente,
  esquemaObservacao,
  esquemaRemarcacao,
} from './consultas.schemas.ts';
import { criarConsulta } from './criacao.service.ts';
import { gravarObservacao, lerHistoricoDaObservacao } from './observacao.service.ts';
import { realizarConsulta } from './realizacao.service.ts';

const usuarioDe = (req: Request) => {
  if (!req.usuario) throw naoAutenticado();
  return req.usuario;
};

export function criarControllerConsultas(
  contexto: Contexto,
): Record<
  'criar' | 'listar' | 'pendentes' | 'ver' | 'cancelar' | 'remarcar' | 'realizar' | 'gravarObservacao' | 'historicoDaObservacao',
  RequestHandler
> {
  return {
    criar: async (req, res) => {
      const usuario = usuarioDe(req);
      // O paciente vem do token para o cliente e do corpo para a clínica.
      const entrada =
        usuario.tipo === 'CLIENTE'
          ? { ...validar(esquemaNovaConsultaDoCliente, req.body), pacienteId: usuario.clienteId }
          : validar(esquemaNovaConsultaDaClinica, req.body);
      const consulta = await criarConsulta(contexto, usuario, { ...entrada, inicio: new Date(entrada.inicio) });
      res.status(201).json(consulta);
    },
    listar: async (req, res) => {
      res.json(await listarConsultas(contexto, usuarioDe(req), validar(esquemaFiltroDeConsultas, req.query)));
    },
    pendentes: async (req, res) => {
      res.json(await listarPendentes(contexto, usuarioDe(req), validar(esquemaPaginacao, req.query)));
    },
    ver: async (req, res) => {
      res.json(await verConsulta(contexto, usuarioDe(req), idDaRota(req.params.id)));
    },
    cancelar: async (req, res) => {
      const id = idDaRota(req.params.id);
      // O corpo é opcional: sem justificativa o POST vem vazio.
      const { justificativa } = validar(esquemaCancelamento, req.body ?? {});
      res.json(await cancelarConsulta(contexto, usuarioDe(req), id, justificativa));
    },
    remarcar: async (req, res) => {
      const id = idDaRota(req.params.id);
      const entrada = validar(esquemaRemarcacao, req.body);
      res.status(201).json(await remarcarConsulta(contexto, usuarioDe(req), id, { ...entrada, inicio: new Date(entrada.inicio) }));
    },
    realizar: async (req, res) => {
      res.json(await realizarConsulta(contexto, usuarioDe(req), idDaRota(req.params.id)));
    },
    gravarObservacao: async (req, res) => {
      const id = idDaRota(req.params.id);
      const { texto } = validar(esquemaObservacao, req.body);
      res.json(await gravarObservacao(contexto, usuarioDe(req), id, texto));
    },
    historicoDaObservacao: async (req, res) => {
      res.json(await lerHistoricoDaObservacao(contexto, usuarioDe(req), idDaRota(req.params.id)));
    },
  };
}
