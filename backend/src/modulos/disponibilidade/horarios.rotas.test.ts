import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { criarContextoDeTeste } from '../../../testes/contexto-de-teste.ts';
import { criarFuncionario, criarPaciente, criarProcedimento, tokenDe } from '../../../testes/fabricas.ts';
import { criarApp } from '../../app.ts';
import { instanteEmSaoPaulo } from '../../compartilhado/datas.ts';
import type { Funcionario, Procedimento } from '../../generated/prisma/client.ts';

const contexto = criarContextoDeTeste();
const app = criarApp(contexto);
afterAll(() => contexto.prisma.$disconnect());

// Relógio: segunda, 2026-10-05, 07:00 em São Paulo (antes de qualquer horário do dia).
const AGORA = () => instanteEmSaoPaulo('2026-10-05', '07:00');
beforeEach(() => contexto.relogio.definir(AGORA()));

let recepcionista: Funcionario;
let paciente: Awaited<ReturnType<typeof criarPaciente>>;
let limpeza: Procedimento;
beforeAll(async () => {
  recepcionista = await criarFuncionario(contexto);
  paciente = await criarPaciente(contexto);
  limpeza = await criarProcedimento(contexto, { duracaoMinutos: 60 });
});

const com = (token: string) => ({ Authorization: `Bearer ${token}` });
const horarios = (token: string, consulta: string) => request(app).get(`/api/horarios-livres?${consulta}`).set(com(token));
const dias = (token: string, consulta: string) => request(app).get(`/api/dias-disponiveis?${consulta}`).set(com(token));
const doCliente = () => tokenDe(contexto, paciente);
const daRecepcao = () => tokenDe(contexto, recepcionista);

// Dentista novo com grade (diaSemana 1 = segunda).
async function dentistaComGrade(faixas: { diaSemana: number; inicio: string; fim: string }[], extra: { ativo?: boolean } = {}) {
  const dentista = await criarFuncionario(contexto, { categoria: 'DENTISTA', ...extra });
  await contexto.prisma.gradeHorario.createMany({
    data: faixas.map((faixa) => ({
      dentistaId: dentista.id,
      diaSemana: faixa.diaSemana,
      inicio: new Date(`1970-01-01T${faixa.inicio}:00Z`),
      fim: new Date(`1970-01-01T${faixa.fim}:00Z`),
    })),
  });
  return dentista;
}

const SEGUNDA_MANHA = [{ diaSemana: 1, inicio: '08:00', fim: '12:00' }];
const consulta = (dentistaId: string) => `procedimentoId=${limpeza.id}&data=2026-10-05&dentistaId=${dentistaId}`;
const inicios = (corpo: { horarios: { inicio: string }[] }) => corpo.horarios.map((horario) => horario.inicio.slice(11, 16));

async function ocupar(dentistaId: string, de: string, ate: string, status: 'CONFIRMADA' | 'REALIZADA' | 'CANCELADA' = 'CONFIRMADA', data = '2026-10-05') {
  const procedimento = await criarProcedimento(contexto);
  return contexto.prisma.consulta.create({
    data: {
      clienteId: (await criarPaciente(contexto)).id,
      dentistaId,
      procedimentoId: procedimento.id,
      inicio: instanteEmSaoPaulo(data, de),
      fim: instanteEmSaoPaulo(data, ate),
      status,
      criadoEm: contexto.relogio.agora(),
      ...(status === 'CANCELADA'
        ? { canceladoEm: contexto.relogio.agora(), canceladoPor: 'CLINICA' as const, canceladoPorFuncionarioId: recepcionista.id }
        : {}),
    },
  });
}

const bloquear = (dentistaId: string, inicio: string, fim: string) =>
  contexto.prisma.bloqueio.create({ data: { dentistaId, inicio: new Date(inicio), fim: new Date(fim) } });

