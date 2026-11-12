import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { criarContextoDeTeste } from '../../testes/contexto-de-teste.ts';
import { criarConsultaNoBanco, criarFuncionario, criarPaciente, criarProcedimento, tokenDe } from '../../testes/fabricas.ts';
import { criarApp } from '../app.ts';
import { instanteEmSaoPaulo } from '../compartilhado/datas.ts';
import type { Cliente, Funcionario, Procedimento } from '../generated/prisma/client.ts';

const contexto = criarContextoDeTeste();
const app = criarApp(contexto);
const com = (token: string) => ({ Authorization: `Bearer ${token}` });
const inicio = (hora: string) => `2026-10-12T${hora}:00-03:00`;
let recepcionista: Funcionario;
let procedimento: Procedimento;
let paciente: Cliente;

beforeAll(async () => {
  recepcionista = await criarFuncionario(contexto, { isAdmin: true });
  procedimento = await criarProcedimento(contexto, { duracaoMinutos: 60 });
});

beforeEach(async () => {
  contexto.relogio.definir(instanteEmSaoPaulo('2026-10-05', '07:00'));
  paciente = await criarPaciente(contexto);
});

afterAll(() => contexto.prisma.$disconnect());

async function criarDentistaComGrade() {
  const dentista = await criarFuncionario(contexto, { categoria: 'DENTISTA' });
  await contexto.prisma.gradeHorario.create({
    data: {
      dentistaId: dentista.id,
      diaSemana: 1,
      inicio: new Date('1970-01-01T08:00:00Z'),
      fim: new Date('1970-01-01T12:00:00Z'),
    },
  });
  return dentista;
}

async function criarOriginal(dentistaId: string) {
  return criarConsultaNoBanco(contexto, {
    clienteId: paciente.id,
    dentistaId,
    procedimentoId: procedimento.id,
    inicio: new Date(inicio('09:00')),
  });
}

describe('Break-It: concorrência preserva transições e exclusão de horários', () => {
  it.each([1, 2, 3])('duas remarcações da mesma original criam somente uma sucessora (rodada %i)', async () => {
    const dentista = await criarDentistaComGrade();
    const original = await criarOriginal(dentista.id);
    const token = await tokenDe(contexto, recepcionista);

    const respostas = await Promise.all(['10:00', '11:00'].map((hora) => request(app)
      .post(`/api/consultas/${original.id}/remarcacao`).set(com(token)).send({ inicio: inicio(hora) })));

    expect(respostas.map((resposta) => resposta.status).sort()).toEqual([201, 422]);
    const recusada = respostas.find((resposta) => resposta.status === 422)!;
    expect(recusada.body.erro.codigo).toBe('CONSULTA_NAO_CANCELAVEL');
    const consultas = await contexto.prisma.consulta.findMany({ where: { clienteId: paciente.id } });
    expect(consultas).toHaveLength(2);
    expect(consultas.find((consulta) => consulta.id === original.id)?.status).toBe('CANCELADA');
    const sucessoras = consultas.filter((consulta) => consulta.status === 'CONFIRMADA');
    expect(sucessoras).toHaveLength(1);
    const aceita = respostas.find((resposta) => resposta.status === 201)!;
    expect(sucessoras[0]?.id).toBe(aceita.body.nova.id);
    expect(sucessoras[0]?.inicio.toISOString()).toBe(new Date(aceita.body.nova.inicio).toISOString());
  });

  it.each([1, 2, 3])('cancelamento contra remarcação confirma somente uma transição da original (rodada %i)', async () => {
    const dentista = await criarDentistaComGrade();
    const original = await criarOriginal(dentista.id);
    const token = await tokenDe(contexto, recepcionista);

    const [cancelamento, remarcacao] = await Promise.all([
      request(app).post(`/api/consultas/${original.id}/cancelamento`).set(com(token)).send({}),
      request(app).post(`/api/consultas/${original.id}/remarcacao`).set(com(token)).send({ inicio: inicio('10:00') }),
    ]);

    const remarcou = remarcacao.status === 201;
    expect([cancelamento.status, remarcacao.status]).toEqual(remarcou ? [422, 201] : [200, 422]);
    const recusada = remarcou ? cancelamento : remarcacao;
    expect(recusada.body.erro.codigo).toBe('CONSULTA_NAO_CANCELAVEL');
    const consultas = await contexto.prisma.consulta.findMany({ where: { clienteId: paciente.id } });
    expect(consultas.find((consulta) => consulta.id === original.id)?.status).toBe('CANCELADA');
    expect(consultas).toHaveLength(remarcou ? 2 : 1);
    expect(consultas.filter((consulta) => consulta.status === 'CONFIRMADA')).toHaveLength(remarcou ? 1 : 0);
  });

  it.each([1, 2, 3])('paciente em dois dentistas simultâneos mantém apenas uma reserva sobreposta (rodada %i)', async () => {
    const dentistas = await Promise.all([criarDentistaComGrade(), criarDentistaComGrade()]);
    const token = await tokenDe(contexto, paciente);

    const respostas = await Promise.all(dentistas.map((dentista) => request(app)
      .post('/api/consultas').set(com(token)).send({
        dentistaId: dentista.id, procedimentoId: procedimento.id, inicio: inicio('09:00'),
      })));

    expect(respostas.map((resposta) => resposta.status).sort()).toEqual([201, 409]);
    expect(respostas.find((resposta) => resposta.status === 409)!.body.erro.codigo)
      .toBe('PACIENTE_COM_CONSULTA_NO_HORARIO');
    const consultas = await contexto.prisma.consulta.findMany({ where: { clienteId: paciente.id, status: 'CONFIRMADA' } });
    expect(consultas).toHaveLength(1);
    expect(consultas[0]?.id).toBe(respostas.find((resposta) => resposta.status === 201)!.body.id);
  });
});

describe('Break-It: entradas extremas não viram erros internos', () => {
  it('paginação cujo deslocamento excede inteiro seguro recebe lista ou erro de entrada', async () => {
    const token = await tokenDe(contexto, recepcionista);
    const resposta = await request(app).get('/api/pacientes').set(com(token))
      .query({ pagina: Number.MAX_SAFE_INTEGER, porPagina: 100 });

    console.info(`Break-It paginação extrema: HTTP=${resposta.status}, codigo=${resposta.body.erro?.codigo ?? 'sucesso'}`);
    expect([200, 400]).toContain(resposta.status);
    if (resposta.status === 200) expect(resposta.body.itens).toEqual([]);
    else expect(resposta.body.erro.codigo).toBe('ENTRADA_INVALIDA');
  });

  it('último dia do ano 9999 no limite inclusivo recebe lista ou erro de entrada', async () => {
    const token = await tokenDe(contexto, recepcionista);
    const resposta = await request(app).get('/api/consultas').set(com(token))
      .query({ de: '9999-12-31', ate: '9999-12-31' });

    console.info(`Break-It data extrema: HTTP=${resposta.status}, codigo=${resposta.body.erro?.codigo ?? 'sucesso'}`);
    expect([200, 400]).toContain(resposta.status);
    if (resposta.status === 200) expect(resposta.body.itens).toEqual([]);
    else expect(resposta.body.erro.codigo).toBe('ENTRADA_INVALIDA');
  });
});
