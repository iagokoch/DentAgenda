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

// Relógio dos testes: segunda, 2026-10-05, 07:00 em São Paulo. Grade padrão: segunda 08:00–12:00. Limpeza: 60 min.
let recepcionista: Funcionario;
let limpeza: Procedimento;
let paciente: Cliente;
beforeAll(async () => {
  recepcionista = await criarFuncionario(contexto);
  limpeza = await criarProcedimento(contexto, { duracaoMinutos: 60 });
});
// Paciente novo a cada teste: o telefone dele identifica os SMS do teste e as consultas não se sobrepõem entre testes.
beforeEach(async () => {
  contexto.relogio.definir(instanteEmSaoPaulo('2026-10-05', '07:00'));
  paciente = await criarPaciente(contexto);
});

const tempo = (hora: string) => new Date(`1970-01-01T${hora}:00Z`);
async function dentistaNovo(comGrade = true) {
  const dentista = await criarFuncionario(contexto, { categoria: 'DENTISTA' });
  if (comGrade) {
    await contexto.prisma.gradeHorario.create({ data: { dentistaId: dentista.id, diaSemana: 1, inicio: tempo('08:00'), fim: tempo('12:00') } });
  }
  return dentista;
}

const com = (token: string) => ({ Authorization: `Bearer ${token}` });
const cancelar = (token: string, id: string, corpo: object = {}) => request(app).post(`/api/consultas/${id}/cancelamento`).set(com(token)).send(corpo);
const remarcar = (token: string, id: string, corpo: object) => request(app).post(`/api/consultas/${id}/remarcacao`).set(com(token)).send(corpo);
const marcarEm = (dentistaId: string, data: string, hora: string, clienteId = paciente.id) =>
  criarConsultaNoBanco(contexto, { clienteId, dentistaId, procedimentoId: limpeza.id, inicio: instanteEmSaoPaulo(data, hora) });
const mensagensPara = (telefone: string) => contexto.enviador.mensagens.filter((mensagem) => mensagem.destino === telefone);

