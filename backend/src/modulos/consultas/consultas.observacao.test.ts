import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { criarContextoDeTeste } from '../../../testes/contexto-de-teste.ts';
import { criarConsultaNoBanco, criarFuncionario, criarPaciente, criarProcedimento, tokenDe } from '../../../testes/fabricas.ts';
import { criarApp } from '../../app.ts';
import { instanteEmSaoPaulo } from '../../compartilhado/datas.ts';
import type { Cliente, Funcionario, Procedimento } from '../../generated/prisma/client.ts';

const contexto = criarContextoDeTeste();
const app = criarApp(contexto);
afterAll(() => contexto.prisma.$disconnect());

// Relógio dos testes: segunda, 2026-10-05, 07:00 em São Paulo.
let limpeza: Procedimento;
let recepcionista: Funcionario;
let dentista: Funcionario;
let paciente: Cliente;
beforeAll(async () => {
  limpeza = await criarProcedimento(contexto, { duracaoMinutos: 60 });
  recepcionista = await criarFuncionario(contexto);
});
beforeEach(async () => {
  contexto.relogio.definir(instanteEmSaoPaulo('2026-10-05', '07:00'));
  paciente = await criarPaciente(contexto);
  dentista = await criarFuncionario(contexto, { categoria: 'DENTISTA' });
});

const com = (token: string) => ({ Authorization: `Bearer ${token}` });
const gravar = (token: string, id: string, corpo: object) => request(app).put(`/api/consultas/${id}/observacao`).set(com(token)).send(corpo);
const historico = (token: string, id: string) => request(app).get(`/api/consultas/${id}/observacao/historico`).set(com(token));
const consultaDoPaciente = (status?: 'CONFIRMADA' | 'REALIZADA' | 'CANCELADA') =>
  criarConsultaNoBanco(contexto, {
    clienteId: paciente.id,
    dentistaId: dentista.id,
    procedimentoId: limpeza.id,
    inicio: instanteEmSaoPaulo('2026-10-12', '09:00'),
    ...(status ? { status } : {}),
  });

