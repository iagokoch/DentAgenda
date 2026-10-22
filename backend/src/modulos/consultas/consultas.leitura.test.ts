import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { criarContextoDeTeste } from '../../../testes/contexto-de-teste.ts';
import { criarConsultaNoBanco, criarFuncionario, criarPaciente, criarProcedimento, tokenDe } from '../../../testes/fabricas.ts';
import { criarApp } from '../../app.ts';
import { instanteEmSaoPaulo } from '../../compartilhado/datas.ts';
import type { Funcionario, Procedimento } from '../../generated/prisma/client.ts';

const contexto = criarContextoDeTeste();
const app = criarApp(contexto);
afterAll(() => contexto.prisma.$disconnect());

// Relógio dos testes: segunda, 2026-10-05, 07:00 em São Paulo.
beforeEach(() => contexto.relogio.definir(instanteEmSaoPaulo('2026-10-05', '07:00')));

let recepcionista: Funcionario;
let limpeza: Procedimento;
beforeAll(async () => {
  recepcionista = await criarFuncionario(contexto);
  limpeza = await criarProcedimento(contexto, { duracaoMinutos: 60 });
});

const com = (token: string) => ({ Authorization: `Bearer ${token}` });
const ler = (token: string, caminho: string) => request(app).get(caminho).set(com(token));

type Semente = { clienteId: string; dentistaId: string; data: string; hora: string; status?: 'CONFIRMADA' | 'REALIZADA' | 'CANCELADA' };
const inserirConsulta = ({ clienteId, dentistaId, data, hora, status }: Semente) =>
  criarConsultaNoBanco(contexto, { clienteId, dentistaId, procedimentoId: limpeza.id, inicio: instanteEmSaoPaulo(data, hora), ...(status ? { status } : {}) });

const dentistaNovo = () => criarFuncionario(contexto, { categoria: 'DENTISTA' });
const idsDe = (corpo: { itens: { id: string }[] }) => corpo.itens.map((item) => item.id);

