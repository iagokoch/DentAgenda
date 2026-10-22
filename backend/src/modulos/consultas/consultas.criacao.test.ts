import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { criarContextoDeTeste } from '../../../testes/contexto-de-teste.ts';
import { criarFuncionario, criarPaciente, criarProcedimento, tokenDe } from '../../../testes/fabricas.ts';
import { criarApp } from '../../app.ts';
import { instanteEmSaoPaulo } from '../../compartilhado/datas.ts';
import type { Cliente, Funcionario, Procedimento } from '../../generated/prisma/client.ts';

const contexto = criarContextoDeTeste();
const app = criarApp(contexto);
afterAll(() => contexto.prisma.$disconnect());

// Relógio dos testes: segunda, 2026-10-05, 07:00 em São Paulo. Grade padrão: segunda 08:00–12:00. Limpeza: 60 min.
const AGORA = () => instanteEmSaoPaulo('2026-10-05', '07:00');

let recepcionista: Funcionario;
let paciente: Cliente;
let limpeza: Procedimento;
beforeAll(async () => {
  recepcionista = await criarFuncionario(contexto);
  limpeza = await criarProcedimento(contexto, { duracaoMinutos: 60 });
});
// Paciente novo a cada teste: o mesmo paciente às 09:00 em outro teste cairia em PACIENTE_COM_CONSULTA_NO_HORARIO.
beforeEach(async () => {
  contexto.relogio.definir(AGORA());
  paciente = await criarPaciente(contexto);
});

const tempo = (hora: string) => new Date(`1970-01-01T${hora}:00Z`);

async function dentistaComGrade(faixas: { diaSemana: number; inicio: string; fim: string }[] = [{ diaSemana: 1, inicio: '08:00', fim: '12:00' }], extra: { ativo?: boolean } = {}) {
  const dentista = await criarFuncionario(contexto, { categoria: 'DENTISTA', ...extra });
  await contexto.prisma.gradeHorario.createMany({
    data: faixas.map((faixa) => ({ dentistaId: dentista.id, diaSemana: faixa.diaSemana, inicio: tempo(faixa.inicio), fim: tempo(faixa.fim) })),
  });
  return dentista;
}

const com = (token: string) => ({ Authorization: `Bearer ${token}` });
const marcar = (token: string, corpo: object) => request(app).post('/api/consultas').set(com(token)).send(corpo);
const dia = (hora: string) => `2026-10-05T${hora}:00-03:00`;