describe('PUT /api/consultas/{id}/observacao', () => {
  it('dentista grava observacao e uma linha CLINICA no histórico', async () => {
    const consulta = await consultaDoPaciente();

    const resposta = await gravar(await tokenDe(contexto, dentista), consulta.id, { texto: 'Dente 24 – Oclusal. Sem intercorrências.' });

    expect(resposta.status).toBe(200);
    expect(resposta.body.observacao).toBe('Dente 24 – Oclusal. Sem intercorrências.');
    const linhas = await contexto.prisma.historicoObservacao.findMany({ where: { consultaId: consulta.id } });
    expect(linhas).toMatchObject([{ texto: 'Dente 24 – Oclusal. Sem intercorrências.', autor: 'CLINICA', autorFuncionarioId: dentista.id }]);
  });

  it('cliente grava uma linha PACIENTE sem funcionário', async () => {
    const consulta = await consultaDoPaciente();

    const resposta = await gravar(await tokenDe(contexto, paciente), consulta.id, { texto: 'Prefiro atendimento depois das 9h.' });

    expect(resposta.status).toBe(200);
    const linhas = await contexto.prisma.historicoObservacao.findMany({ where: { consultaId: consulta.id } });
    expect(linhas).toMatchObject([{ autor: 'PACIENTE', autorFuncionarioId: null }]);
  });

  it('texto null apaga a observação e grava uma linha com texto null', async () => {
    const consulta = await consultaDoPaciente();
    const token = await tokenDe(contexto, recepcionista);
    await gravar(token, consulta.id, { texto: 'Nota a apagar.' });
    contexto.relogio.avancarMinutos(1);

    const resposta = await gravar(token, consulta.id, { texto: null });

    expect(resposta.status).toBe(200);
    expect(resposta.body.observacao).toBeNull();
    const linhas = await contexto.prisma.historicoObservacao.findMany({ where: { consultaId: consulta.id }, orderBy: { editadoEm: 'asc' } });
    expect(linhas.map((linha) => linha.texto)).toEqual(['Nota a apagar.', null]);
  });

  it('o histórico guarda a versão anterior depois que o paciente sobrescreve', async () => {
    const consulta = await consultaDoPaciente();
    await gravar(await tokenDe(contexto, dentista), consulta.id, { texto: 'Versão da clínica.' });
    contexto.relogio.avancarMinutos(5);

    const resposta = await gravar(await tokenDe(contexto, paciente), consulta.id, { texto: 'Versão do paciente.' });

    expect(resposta.body.observacao).toBe('Versão do paciente.');
    const linhas = await historico(await tokenDe(contexto, recepcionista), consulta.id);
    expect(linhas.body.map((linha: { texto: string }) => linha.texto)).toEqual(['Versão do paciente.', 'Versão da clínica.']);
  });

  it('consulta cancelada ou realizada também aceita observação', async () => {
    const realizada = await consultaDoPaciente('REALIZADA');

    const resposta = await gravar(await tokenDe(contexto, dentista), realizada.id, { texto: 'Orientações pós-atendimento.' });

    expect(resposta.status).toBe(200);
  });

  it('cliente em consulta de outro paciente → 404; dentista de outro → 404', async () => {
    const consulta = await consultaDoPaciente();

    const peloOutroPaciente = await gravar(await tokenDe(contexto, await criarPaciente(contexto)), consulta.id, { texto: 'x' });
    const peloOutroDentista = await gravar(await tokenDe(contexto, await criarFuncionario(contexto, { categoria: 'DENTISTA' })), consulta.id, { texto: 'x' });

    expect(peloOutroPaciente.status).toBe(404);
    expect(peloOutroDentista.status).toBe(404);
  });

  it('texto ausente, vazio ou grande demais → 400 ENTRADA_INVALIDA', async () => {
    const consulta = await consultaDoPaciente();
    const token = await tokenDe(contexto, recepcionista);

    const respostas = await Promise.all([
      gravar(token, consulta.id, {}),
      gravar(token, consulta.id, { texto: '   ' }),
      gravar(token, consulta.id, { texto: 'x'.repeat(2001) }),
    ]);

    expect(respostas.map((resposta) => resposta.status)).toEqual([400, 400, 400]);
    expect(respostas[0]?.body.erro.codigo).toBe('ENTRADA_INVALIDA');
  });
});

describe('GET /api/consultas/{id}/observacao/historico', () => {
  it('mais recente primeiro, com funcionario { id, nome } ou null', async () => {
    const consulta = await consultaDoPaciente();
    await gravar(await tokenDe(contexto, dentista), consulta.id, { texto: 'Primeira.' });
    contexto.relogio.avancarMinutos(1);
    await gravar(await tokenDe(contexto, paciente), consulta.id, { texto: 'Segunda.' });

    const resposta = await historico(await tokenDe(contexto, recepcionista), consulta.id);

    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual([
      { texto: 'Segunda.', autor: 'PACIENTE', funcionario: null, editadoEm: '2026-10-05T07:01:00-03:00' },
      { texto: 'Primeira.', autor: 'CLINICA', funcionario: { id: dentista.id, nome: dentista.nome }, editadoEm: '2026-10-05T07:00:00-03:00' },
    ]);
  });

  it('cliente em consulta de outro → 404; o paciente e o dentista da consulta leem → 200', async () => {
    const consulta = await consultaDoPaciente();

    const alheio = await historico(await tokenDe(contexto, await criarPaciente(contexto)), consulta.id);
    const doPaciente = await historico(await tokenDe(contexto, paciente), consulta.id);
    const doDentista = await historico(await tokenDe(contexto, dentista), consulta.id);

    expect(alheio.status).toBe(404);
    expect(doPaciente.status).toBe(200);
    expect(doDentista.status).toBe(200);
  });
});