describe('GET /api/horarios-livres', () => {
  it('cliente recebe só horarios no passo, sem janelasLivres', async () => {
    const dentista = await dentistaComGrade(SEGUNDA_MANHA);

    const resposta = await horarios(doCliente(), consulta(dentista.id));

    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({
      horarios: ['08:00', '09:00', '10:00', '11:00'].map((hora) => ({
        dentistaId: dentista.id,
        inicio: `2026-10-05T${hora}:00-03:00`,
      })),
    });
    expect(resposta.body).not.toHaveProperty('janelasLivres');
  });

  it('recepção recebe horarios e janelasLivres (encaixe fora do passo)', async () => {
    const dentista = await dentistaComGrade(SEGUNDA_MANHA);
    await ocupar(dentista.id, '08:30', '09:00');

    const resposta = await horarios(daRecepcao(), consulta(dentista.id));

    expect(resposta.status).toBe(200);
    expect(inicios(resposta.body)).toEqual(['09:00', '10:00', '11:00']);
    // 08:00–08:30 não comporta 60 min e some; sobra a janela das 09:00 às 12:00.
    expect(resposta.body.janelasLivres).toEqual([
      { dentistaId: dentista.id, inicio: '2026-10-05T09:00:00-03:00', fim: '2026-10-05T12:00:00-03:00' },
    ]);
  });

  it('dentista também recebe janelasLivres', async () => {
    const dentista = await dentistaComGrade(SEGUNDA_MANHA);

    const resposta = await horarios(tokenDe(contexto, dentista), consulta(dentista.id));

    expect(resposta.status).toBe(200);
    expect(resposta.body.janelasLivres).toEqual([
      { dentistaId: dentista.id, inicio: '2026-10-05T08:00:00-03:00', fim: '2026-10-05T12:00:00-03:00' },
    ]);
  });

  it('sem dentistaId junta todos os dentistas ativos; dentista inativo fica de fora', async () => {
    const um = await dentistaComGrade(SEGUNDA_MANHA);
    const outro = await dentistaComGrade([{ diaSemana: 1, inicio: '14:00', fim: '16:00' }]);
    const inativo = await dentistaComGrade(SEGUNDA_MANHA, { ativo: false });

    const resposta = await horarios(doCliente(), `procedimentoId=${limpeza.id}&data=2026-10-05`);

    expect(resposta.status).toBe(200);
    const donos = new Set(resposta.body.horarios.map((horario: { dentistaId: string }) => horario.dentistaId));
    expect(donos.has(um.id)).toBe(true);
    expect(donos.has(outro.id)).toBe(true);
    expect(donos.has(inativo.id)).toBe(false);
    const ordenados = resposta.body.horarios.map((horario: { inicio: string }) => horario.inicio);
    expect(ordenados).toEqual([...ordenados].sort());
  });

  it('dentista sempre recebe só a própria agenda, mesmo pedindo outro id', async () => {
    const meu = await dentistaComGrade(SEGUNDA_MANHA);
    const alheio = await dentistaComGrade([{ diaSemana: 1, inicio: '14:00', fim: '16:00' }]);

    const pedindoOutro = await horarios(tokenDe(contexto, meu), consulta(alheio.id));
    const semPedir = await horarios(tokenDe(contexto, meu), `procedimentoId=${limpeza.id}&data=2026-10-05`);

    for (const resposta of [pedindoOutro, semPedir]) {
      expect(resposta.status).toBe(200);
      expect(new Set(resposta.body.horarios.map((horario: { dentistaId: string }) => horario.dentistaId))).toEqual(new Set([meu.id]));
    }
  });

  it('consulta CONFIRMADA e REALIZADA ocupam; CANCELADA não', async () => {
    const dentista = await dentistaComGrade(SEGUNDA_MANHA);
    await ocupar(dentista.id, '08:00', '09:00', 'CONFIRMADA');
    await ocupar(dentista.id, '09:00', '10:00', 'REALIZADA');
    await ocupar(dentista.id, '10:00', '11:00', 'CANCELADA');

    const resposta = await horarios(doCliente(), consulta(dentista.id));

    expect(inicios(resposta.body)).toEqual(['10:00', '11:00']);
  });

  it('bloqueio tira os horários', async () => {
    const dentista = await dentistaComGrade(SEGUNDA_MANHA);
    await bloquear(dentista.id, '2026-10-05T09:30:00-03:00', '2026-10-05T10:30:00-03:00');

    const resposta = await horarios(doCliente(), consulta(dentista.id));

    expect(inicios(resposta.body)).toEqual(['08:00', '11:00']);
  });

  it('horário que já passou não aparece', async () => {
    const dentista = await dentistaComGrade(SEGUNDA_MANHA);
    contexto.relogio.definir(instanteEmSaoPaulo('2026-10-05', '09:10'));

    const resposta = await horarios(doCliente(), consulta(dentista.id));
    const daClinica = await horarios(daRecepcao(), consulta(dentista.id));

    expect(inicios(resposta.body)).toEqual(['10:00', '11:00']);
    // Encaixe: a janela começa no próximo múltiplo de 5 min depois de agora.
    expect(daClinica.body.janelasLivres).toEqual([
      { dentistaId: dentista.id, inicio: '2026-10-05T09:10:00-03:00', fim: '2026-10-05T12:00:00-03:00' },
    ]);
  });

  it('dia sem grade → listas vazias', async () => {
    const dentista = await dentistaComGrade(SEGUNDA_MANHA);

    const resposta = await horarios(daRecepcao(), `procedimentoId=${limpeza.id}&data=2026-10-06&dentistaId=${dentista.id}`);

    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({ horarios: [], janelasLivres: [] });
  });

  it('a virada de dia no fuso: grade de segunda 20:00–23:00 oferece 22:00 em São Paulo (terça em UTC)', async () => {
    const dentista = await dentistaComGrade([{ diaSemana: 1, inicio: '20:00', fim: '23:00' }]);

    const resposta = await horarios(doCliente(), consulta(dentista.id));

    expect(inicios(resposta.body)).toEqual(['20:00', '21:00', '22:00']);
  });

  it('procedimento inativo ou inexistente → 404; dentistaId inexistente, inativo ou de outro papel → 404', async () => {
    const dentista = await dentistaComGrade(SEGUNDA_MANHA);
    const inativoProc = await criarProcedimento(contexto, { ativo: false });
    const inativo = await dentistaComGrade(SEGUNDA_MANHA, { ativo: false });
    const base = `data=2026-10-05&dentistaId=${dentista.id}`;

    const procInativo = await horarios(daRecepcao(), `procedimentoId=${inativoProc.id}&${base}`);
    const procInexistente = await horarios(daRecepcao(), `procedimentoId=5b0f6a9e-1d4c-4c53-9c1e-0c3a9f6d2b11&${base}`);
    const dentistaInativo = await horarios(doCliente(), consulta(inativo.id));
    const naoDentista = await horarios(doCliente(), consulta(recepcionista.id));

    for (const resposta of [procInativo, procInexistente, dentistaInativo, naoDentista]) {
      expect(resposta.status).toBe(404);
      expect(resposta.body.erro.codigo).toBe('NAO_ENCONTRADO');
    }
  });

  it('parâmetros ausentes ou inválidos → 400; sem login → 401', async () => {
    const semData = await horarios(doCliente(), `procedimentoId=${limpeza.id}`);
    const dataInvalida = await horarios(doCliente(), `procedimentoId=${limpeza.id}&data=2026-13-40`);
    const procMalformado = await horarios(doCliente(), 'procedimentoId=abc&data=2026-10-05');
    const semLogin = await request(app).get(`/api/horarios-livres?procedimentoId=${limpeza.id}&data=2026-10-05`);

    for (const resposta of [semData, dataInvalida, procMalformado]) {
      expect(resposta.status).toBe(400);
      expect(resposta.body.erro.codigo).toBe('ENTRADA_INVALIDA');
    }
    expect(semLogin.status).toBe(401);
  });
});