describe('GET /api/consultas', () => {
  it('recepção filtra por de/ate (datas em São Paulo), dentistaId, pacienteId e status', async () => {
    const dentista = await dentistaNovo();
    const outroDentista = await dentistaNovo();
    const paciente = await criarPaciente(contexto);
    const outro = await criarPaciente(contexto);
    const ontem = await inserirConsulta({ clienteId: paciente.id, dentistaId: dentista.id, data: '2026-10-04', hora: '09:00' });
    // 23:30 em SP ainda é dia 5, embora já seja dia 6 em UTC.
    const noitePrimeiroDia = await inserirConsulta({ clienteId: paciente.id, dentistaId: dentista.id, data: '2026-10-05', hora: '23:30' });
    const cancelada = await inserirConsulta({ clienteId: paciente.id, dentistaId: dentista.id, data: '2026-10-06', hora: '09:00', status: 'CANCELADA' });
    const doOutroDentista = await inserirConsulta({ clienteId: outro.id, dentistaId: outroDentista.id, data: '2026-10-05', hora: '10:00' });
    const token = await tokenDe(contexto, recepcionista);

    const nesteDia = await ler(token, `/api/consultas?dentistaId=${dentista.id}&de=2026-10-05&ate=2026-10-05`);
    const doPaciente = await ler(token, `/api/consultas?pacienteId=${paciente.id}`);
    const soCanceladas = await ler(token, `/api/consultas?dentistaId=${dentista.id}&status=CANCELADA`);
    const doOutro = await ler(token, `/api/consultas?dentistaId=${outroDentista.id}`);

    expect(idsDe(nesteDia.body)).toEqual([noitePrimeiroDia.id]);
    expect(idsDe(doPaciente.body)).toEqual([ontem.id, noitePrimeiroDia.id, cancelada.id]);
    expect(idsDe(soCanceladas.body)).toEqual([cancelada.id]);
    expect(idsDe(doOutro.body)).toEqual([doOutroDentista.id]);
  });

  it('lista paginada em ordem de início, no formato D24.3', async () => {
    const dentista = await dentistaNovo();
    const paciente = await criarPaciente(contexto);
    const [terceira, primeira, segunda] = [
      await inserirConsulta({ clienteId: paciente.id, dentistaId: dentista.id, data: '2026-10-08', hora: '09:00' }),
      await inserirConsulta({ clienteId: paciente.id, dentistaId: dentista.id, data: '2026-10-06', hora: '09:00' }),
      await inserirConsulta({ clienteId: paciente.id, dentistaId: dentista.id, data: '2026-10-07', hora: '09:00' }),
    ];
    const token = await tokenDe(contexto, recepcionista);

    const paginaUm = await ler(token, `/api/consultas?dentistaId=${dentista.id}&porPagina=2`);
    const paginaDois = await ler(token, `/api/consultas?dentistaId=${dentista.id}&porPagina=2&pagina=2`);

    expect(paginaUm.status).toBe(200);
    expect(paginaUm.body.total).toBe(3);
    expect(idsDe(paginaUm.body)).toEqual([primeira.id, segunda.id]);
    expect(idsDe(paginaDois.body)).toEqual([terceira.id]);
    expect(paginaUm.body.itens[0]).toMatchObject({
      paciente: { id: paciente.id, nome: paciente.nome },
      dentista: { id: dentista.id },
      procedimento: { id: limpeza.id },
      inicio: '2026-10-06T09:00:00-03:00',
      status: 'CONFIRMADA',
    });
  });

  it('dentista recebe só a própria agenda, mesmo filtrando outro dentistaId', async () => {
    const dentista = await dentistaNovo();
    const colega = await dentistaNovo();
    const paciente = await criarPaciente(contexto);
    const propria = await inserirConsulta({ clienteId: paciente.id, dentistaId: dentista.id, data: '2026-10-06', hora: '09:00' });
    await inserirConsulta({ clienteId: (await criarPaciente(contexto)).id, dentistaId: colega.id, data: '2026-10-06', hora: '09:00' });

    const semFiltro = await ler(await tokenDe(contexto, dentista), '/api/consultas');
    const filtrandoColega = await ler(await tokenDe(contexto, dentista), `/api/consultas?dentistaId=${colega.id}`);

    expect(idsDe(semFiltro.body)).toEqual([propria.id]);
    expect(idsDe(filtrandoColega.body)).toEqual([propria.id]);
  });

  it('cliente recebe só as próprias, mesmo filtrando o pacienteId de outro', async () => {
    const dentista = await dentistaNovo();
    const paciente = await criarPaciente(contexto);
    const outro = await criarPaciente(contexto);
    const propria = await inserirConsulta({ clienteId: paciente.id, dentistaId: dentista.id, data: '2026-10-06', hora: '09:00' });
    await inserirConsulta({ clienteId: outro.id, dentistaId: dentista.id, data: '2026-10-06', hora: '11:00' });

    const resposta = await ler(await tokenDe(contexto, paciente), `/api/consultas?pacienteId=${outro.id}`);

    expect(idsDe(resposta.body)).toEqual([propria.id]);
  });

  it('filtro malformado → 400 ENTRADA_INVALIDA; sem token → 401', async () => {
    const malformado = await ler(await tokenDe(contexto, recepcionista), '/api/consultas?status=QUALQUER');
    const anonimo = await request(app).get('/api/consultas');

    expect(malformado.status).toBe(400);
    expect(malformado.body.erro.codigo).toBe('ENTRADA_INVALIDA');
    expect(anonimo.status).toBe(401);
  });
});