describe('POST /api/consultas/{id}/cancelamento', () => {
  it('cliente cancela com 48 h sem justificativa → 200, canceladoPor PACIENTE', async () => {
    const dentista = await dentistaNovo();
    const consulta = await marcarEm(dentista.id, '2026-10-07', '07:00');

    const resposta = await cancelar(await tokenDe(contexto, paciente), consulta.id);

    expect(resposta.status).toBe(200);
    expect(resposta.body).toMatchObject({
      id: consulta.id,
      status: 'CANCELADA',
      canceladoPor: 'PACIENTE',
      canceladoEm: '2026-10-05T07:00:00-03:00',
      justificativa: null,
    });
  });

  it('cliente exatamente 24 h antes sem justificativa → 200', async () => {
    const dentista = await dentistaNovo();
    const consulta = await marcarEm(dentista.id, '2026-10-06', '07:00');

    const resposta = await cancelar(await tokenDe(contexto, paciente), consulta.id);

    expect(resposta.status).toBe(200);
  });

  it('cliente 23 h 59 min antes sem justificativa → 422 JUSTIFICATIVA_OBRIGATORIA', async () => {
    const dentista = await dentistaNovo();
    const consulta = await marcarEm(dentista.id, '2026-10-06', '06:59');

    const resposta = await cancelar(await tokenDe(contexto, paciente), consulta.id);

    expect(resposta.status).toBe(422);
    expect(resposta.body.erro.codigo).toBe('JUSTIFICATIVA_OBRIGATORIA');
    expect((await contexto.prisma.consulta.findUniqueOrThrow({ where: { id: consulta.id } })).status).toBe('CONFIRMADA');
  });

  it('cliente com justificativa e 2 h antes → 200', async () => {
    const dentista = await dentistaNovo();
    const consulta = await marcarEm(dentista.id, '2026-10-05', '09:00');

    const resposta = await cancelar(await tokenDe(contexto, paciente), consulta.id, { justificativa: 'Imprevisto no trabalho.' });

    expect(resposta.status).toBe(200);
    expect(resposta.body.justificativa).toBe('Imprevisto no trabalho.');
  });

  it('cliente depois do início → 422 CONSULTA_JA_INICIADA', async () => {
    const dentista = await dentistaNovo();
    const consulta = await marcarEm(dentista.id, '2026-10-05', '06:30');

    const resposta = await cancelar(await tokenDe(contexto, paciente), consulta.id, { justificativa: 'Não fui.' });

    expect(resposta.status).toBe(422);
    expect(resposta.body.erro.codigo).toBe('CONSULTA_JA_INICIADA');
  });

  it('recepção cancela depois do início sem justificativa → 200, canceladoPor CLINICA e SMS ao paciente', async () => {
    const dentista = await dentistaNovo();
    const consulta = await marcarEm(dentista.id, '2026-10-05', '06:30');

    const resposta = await cancelar(await tokenDe(contexto, recepcionista), consulta.id);

    expect(resposta.status).toBe(200);
    expect(resposta.body.canceladoPor).toBe('CLINICA');
    const registrada = await contexto.prisma.consulta.findUniqueOrThrow({ where: { id: consulta.id } });
    expect(registrada.canceladoPorFuncionarioId).toBe(recepcionista.id);
    const sms = mensagensPara(paciente.telefone);
    expect(sms).toHaveLength(1);
    expect(sms[0]?.texto).toContain('cancel');
    expect(sms[0]?.texto).toContain('05/10');
  });

  it('cliente que cancela não gera SMS', async () => {
    const dentista = await dentistaNovo();
    const consulta = await marcarEm(dentista.id, '2026-10-08', '09:00');

    await cancelar(await tokenDe(contexto, paciente), consulta.id);

    expect(mensagensPara(paciente.telefone)).toHaveLength(0);
  });

  it('cancelar consulta CANCELADA ou REALIZADA → 422 CONSULTA_NAO_CANCELAVEL', async () => {
    const dentista = await dentistaNovo();
    const cancelada = await criarConsultaNoBanco(contexto, { clienteId: paciente.id, dentistaId: dentista.id, procedimentoId: limpeza.id, inicio: instanteEmSaoPaulo('2026-10-09', '09:00'), status: 'CANCELADA' });
    const realizada = await criarConsultaNoBanco(contexto, { clienteId: paciente.id, dentistaId: dentista.id, procedimentoId: limpeza.id, inicio: instanteEmSaoPaulo('2026-10-04', '09:00'), status: 'REALIZADA' });
    const token = await tokenDe(contexto, recepcionista);

    const respostas = await Promise.all([cancelar(token, cancelada.id), cancelar(token, realizada.id)]);

    expect(respostas.map((resposta) => resposta.status)).toEqual([422, 422]);
    expect(respostas.map((resposta) => resposta.body.erro.codigo)).toEqual(['CONSULTA_NAO_CANCELAVEL', 'CONSULTA_NAO_CANCELAVEL']);
  });

  it('dentista cancela consulta de outro dentista → 404; de outro paciente pelo cliente → 404', async () => {
    const dono = await dentistaNovo();
    const consulta = await marcarEm(dono.id, '2026-10-08', '09:00');

    const pelaColega = await cancelar(await tokenDe(contexto, await dentistaNovo()), consulta.id);
    const peloOutroPaciente = await cancelar(await tokenDe(contexto, await criarPaciente(contexto)), consulta.id);

    expect(pelaColega.status).toBe(404);
    expect(peloOutroPaciente.status).toBe(404);
  });

  it('o dentista da consulta cancela a própria → 200', async () => {
    const dentista = await dentistaNovo();
    const consulta = await marcarEm(dentista.id, '2026-10-08', '09:00');

    const resposta = await cancelar(await tokenDe(contexto, dentista), consulta.id);

    expect(resposta.status).toBe(200);
    expect(resposta.body.canceladoPor).toBe('CLINICA');
  });

  it('horário cancelado volta a aparecer em horarios-livres', async () => {
    const dentista = await dentistaNovo();
    const consulta = await marcarEm(dentista.id, '2026-10-05', '09:00');
    const token = await tokenDe(contexto, recepcionista);
    const livres = async () => {
      const resposta = await request(app)
        .get(`/api/horarios-livres?procedimentoId=${limpeza.id}&data=2026-10-05&dentistaId=${dentista.id}`)
        .set(com(token));
      return resposta.body.horarios.map((horario: { inicio: string }) => horario.inicio);
    };

    expect(await livres()).not.toContain('2026-10-05T09:00:00-03:00');
    await cancelar(token, consulta.id);

    expect(await livres()).toContain('2026-10-05T09:00:00-03:00');
  });
});

