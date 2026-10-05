import express from 'express';
import request from 'supertest';
import * as z from 'zod';
import { afterAll, describe, expect, it } from 'vitest';
import { criarContextoDeTeste } from '../../testes/contexto-de-teste.ts';
import { criarApp } from '../app.ts';
import { ErroDeNegocio } from './erros.ts';
import { criarMiddlewareDeErro } from './middleware-de-erro.ts';
import { validar } from './validacao.ts';

const contexto = criarContextoDeTeste();
afterAll(() => contexto.prisma.$disconnect());

const inicio = new Date('2026-10-05T11:00:00Z');
const fim = new Date('2026-10-05T12:00:00Z');
let sequencia = 0;
const proximoCpf = () => String(++sequencia).padStart(11, '0');

function criarCliente() {
  return contexto.prisma.cliente.create({
    data: { nome: 'Paciente', cpf: proximoCpf(), telefone: '47999990000', criadoEm: inicio, pacienteDesde: inicio },
  });
}

function criarDentista() {
  const cpf = proximoCpf();
  return contexto.prisma.funcionario.create({
    data: {
      nome: 'Dentista',
      cpf,
      email: `${cpf}@colzani.com.br`,
      senhaHash: 'x'.repeat(60),
      categoria: 'DENTISTA',
      cro: `CRO-${cpf}`,
      dataInicio: inicio,
    },
  });
}

async function inserirConsultasSobrepostas(mesmo: 'dentista' | 'paciente'): Promise<void> {
  const [paciente, outroPaciente, dentista, outroDentista, procedimento] = await Promise.all([
    criarCliente(),
    criarCliente(),
    criarDentista(),
    criarDentista(),
    contexto.prisma.procedimento.create({ data: { nome: `Limpeza ${++sequencia}`, duracaoMinutos: 60, precoCentavos: 0 } }),
  ]);
  const base = { inicio, fim, status: 'CONFIRMADA' as const, criadoEm: inicio, procedimentoId: procedimento.id };
  await contexto.prisma.consulta.create({ data: { ...base, clienteId: paciente.id, dentistaId: dentista.id } });
  const segunda =
    mesmo === 'dentista'
      ? { clienteId: outroPaciente.id, dentistaId: dentista.id }
      : { clienteId: paciente.id, dentistaId: outroDentista.id };
  await contexto.prisma.consulta.create({ data: { ...base, ...segunda } });
}

const appDeTeste = express();
appDeTeste.use(express.json());
appDeTeste.get('/negocio', () => {
  throw new ErroDeNegocio(422, 'X', 'Regra violada.', { consultas: [] });
});
appDeTeste.post('/validacao', (req) => {
  validar(z.object({ endereco: z.object({ cep: z.string().length(8) }) }), req.body);
});
appDeTeste.post('/eco', (req, res) => {
  res.json(req.body);
});
appDeTeste.post('/sobreposicao/:mesmo', async (req) => {
  await inserirConsultasSobrepostas(req.params.mesmo === 'dentista' ? 'dentista' : 'paciente');
});
appDeTeste.get('/inesperado', () => {
  throw new Error('detalhe interno que não pode vazar');
});
appDeTeste.use(criarMiddlewareDeErro(contexto.logger));

describe('middleware de erro', () => {
  it('ErroDeNegocio vira status e codigo', async () => {
    const resposta = await request(appDeTeste).get('/negocio');

    expect(resposta.status).toBe(422);
    expect(resposta.body).toEqual({ erro: { codigo: 'X', mensagem: 'Regra violada.', consultas: [] } });
  });

  it('erro do Zod vira 400 ENTRADA_INVALIDA com campos', async () => {
    const resposta = await request(appDeTeste).post('/validacao').send({ endereco: { cep: '123' } });

    expect(resposta.status).toBe(400);
    expect(resposta.body.erro.codigo).toBe('ENTRADA_INVALIDA');
    expect(resposta.body.erro.campos).toEqual([{ caminho: 'endereco.cep', mensagem: expect.any(String) }]);
  });

  it('JSON malformado vira 400 ENTRADA_INVALIDA', async () => {
    const resposta = await request(appDeTeste).post('/eco').set('Content-Type', 'application/json').send('{"cpf": ');

    expect(resposta.status).toBe(400);
    expect(resposta.body.erro.codigo).toBe('ENTRADA_INVALIDA');
  });

  it('violação de sobreposição do dentista vira 409 HORARIO_INDISPONIVEL', async () => {
    const resposta = await request(appDeTeste).post('/sobreposicao/dentista');

    expect(resposta.status).toBe(409);
    expect(resposta.body.erro.codigo).toBe('HORARIO_INDISPONIVEL');
  });

  it('violação de sobreposição do paciente vira 409 PACIENTE_COM_CONSULTA_NO_HORARIO', async () => {
    const resposta = await request(appDeTeste).post('/sobreposicao/paciente');

    expect(resposta.status).toBe(409);
    expect(resposta.body.erro.codigo).toBe('PACIENTE_COM_CONSULTA_NO_HORARIO');
  });

  it('erro inesperado vira 500 ERRO_INTERNO sem stack na resposta', async () => {
    const resposta = await request(appDeTeste).get('/inesperado');

    expect(resposta.status).toBe(500);
    expect(resposta.body.erro.codigo).toBe('ERRO_INTERNO');
    expect(resposta.text).not.toContain('detalhe interno');
    expect(resposta.text).not.toContain('at ');
  });

  it('rota inexistente vira 404 NAO_ENCONTRADO', async () => {
    const resposta = await request(criarApp(contexto)).get('/api/nada');

    expect(resposta.status).toBe(404);
    expect(resposta.body.erro.codigo).toBe('NAO_ENCONTRADO');
  });
});
