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
let recepcionista: Funcionario;
let limpeza: Procedimento;
let paciente: Cliente;
beforeAll(async () => {
  recepcionista = await criarFuncionario(contexto);
  limpeza = await criarProcedimento(contexto, { duracaoMinutos: 60 });
});
beforeEach(async () => {
  contexto.relogio.definir(instanteEmSaoPaulo('2026-10-05', '07:00'));
  paciente = await criarPaciente(contexto);
});

const com = (token: string) => ({ Authorization: `Bearer ${token}` });
const realizar = (token: string, id: string) => request(app).post(`/api/consultas/${id}/realizacao`).set(com(token));
const dentistaNovo = () => criarFuncionario(contexto, { categoria: 'DENTISTA' });
const marcarEm = (dentistaId: string, hora: string, data = '2026-10-05', status?: 'CONFIRMADA' | 'REALIZADA' | 'CANCELADA') =>
  criarConsultaNoBanco(contexto, { clienteId: paciente.id, dentistaId, procedimentoId: limpeza.id, inicio: instanteEmSaoPaulo(data, hora), ...(status ? { status } : {}) });

describe('POST /api/consultas/{id}/realizacao', () => {
  it('dentista marca a própria depois do início → 200 REALIZADA', async () => {
    const dentista = await dentistaNovo();
    const consulta = await marcarEm(dentista.id, '06:30');

    const resposta = await realizar(await tokenDe(contexto, dentista), consulta.id);

    expect(resposta.status).toBe(200);
    expect(resposta.body).toMatchObject({ id: consulta.id, status: 'REALIZADA', canceladoEm: null });
  });

  it('exatamente no horário de início → 200', async () => {
    const dentista = await dentistaNovo();
    const consulta = await marcarEm(dentista.id, '07:00');

    const resposta = await realizar(await tokenDe(contexto, dentista), consulta.id);

    expect(resposta.status).toBe(200);
  });

  it('antes do início → 422 CONSULTA_NAO_INICIADA', async () => {
    const dentista = await dentistaNovo();
    const consulta = await marcarEm(dentista.id, '09:00');

    const resposta = await realizar(await tokenDe(contexto, dentista), consulta.id);

    expect(resposta.status).toBe(422);
    expect(resposta.body.erro.codigo).toBe('CONSULTA_NAO_INICIADA');
    expect((await contexto.prisma.consulta.findUniqueOrThrow({ where: { id: consulta.id } })).status).toBe('CONFIRMADA');
  });

  it('consulta CANCELADA ou já REALIZADA → 422 CONSULTA_NAO_CONFIRMADA', async () => {
    const dentista = await dentistaNovo();
    const cancelada = await marcarEm(dentista.id, '09:00', '2026-10-09', 'CANCELADA');
    const jaRealizada = await marcarEm(dentista.id, '09:00', '2026-10-02', 'REALIZADA');
    const token = await tokenDe(contexto, recepcionista);

    const respostas = await Promise.all([realizar(token, cancelada.id), realizar(token, jaRealizada.id)]);

    expect(respostas.map((resposta) => resposta.status)).toEqual([422, 422]);
    expect(respostas.map((resposta) => resposta.body.erro.codigo)).toEqual(['CONSULTA_NAO_CONFIRMADA', 'CONSULTA_NAO_CONFIRMADA']);
  });

  it('recepção marca de qualquer dentista; cliente → 403; dentista em consulta de outro → 404', async () => {
    const dono = await dentistaNovo();
    const consulta = await marcarEm(dono.id, '06:00');

    const peloCliente = await realizar(await tokenDe(contexto, paciente), consulta.id);
    const pelaColega = await realizar(await tokenDe(contexto, await dentistaNovo()), consulta.id);
    const pelaRecepcao = await realizar(await tokenDe(contexto, recepcionista), consulta.id);

    expect(peloCliente.status).toBe(403);
    expect(peloCliente.body.erro.codigo).toBe('SEM_PERMISSAO');
    expect(pelaColega.status).toBe(404);
    expect(pelaRecepcao.status).toBe(200);
  });

  it('REALIZADA sai de pendentes', async () => {
    const dentista = await dentistaNovo();
    const consulta = await marcarEm(dentista.id, '09:00', '2026-10-02');
    const token = await tokenDe(contexto, dentista);
    const pendentes = async () => (await request(app).get('/api/consultas/pendentes').set(com(token))).body.itens.map((item: { id: string }) => item.id);

    expect(await pendentes()).toContain(consulta.id);
    await realizar(token, consulta.id);

    expect(await pendentes()).not.toContain(consulta.id);
  });
});