describe('POST /api/consultas/{id}/remarcacao', () => {
  it('remarcação → 201 { cancelada, nova }, mesmo paciente, dentista e procedimento', async () => {
    const dentista = await dentistaNovo();
    const original = await marcarEm(dentista.id, '2026-10-12', '09:00');

    const resposta = await remarcar(await tokenDe(contexto, recepcionista), original.id, { inicio: '2026-10-19T10:00:00-03:00' });

    expect(resposta.status).toBe(201);
    expect(resposta.body.cancelada).toMatchObject({ id: original.id, status: 'CANCELADA', canceladoPor: 'CLINICA' });
    expect(resposta.body.nova).toMatchObject({
      status: 'CONFIRMADA',
      paciente: { id: paciente.id },
      dentista: { id: dentista.id },
      procedimento: { id: limpeza.id },
      inicio: '2026-10-19T10:00:00-03:00',
      fim: '2026-10-19T11:00:00-03:00',
    });
    expect(resposta.body.nova.id).not.toBe(original.id);
  });

  it('remarcar 30 min para frente, sobrepondo a original → 201', async () => {
    const dentista = await dentistaNovo();
    const original = await marcarEm(dentista.id, '2026-10-12', '09:00');

    const resposta = await remarcar(await tokenDe(contexto, recepcionista), original.id, { inicio: '2026-10-12T09:30:00-03:00' });

    expect(resposta.status).toBe(201);
    expect(resposta.body.nova.inicio).toBe('2026-10-12T09:30:00-03:00');
  });

  it('remarcação com outro dentista e outro procedimento', async () => {
    const dentista = await dentistaNovo();
    const outroDentista = await dentistaNovo();
    const clareamento = await criarProcedimento(contexto, { duracaoMinutos: 30 });
    const original = await marcarEm(dentista.id, '2026-10-12', '09:00');

    const resposta = await remarcar(await tokenDe(contexto, recepcionista), original.id, {
      inicio: '2026-10-12T10:00:00-03:00',
      dentistaId: outroDentista.id,
      procedimentoId: clareamento.id,
    });

    expect(resposta.status).toBe(201);
    expect(resposta.body.nova).toMatchObject({ dentista: { id: outroDentista.id }, procedimento: { id: clareamento.id }, fim: '2026-10-12T10:30:00-03:00' });
  });

  it('remarcação para horário ocupado → 409 e a original continua CONFIRMADA', async () => {
    const dentista = await dentistaNovo();
    const original = await marcarEm(dentista.id, '2026-10-12', '09:00');
    await marcarEm(dentista.id, '2026-10-12', '10:00', (await criarPaciente(contexto)).id);

    const resposta = await remarcar(await tokenDe(contexto, recepcionista), original.id, { inicio: '2026-10-12T10:00:00-03:00' });

    expect(resposta.status).toBe(409);
    expect(resposta.body.erro.codigo).toBe('HORARIO_INDISPONIVEL');
    expect((await contexto.prisma.consulta.findUniqueOrThrow({ where: { id: original.id } })).status).toBe('CONFIRMADA');
    expect(mensagensPara(paciente.telefone)).toHaveLength(0);
  });

  it('remarcação pelo cliente com menos de 24 h sem justificativa → 422 e nada muda', async () => {
    const dentista = await dentistaNovo();
    const original = await marcarEm(dentista.id, '2026-10-05', '09:00');

    const resposta = await remarcar(await tokenDe(contexto, paciente), original.id, { inicio: '2026-10-12T09:00:00-03:00' });

    expect(resposta.status).toBe(422);
    expect(resposta.body.erro.codigo).toBe('JUSTIFICATIVA_OBRIGATORIA');
    expect(await contexto.prisma.consulta.count({ where: { clienteId: paciente.id } })).toBe(1);
    expect((await contexto.prisma.consulta.findUniqueOrThrow({ where: { id: original.id } })).status).toBe('CONFIRMADA');
  });

  it('remarcação pelo cliente com mais de 24 h e horário do passo → 201, sem SMS', async () => {
    const dentista = await dentistaNovo();
    const original = await marcarEm(dentista.id, '2026-10-12', '09:00');

    const resposta = await remarcar(await tokenDe(contexto, paciente), original.id, { inicio: '2026-10-12T10:00:00-03:00' });

    expect(resposta.status).toBe(201);
    expect(resposta.body.cancelada.canceladoPor).toBe('PACIENTE');
    expect(mensagensPara(paciente.telefone)).toHaveLength(0);
  });

  it('remarcação pela recepção manda um SMS com o horário novo', async () => {
    const dentista = await dentistaNovo();
    const original = await marcarEm(dentista.id, '2026-10-12', '09:00');

    await remarcar(await tokenDe(contexto, recepcionista), original.id, { inicio: '2026-10-12T09:30:00-03:00' });

    const sms = mensagensPara(paciente.telefone);
    expect(sms).toHaveLength(1);
    expect(sms[0]?.texto).toContain('12/10');
    expect(sms[0]?.texto).toContain('09:30');
  });

  it('remarcar consulta que já foi cancelada → 422 CONSULTA_NAO_CANCELAVEL', async () => {
    const dentista = await dentistaNovo();
    const cancelada = await criarConsultaNoBanco(contexto, { clienteId: paciente.id, dentistaId: dentista.id, procedimentoId: limpeza.id, inicio: instanteEmSaoPaulo('2026-10-12', '09:00'), status: 'CANCELADA' });

    const resposta = await remarcar(await tokenDe(contexto, recepcionista), cancelada.id, { inicio: '2026-10-12T10:00:00-03:00' });

    expect(resposta.status).toBe(422);
    expect(resposta.body.erro.codigo).toBe('CONSULTA_NAO_CANCELAVEL');
  });

  it('remarcar consulta de outro paciente pelo cliente → 404; entrada inválida → 400', async () => {
    const dentista = await dentistaNovo();
    const original = await marcarEm(dentista.id, '2026-10-12', '09:00');

    const alheia = await remarcar(await tokenDe(contexto, await criarPaciente(contexto)), original.id, { inicio: '2026-10-12T10:00:00-03:00' });
    const semInicio = await remarcar(await tokenDe(contexto, recepcionista), original.id, {});

    expect(alheia.status).toBe(404);
    expect(semInicio.status).toBe(400);
  });
});