describe('GET /api/consultas/{id}', () => {
  it('recepção, o paciente e o dentista da consulta veem → 200 no formato D24.3', async () => {
    const dentista = await dentistaNovo();
    const paciente = await criarPaciente(contexto);
    const consulta = await inserirConsulta({ clienteId: paciente.id, dentistaId: dentista.id, data: '2026-10-06', hora: '09:00' });

    const respostas = await Promise.all([
      ler(await tokenDe(contexto, recepcionista), `/api/consultas/${consulta.id}`),
      ler(await tokenDe(contexto, paciente), `/api/consultas/${consulta.id}`),
      ler(await tokenDe(contexto, dentista), `/api/consultas/${consulta.id}`),
    ]);

    expect(respostas.map((resposta) => resposta.status)).toEqual([200, 200, 200]);
    expect(respostas[0]?.body).toMatchObject({ id: consulta.id, paciente: { id: paciente.id }, fim: '2026-10-06T10:00:00-03:00', canceladoEm: null });
  });

  it('consulta de outro paciente pelo cliente → 404', async () => {
    const dentista = await dentistaNovo();
    const dono = await criarPaciente(contexto);
    const consulta = await inserirConsulta({ clienteId: dono.id, dentistaId: dentista.id, data: '2026-10-06', hora: '09:00' });

    const resposta = await ler(await tokenDe(contexto, await criarPaciente(contexto)), `/api/consultas/${consulta.id}`);

    expect(resposta.status).toBe(404);
    expect(resposta.body.erro.codigo).toBe('NAO_ENCONTRADO');
  });

  it('consulta de outro dentista pelo dentista → 404', async () => {
    const dono = await dentistaNovo();
    const consulta = await inserirConsulta({ clienteId: (await criarPaciente(contexto)).id, dentistaId: dono.id, data: '2026-10-06', hora: '09:00' });

    const resposta = await ler(await tokenDe(contexto, await dentistaNovo()), `/api/consultas/${consulta.id}`);

    expect(resposta.status).toBe(404);
  });

  it('id que não é UUID ou que não existe → 404', async () => {
    const token = await tokenDe(contexto, recepcionista);

    const malformado = await ler(token, '/api/consultas/abc');
    const inexistente = await ler(token, '/api/consultas/5b0f6a9e-1d4c-4c53-9c1e-0c3a9f6d2b11');

    expect(malformado.status).toBe(404);
    expect(inexistente.status).toBe(404);
  });
});

describe('GET /api/consultas/pendentes', () => {
  it('CONFIRMADAS com fim no passado, as mais antigas primeiro', async () => {
    const dentista = await dentistaNovo();
    const paciente = await criarPaciente(contexto);
    const maisRecente = await inserirConsulta({ clienteId: paciente.id, dentistaId: dentista.id, data: '2026-10-04', hora: '09:00' });
    const maisAntiga = await inserirConsulta({ clienteId: paciente.id, dentistaId: dentista.id, data: '2026-10-02', hora: '09:00' });
    await inserirConsulta({ clienteId: paciente.id, dentistaId: dentista.id, data: '2026-10-03', hora: '09:00', status: 'REALIZADA' });
    await inserirConsulta({ clienteId: paciente.id, dentistaId: dentista.id, data: '2026-10-03', hora: '14:00', status: 'CANCELADA' });
    await inserirConsulta({ clienteId: paciente.id, dentistaId: dentista.id, data: '2026-10-06', hora: '09:00' });
    // Começou às 06:30 e termina às 07:30: ainda não acabou às 07:00.
    await inserirConsulta({ clienteId: paciente.id, dentistaId: dentista.id, data: '2026-10-05', hora: '06:30' });

    const resposta = await ler(await tokenDe(contexto, recepcionista), '/api/consultas/pendentes');

    const dessaAgenda = resposta.body.itens.filter((item: { dentista: { id: string } }) => item.dentista.id === dentista.id);
    expect(resposta.status).toBe(200);
    expect(dessaAgenda.map((item: { id: string }) => item.id)).toEqual([maisAntiga.id, maisRecente.id]);
  });

  it('do dentista: só as dele', async () => {
    const dentista = await dentistaNovo();
    const colega = await dentistaNovo();
    const dele = await inserirConsulta({ clienteId: (await criarPaciente(contexto)).id, dentistaId: dentista.id, data: '2026-10-02', hora: '09:00' });
    await inserirConsulta({ clienteId: (await criarPaciente(contexto)).id, dentistaId: colega.id, data: '2026-10-02', hora: '09:00' });

    const resposta = await ler(await tokenDe(contexto, dentista), '/api/consultas/pendentes');

    expect(idsDe(resposta.body)).toEqual([dele.id]);
  });

  it('pelo cliente → 403 SEM_PERMISSAO', async () => {
    const resposta = await ler(await tokenDe(contexto, await criarPaciente(contexto)), '/api/consultas/pendentes');

    expect(resposta.status).toBe(403);
    expect(resposta.body.erro.codigo).toBe('SEM_PERMISSAO');
  });
});
