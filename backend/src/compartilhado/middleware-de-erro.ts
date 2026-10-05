import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { Logger } from 'pino';
import * as z from 'zod';
import { ErroDeNegocio, naoEncontrado } from './erros.ts';
import { violacaoDoBanco } from './erros-do-banco.ts';

type RespostaDeErro = { status: number; corpo: { codigo: string; mensagem: string } & Record<string, unknown> };

// D23: a exclusion constraint violada escolhe o código do 409.
const CONFLITOS_DE_HORARIO: Record<string, RespostaDeErro> = {
  consulta_dentista_sem_sobreposicao: {
    status: 409,
    corpo: { codigo: 'HORARIO_INDISPONIVEL', mensagem: 'Horário indisponível. Escolha outro horário.' },
  },
  consulta_paciente_sem_sobreposicao: {
    status: 409,
    corpo: { codigo: 'PACIENTE_COM_CONSULTA_NO_HORARIO', mensagem: 'O paciente já tem uma consulta nesse horário.' },
  },
};

const ERRO_INTERNO: RespostaDeErro = {
  status: 500,
  corpo: { codigo: 'ERRO_INTERNO', mensagem: 'Erro inesperado. Tente novamente.' },
};

export const rotaInexistente: RequestHandler = (_req, _res, next) => next(naoEncontrado());

export function criarMiddlewareDeErro(logger: Logger): ErrorRequestHandler {
  return (erro, _req, res, _next) => {
    const resposta = traduzirErro(erro);
    if (resposta.status >= 500) logger.error({ err: erro }, 'erro inesperado');
    res.status(resposta.status).json({ erro: resposta.corpo });
  };
}

function traduzirErro(erro: unknown): RespostaDeErro {
  if (erro instanceof ErroDeNegocio) {
    return { status: erro.status, corpo: { codigo: erro.codigo, mensagem: erro.message, ...erro.detalhes } };
  }
  if (erro instanceof z.ZodError) {
    const campos = erro.issues.map((problema) => ({ caminho: problema.path.join('.'), mensagem: problema.message }));
    return entradaInvalida(campos);
  }
  if (jsonMalformado(erro)) return entradaInvalida([]);
  const violacao = violacaoDoBanco(erro);
  if (violacao?.codigoSql === '23P01' && violacao.restricao) {
    return CONFLITOS_DE_HORARIO[violacao.restricao] ?? ERRO_INTERNO;
  }
  return ERRO_INTERNO;
}

function entradaInvalida(campos: { caminho: string; mensagem: string }[]): RespostaDeErro {
  return { status: 400, corpo: { codigo: 'ENTRADA_INVALIDA', mensagem: 'Dados inválidos.', campos } };
}

// Erro do express.json() quando o corpo não é JSON válido.
function jsonMalformado(erro: unknown): boolean {
  return typeof erro === 'object' && erro !== null && 'type' in erro && erro.type === 'entity.parse.failed';
}