describe('GET /api/dias-disponiveis', () => {
  const mes = (dentistaId: string) => `procedimentoId=${limpeza.id}&mes=2026-10&dentistaId=${dentistaId}`;

  it('dias-disponiveis de outubro: dia todo bloqueado não aparece; dias já passados também não', async () => {
    const dentista = await dentistaComGrade(SEGUNDA_MANHA);
    await bloquear(dentista.id, '2026-10-12T00:00:00-03:00', '2026-10-13T00:00:00-03:00');

    const resposta = await dias(doCliente(), mes(dentista.id));

    expect(resposta.status).toBe(200);
    // Segundas de outubro: 5 (hoje, 07:00), 12 (bloqueada), 19 e 26.
    expect(resposta.body).toEqual({ dias: ['2026-10-05', '2026-10-19', '2026-10-26'] });
  });

  it('dia lotado por consultas não aparece', async () => {
    const dentista = await dentistaComGrade(SEGUNDA_MANHA);
    await ocupar(dentista.id, '08:00', '12:00', 'CONFIRMADA', '2026-10-19');

    const resposta = await dias(doCliente(), mes(dentista.id));

    expect(resposta.body.dias).toEqual(['2026-10-05', '2026-10-12', '2026-10-26']);
  });

  it('dias-disponiveis: dia só com janela fora do passo aparece para recepção e não para cliente', async () => {
    const dentista = await dentistaComGrade([{ diaSemana: 2, inicio: '08:00', fim: '10:30' }]);
    await ocupar(dentista.id, '08:00', '08:30', 'CONFIRMADA', '2026-10-06');
    await ocupar(dentista.id, '09:30', '10:30', 'CONFIRMADA', '2026-10-06');

    const doCliente_ = await dias(doCliente(), mes(dentista.id));
    const daRecepcao_ = await dias(daRecepcao(), mes(dentista.id));

    expect(doCliente_.body.dias).not.toContain('2026-10-06');
    expect(daRecepcao_.body.dias).toContain('2026-10-06');
  });

  it('sem dentistaId considera todos os dentistas ativos', async () => {
    const dentista = await dentistaComGrade([{ diaSemana: 3, inicio: '08:00', fim: '12:00' }]);
    const inativo = await dentistaComGrade([{ diaSemana: 4, inicio: '08:00', fim: '12:00' }], { ativo: false });

    const resposta = await dias(doCliente(), `procedimentoId=${limpeza.id}&mes=2026-10`);

    expect(resposta.body.dias).toContain('2026-10-07'); // quarta do dentista ativo
    expect(resposta.body.dias).not.toContain('2026-10-08'); // quinta só do inativo (a menos que outro ativo atenda)
    expect(dentista.id).not.toBe(inativo.id);
  });

  it('mes inválido "2026-13" → 400; mes ou procedimentoId ausente → 400', async () => {
    const dentista = await dentistaComGrade(SEGUNDA_MANHA);

    const treze = await dias(doCliente(), `procedimentoId=${limpeza.id}&mes=2026-13&dentistaId=${dentista.id}`);
    const semMes = await dias(doCliente(), `procedimentoId=${limpeza.id}`);
    const semProcedimento = await dias(doCliente(), 'mes=2026-10');

    for (const resposta of [treze, semMes, semProcedimento]) {
      expect(resposta.status).toBe(400);
      expect(resposta.body.erro.codigo).toBe('ENTRADA_INVALIDA');
    }
  });

  it('procedimento inativo → 404; sem login → 401; mês sem grade → lista vazia', async () => {
    const dentista = await dentistaComGrade(SEGUNDA_MANHA);
    const inativoProc = await criarProcedimento(contexto, { ativo: false });

    const inativo = await dias(doCliente(), `procedimentoId=${inativoProc.id}&mes=2026-10`);
    const semLogin = await request(app).get(`/api/dias-disponiveis?procedimentoId=${limpeza.id}&mes=2026-10`);
    const mesPassado = await dias(doCliente(), `procedimentoId=${limpeza.id}&mes=2025-01&dentistaId=${dentista.id}`);

    expect(inativo.status).toBe(404);
    expect(semLogin.status).toBe(401);
    expect(mesPassado.body).toEqual({ dias: [] }); // mês inteiro no passado (janeiro de 2025)
  });
});