describe('POST /api/consultas', () => {
  it('cliente marca às 09:00 → 201 CONFIRMADA, fim 10:00, no formato D24.3', async () => {
    const dentista = await dentistaComGrade();

    const resposta = await marcar(await tokenDe(contexto, paciente), { dentistaId: dentista.id, procedimentoId: limpeza.id, inicio: dia('09:00') });

    expect(resposta.status).toBe(201);
    expect(resposta.body).toEqual({
      id: expect.any(String),
      paciente: { id: paciente.id, nome: paciente.nome },
      dentista: { id: dentista.id, nome: dentista.nome },
      procedimento: { id: limpeza.id, nome: limpeza.nome },
      inicio: '2026-10-05T09:00:00-03:00',
      fim: '2026-10-05T10:00:00-03:00',
      status: 'CONFIRMADA',
      observacao: null,
      criadoEm: '2026-10-05T07:00:00-03:00',
      canceladoEm: null,
      canceladoPor: null,
      justificativa: null,
    });
  });

  it('cliente não envia pacienteId: vem do token e um pacienteId de outro é ignorado', async () => {
    const dentista = await dentistaComGrade();
    const outro = await criarPaciente(contexto);

    const resposta = await marcar(await tokenDe(contexto, paciente), {
      pacienteId: outro.id,
      dentistaId: dentista.id,
      procedimentoId: limpeza.id,
      inicio: dia('09:00'),
    });

    expect(resposta.status).toBe(201);
    expect(resposta.body.paciente.id).toBe(paciente.id);
  });

  it('recepção sem pacienteId → 400 ENTRADA_INVALIDA', async () => {
    const dentista = await dentistaComGrade();

    const resposta = await marcar(await tokenDe(contexto, recepcionista), { dentistaId: dentista.id, procedimentoId: limpeza.id, inicio: dia('09:00') });

    expect(resposta.status).toBe(400);
    expect(resposta.body.erro.codigo).toBe('ENTRADA_INVALIDA');
  });

  it('sem token → 401', async () => {
    const resposta = await request(app).post('/api/consultas').send({});

    expect(resposta.status).toBe(401);
  });

  it('cliente às 09:30 → 409 FORA_DO_PASSO', async () => {
    const dentista = await dentistaComGrade();

    const resposta = await marcar(await tokenDe(contexto, paciente), { dentistaId: dentista.id, procedimentoId: limpeza.id, inicio: dia('09:30') });

    expect(resposta.status).toBe(409);
    expect(resposta.body.erro.codigo).toBe('FORA_DO_PASSO');
  });

  it('cliente às 11:30 (passa das 12:00) → 409 FORA_DA_GRADE', async () => {
    const dentista = await dentistaComGrade();

    const resposta = await marcar(await tokenDe(contexto, paciente), { dentistaId: dentista.id, procedimentoId: limpeza.id, inicio: dia('11:30') });

    expect(resposta.status).toBe(409);
    expect(resposta.body.erro.codigo).toBe('FORA_DA_GRADE');
  });

  it('recepção encaixa às 09:35 → 201; às 09:37 → 409 FORA_DOS_5_MINUTOS', async () => {
    const dentista = await dentistaComGrade();
    const token = await tokenDe(contexto, recepcionista);
    const corpo = { pacienteId: paciente.id, dentistaId: dentista.id, procedimentoId: limpeza.id };

    const encaixe = await marcar(token, { ...corpo, inicio: dia('09:35') });
    const quebrado = await marcar(token, { ...corpo, inicio: dia('10:37') });

    expect(encaixe.status).toBe(201);
    expect(quebrado.status).toBe(409);
    expect(quebrado.body.erro.codigo).toBe('FORA_DOS_5_MINUTOS');
  });

  it('dentista encaixa na própria agenda → 201; na de outro dentista → 404', async () => {
    const dentista = await dentistaComGrade();
    const colega = await dentistaComGrade();
    const token = await tokenDe(contexto, dentista);

    const propria = await marcar(token, { pacienteId: paciente.id, dentistaId: dentista.id, procedimentoId: limpeza.id, inicio: dia('09:00') });
    const alheia = await marcar(token, { pacienteId: paciente.id, dentistaId: colega.id, procedimentoId: limpeza.id, inicio: dia('09:00') });

    expect(propria.status).toBe(201);
    expect(alheia.status).toBe(404);
    expect(alheia.body.erro.codigo).toBe('NAO_ENCONTRADO');
  });

  it('paciente, dentista ou procedimento inexistente → 404', async () => {
    const dentista = await dentistaComGrade();
    const token = await tokenDe(contexto, recepcionista);
    const inexistente = '5b0f6a9e-1d4c-4c53-9c1e-0c3a9f6d2b11';
    const base = { pacienteId: paciente.id, dentistaId: dentista.id, procedimentoId: limpeza.id, inicio: dia('09:00') };

    const respostas = await Promise.all([
      marcar(token, { ...base, pacienteId: inexistente }),
      marcar(token, { ...base, dentistaId: inexistente }),
      marcar(token, { ...base, procedimentoId: inexistente }),
    ]);

    expect(respostas.map((resposta) => resposta.status)).toEqual([404, 404, 404]);
  });

  it('horário em bloqueio → 409 HORARIO_BLOQUEADO', async () => {
    const dentista = await dentistaComGrade();
    await contexto.prisma.bloqueio.create({ data: { dentistaId: dentista.id, inicio: instanteEmSaoPaulo('2026-10-05', '09:00'), fim: instanteEmSaoPaulo('2026-10-05', '10:00') } });

    const resposta = await marcar(await tokenDe(contexto, paciente), { dentistaId: dentista.id, procedimentoId: limpeza.id, inicio: dia('09:00') });

    expect(resposta.status).toBe(409);
    expect(resposta.body.erro.codigo).toBe('HORARIO_BLOQUEADO');
  });

  it('outra consulta do dentista no intervalo → 409 HORARIO_INDISPONIVEL', async () => {
    const dentista = await dentistaComGrade();
    const corpo = { dentistaId: dentista.id, procedimentoId: limpeza.id, inicio: dia('09:00') };
    await marcar(await tokenDe(contexto, paciente), corpo);

    const resposta = await marcar(await tokenDe(contexto, await criarPaciente(contexto)), corpo);

    expect(resposta.status).toBe(409);
    expect(resposta.body.erro.codigo).toBe('HORARIO_INDISPONIVEL');
  });

  it('paciente já tem consulta com outro dentista no intervalo → 409 PACIENTE_COM_CONSULTA_NO_HORARIO', async () => {
    const primeiro = await dentistaComGrade();
    const segundo = await dentistaComGrade();
    const token = await tokenDe(contexto, paciente);
    await marcar(token, { dentistaId: primeiro.id, procedimentoId: limpeza.id, inicio: dia('09:00') });

    const resposta = await marcar(token, { dentistaId: segundo.id, procedimentoId: limpeza.id, inicio: dia('09:00') });

    expect(resposta.status).toBe(409);
    expect(resposta.body.erro.codigo).toBe('PACIENTE_COM_CONSULTA_NO_HORARIO');
  });

  it('cliente com horário no passado → 422 HORARIO_NO_PASSADO', async () => {
    const dentista = await dentistaComGrade();

    const resposta = await marcar(await tokenDe(contexto, paciente), { dentistaId: dentista.id, procedimentoId: limpeza.id, inicio: dia('06:00') });

    expect(resposta.status).toBe(422);
    expect(resposta.body.erro.codigo).toBe('HORARIO_NO_PASSADO');
  });

  it('recepção registra consulta retroativa fora da grade → 201 CONFIRMADA (D22.4)', async () => {
    const dentista = await dentistaComGrade();

    const resposta = await marcar(await tokenDe(contexto, recepcionista), {
      pacienteId: paciente.id,
      dentistaId: dentista.id,
      procedimentoId: limpeza.id,
      inicio: dia('05:00'),
    });

    expect(resposta.status).toBe(201);
    expect(resposta.body.status).toBe('CONFIRMADA');
  });

  it('retroativa sobreposta a outra consulta → 409 HORARIO_INDISPONIVEL', async () => {
    const dentista = await dentistaComGrade();
    const token = await tokenDe(contexto, recepcionista);
    const base = { dentistaId: dentista.id, procedimentoId: limpeza.id };
    await marcar(token, { ...base, pacienteId: paciente.id, inicio: dia('05:00') });

    const resposta = await marcar(token, { ...base, pacienteId: (await criarPaciente(contexto)).id, inicio: dia('05:30') });

    expect(resposta.status).toBe(409);
    expect(resposta.body.erro.codigo).toBe('HORARIO_INDISPONIVEL');
  });

  it('dentista inativo → 422 DENTISTA_INATIVO; procedimento inativo → 422 PROCEDIMENTO_INATIVO', async () => {
    const inativo = await dentistaComGrade(undefined, { ativo: false });
    const ativo = await dentistaComGrade();
    const procedimentoInativo = await criarProcedimento(contexto, { ativo: false });
    const token = await tokenDe(contexto, recepcionista);
    const base = { pacienteId: paciente.id, inicio: dia('09:00') };

    const comDentistaInativo = await marcar(token, { ...base, dentistaId: inativo.id, procedimentoId: limpeza.id });
    const comProcedimentoInativo = await marcar(token, { ...base, dentistaId: ativo.id, procedimentoId: procedimentoInativo.id });

    expect(comDentistaInativo.status).toBe(422);
    expect(comDentistaInativo.body.erro.codigo).toBe('DENTISTA_INATIVO');
    expect(comProcedimentoInativo.status).toBe(422);
    expect(comProcedimentoInativo.body.erro.codigo).toBe('PROCEDIMENTO_INATIVO');
  });

  it('com observacao grava HistoricoObservacao com o autor do token', async () => {
    const dentista = await dentistaComGrade();
    const corpo = { dentistaId: dentista.id, procedimentoId: limpeza.id, observacao: 'Sensibilidade no dente 24.' };

    const daClinica = await marcar(await tokenDe(contexto, recepcionista), { ...corpo, pacienteId: paciente.id, inicio: dia('09:00') });
    const doPaciente = await marcar(await tokenDe(contexto, paciente), { ...corpo, inicio: dia('10:00') });

    expect(daClinica.body.observacao).toBe('Sensibilidade no dente 24.');
    const historicoDaClinica = await contexto.prisma.historicoObservacao.findMany({ where: { consultaId: daClinica.body.id } });
    const historicoDoPaciente = await contexto.prisma.historicoObservacao.findMany({ where: { consultaId: doPaciente.body.id } });
    expect(historicoDaClinica).toMatchObject([{ texto: 'Sensibilidade no dente 24.', autor: 'CLINICA', autorFuncionarioId: recepcionista.id }]);
    expect(historicoDoPaciente).toMatchObject([{ texto: 'Sensibilidade no dente 24.', autor: 'PACIENTE', autorFuncionarioId: null }]);
  });

  it('grade seg 20:00–23:00 aceita 22:00 de segunda em São Paulo (terça em UTC)', async () => {
    const dentista = await dentistaComGrade([{ diaSemana: 1, inicio: '20:00', fim: '23:00' }]);

    const resposta = await marcar(await tokenDe(contexto, paciente), { dentistaId: dentista.id, procedimentoId: limpeza.id, inicio: dia('22:00') });

    expect(resposta.status).toBe(201);
    expect(resposta.body.fim).toBe('2026-10-05T23:00:00-03:00');
  });

  it('dois POST simultâneos no mesmo horário → um 201 e um 409 HORARIO_INDISPONIVEL', async () => {
    const dentista = await dentistaComGrade();
    const outro = await criarPaciente(contexto);
    const corpo = { dentistaId: dentista.id, procedimentoId: limpeza.id, inicio: dia('09:00') };

    const respostas = await Promise.all([
      marcar(await tokenDe(contexto, paciente), corpo),
      marcar(await tokenDe(contexto, outro), corpo),
    ]);

    expect(respostas.map((resposta) => resposta.status).sort()).toEqual([201, 409]);
    const conflito = respostas.find((resposta) => resposta.status === 409);
    expect(conflito?.body.erro.codigo).toBe('HORARIO_INDISPONIVEL');
  });

  it('POST de bloqueio e POST de consulta simultâneos no mesmo intervalo → só um é criado', async () => {
    const dentista = await dentistaComGrade();
    const tokenDaRecepcao = await tokenDe(contexto, recepcionista);

    const [consulta, bloqueio] = await Promise.all([
      marcar(await tokenDe(contexto, paciente), { dentistaId: dentista.id, procedimentoId: limpeza.id, inicio: dia('09:00') }),
      request(app)
        .post('/api/bloqueios')
        .set(com(tokenDaRecepcao))
        .send({ dentistaIds: [dentista.id], inicio: dia('09:00'), fim: dia('10:00') }),
    ]);

    expect([consulta.status, bloqueio.status].sort()).toEqual([201, 409]);
    const consultas = await contexto.prisma.consulta.count({ where: { dentistaId: dentista.id } });
    const bloqueios = await contexto.prisma.bloqueio.count({ where: { dentistaId: dentista.id } });
    expect(consultas + bloqueios).toBe(1);
  });
});
