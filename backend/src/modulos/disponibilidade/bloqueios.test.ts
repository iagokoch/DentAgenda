import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarContextoDeTeste } from '../../../testes/contexto-de-teste.ts';
import { criarFuncionario, criarPaciente, criarProcedimento, tokenDe } from '../../../testes/fabricas.ts';
import { criarApp } from '../../app.ts';
import { instanteEmSaoPaulo } from '../../compartilhado/datas.ts';
import type { Funcionario } from '../../generated/prisma/client.ts';

const contexto = criarContextoDeTeste();
const app = criarApp(contexto);
afterAll(() => contexto.prisma.$disconnect());

// Relógio dos testes: segunda, 2026-10-05, 09:00 em São Paulo.
let recepcionista: Funcionario;
let dentista: Funcionario;
let colega: Funcionario;
beforeAll(async () => {
  recepcionista = await criarFuncionario(contexto);
  dentista = await criarFuncionario(contexto, { categoria: 'DENTISTA' });
  colega = await criarFuncionario(contexto, { categoria: 'DENTISTA' });
});

const com = (token: string) => ({ Authorization: `Bearer ${token}` });
const criar = (token: string, corpo: object) => request(app).post('/api/bloqueios').set(com(token)).send(corpo);
const listar = (token: string, dentistaId: string, consulta = '') =>
  request(app).get(`/api/dentistas/${dentistaId}/bloqueios${consulta}`).set(com(token));
const apagar = (token: string, id: string) => request(app).delete(`/api/bloqueios/${id}`).set(com(token));

// Natal em São Paulo: 24/12 00:00 até 26/12 00:00.
const NATAL = { inicio: '2026-12-24T00:00:00-03:00', fim: '2026-12-26T00:00:00-03:00' };

async function marcarConsulta(
  dentistaId: string,
  data: string,
  de: string,
  ate: string,
  status: 'CONFIRMADA' | 'CANCELADA' | 'REALIZADA' = 'CONFIRMADA',
  nome = 'Marcos Oliveira',
) {
  const paciente = await criarPaciente(contexto, { nome });
  const procedimento = await criarProcedimento(contexto);
  const consulta = await contexto.prisma.consulta.create({
    data: {
      clienteId: paciente.id,
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
  return { consulta, paciente };
}

describe('POST /api/bloqueios', () => {
  it('recepção cria feriado para dois dentistas → 201 com dois bloqueios', async () => {
    const resposta = await criar(await tokenDe(contexto, recepcionista), { dentistaIds: [dentista.id, colega.id], ...NATAL });

    expect(resposta.status).toBe(201);
    expect(resposta.body).toHaveLength(2);
    expect(resposta.body[0]).toEqual({
      id: expect.any(String),
      dentistaId: dentista.id,
      inicio: '2026-12-24T00:00:00-03:00',
      fim: '2026-12-26T00:00:00-03:00',
    });
    expect(resposta.body.map((bloqueio: { dentistaId: string }) => bloqueio.dentistaId)).toEqual([dentista.id, colega.id]);
    expect(await contexto.prisma.bloqueio.count({ where: { dentistaId: { in: [dentista.id, colega.id] } } })).toBeGreaterThanOrEqual(2);
  });

  it('ids repetidos viram um bloqueio só', async () => {
    const outro = await criarFuncionario(contexto, { categoria: 'DENTISTA' });

    const resposta = await criar(await tokenDe(contexto, recepcionista), { dentistaIds: [outro.id, outro.id], ...NATAL });

    expect(resposta.status).toBe(201);
    expect(resposta.body).toHaveLength(1);
  });

  it('um dentista com consulta CONFIRMADA no período → 409 CONSULTAS_NO_PERIODO e nenhum bloqueio criado', async () => {
    const livre = await criarFuncionario(contexto, { categoria: 'DENTISTA' });
    const ocupado = await criarFuncionario(contexto, { categoria: 'DENTISTA' });
    await marcarConsulta(ocupado.id, '2026-12-24', '10:00', '11:00');

    const resposta = await criar(await tokenDe(contexto, recepcionista), { dentistaIds: [livre.id, ocupado.id], ...NATAL });

    expect(resposta.status).toBe(409);
    expect(resposta.body.erro.codigo).toBe('CONSULTAS_NO_PERIODO');
    // Tudo ou nada: nem o dentista livre recebeu bloqueio.
    expect(await contexto.prisma.bloqueio.count({ where: { dentistaId: { in: [livre.id, ocupado.id] } } })).toBe(0);
  });

  it('o 409 lista { id, dentistaId, inicio, paciente: { id, nome } }', async () => {
    const ocupado = await criarFuncionario(contexto, { categoria: 'DENTISTA' });
    const { consulta, paciente } = await marcarConsulta(ocupado.id, '2026-12-25', '14:00', '15:00', 'CONFIRMADA', 'Ana Lima');

    const resposta = await criar(await tokenDe(contexto, recepcionista), { dentistaIds: [ocupado.id], ...NATAL });

    expect(resposta.body.erro.consultas).toEqual([
      {
        id: consulta.id,
        dentistaId: ocupado.id,
        inicio: '2026-12-25T14:00:00-03:00',
        paciente: { id: paciente.id, nome: 'Ana Lima' },
      },
    ]);
  });

  it('consulta CANCELADA ou REALIZADA no período não impede', async () => {
    const outro = await criarFuncionario(contexto, { categoria: 'DENTISTA' });
    await marcarConsulta(outro.id, '2026-12-24', '10:00', '11:00', 'CANCELADA');
    await marcarConsulta(outro.id, '2026-12-24', '12:00', '13:00', 'REALIZADA');

    const resposta = await criar(await tokenDe(contexto, recepcionista), { dentistaIds: [outro.id], ...NATAL });

    expect(resposta.status).toBe(201);
  });

  it('consulta que só encosta no período (termina quando o bloqueio começa) não impede', async () => {
    const outro = await criarFuncionario(contexto, { categoria: 'DENTISTA' });
    await marcarConsulta(outro.id, '2026-12-23', '22:00', '23:59');
    await contexto.prisma.consulta.updateMany({
      where: { dentistaId: outro.id },
      data: { fim: instanteEmSaoPaulo('2026-12-24', '00:00') },
    });

    const resposta = await criar(await tokenDe(contexto, recepcionista), { dentistaIds: [outro.id], ...NATAL });

    expect(resposta.status).toBe(201);
  });

  it('dentista bloqueando a própria agenda → 201', async () => {
    const resposta = await criar(await tokenDe(contexto, dentista), { dentistaIds: [dentista.id], ...NATAL });

    expect(resposta.status).toBe(201);
    expect(resposta.body[0].dentistaId).toBe(dentista.id);
  });

  it('dentista enviando id de outro dentista → 403 SEM_PERMISSAO', async () => {
    const sozinho = await criar(await tokenDe(contexto, dentista), { dentistaIds: [colega.id], ...NATAL });
    const misturado = await criar(await tokenDe(contexto, dentista), { dentistaIds: [dentista.id, colega.id], ...NATAL });

    expect(sozinho.status).toBe(403);
    expect(sozinho.body.erro.codigo).toBe('SEM_PERMISSAO');
    expect(misturado.status).toBe(403);
  });

  it('cliente → 403; sem login → 401', async () => {
    const paciente = await criarPaciente(contexto);

    const doCliente = await criar(await tokenDe(contexto, paciente), { dentistaIds: [dentista.id], ...NATAL });
    const semLogin = await request(app).post('/api/bloqueios').send({ dentistaIds: [dentista.id], ...NATAL });

    expect(doCliente.status).toBe(403);
    expect(semLogin.status).toBe(401);
  });

  it('inicio >= fim → 400; datas sem fuso, lista vazia ou ids malformados → 400', async () => {
    const token = await tokenDe(contexto, recepcionista);

    const invertido = await criar(token, { dentistaIds: [dentista.id], inicio: NATAL.fim, fim: NATAL.inicio });
    const igual = await criar(token, { dentistaIds: [dentista.id], inicio: NATAL.inicio, fim: NATAL.inicio });
    const semFuso = await criar(token, { dentistaIds: [dentista.id], inicio: '2026-12-24T00:00:00', fim: '2026-12-26T00:00:00' });
    const vazio = await criar(token, { dentistaIds: [], ...NATAL });
    const malformado = await criar(token, { dentistaIds: ['abc'], ...NATAL });

    for (const resposta of [invertido, igual, semFuso, vazio, malformado]) {
      expect(resposta.status).toBe(400);
      expect(resposta.body.erro.codigo).toBe('ENTRADA_INVALIDA');
    }
  });

  it('id que não é de dentista ou não existe → 404 e nada é criado', async () => {
    const comRecepcionista = await criar(await tokenDe(contexto, recepcionista), { dentistaIds: [dentista.id, recepcionista.id], ...NATAL });
    const inexistente = await criar(await tokenDe(contexto, recepcionista), {
      dentistaIds: ['5b0f6a9e-1d4c-4c53-9c1e-0c3a9f6d2b11'],
      ...NATAL,
    });

    expect(comRecepcionista.status).toBe(404);
    expect(inexistente.status).toBe(404);
    expect(await contexto.prisma.bloqueio.count({ where: { dentistaId: recepcionista.id } })).toBe(0);
  });
});

describe('GET /api/dentistas/{id}/bloqueios', () => {
  it('GET de/ate pelo dentista: os próprios; de outro → 404', async () => {
    const meu = await criarFuncionario(contexto, { categoria: 'DENTISTA' });
    const alheio = await criarFuncionario(contexto, { categoria: 'DENTISTA' });
    await criar(await tokenDe(contexto, recepcionista), { dentistaIds: [meu.id, alheio.id], ...NATAL });

    const proprios = await listar(await tokenDe(contexto, meu), meu.id, '?de=2026-12-01&ate=2026-12-31');
    const deOutro = await listar(await tokenDe(contexto, meu), alheio.id);

    expect(proprios.status).toBe(200);
    expect(proprios.body).toEqual([
      { id: expect.any(String), dentistaId: meu.id, inicio: '2026-12-24T00:00:00-03:00', fim: '2026-12-26T00:00:00-03:00' },
    ]);
    expect(deOutro.status).toBe(404);
    expect(deOutro.body.erro.codigo).toBe('NAO_ENCONTRADO');
  });

  it('o filtro de/ate traz só os bloqueios que tocam o período; de/ate só com data inclui o dia inteiro', async () => {
    const meu = await criarFuncionario(contexto, { categoria: 'DENTISTA' });
    await criar(await tokenDe(contexto, recepcionista), { dentistaIds: [meu.id], ...NATAL });

    const dentro = await listar(await tokenDe(contexto, recepcionista), meu.id, '?de=2026-12-25&ate=2026-12-25');
    const noUltimoDia = await listar(await tokenDe(contexto, recepcionista), meu.id, '?de=2026-12-26&ate=2026-12-26');
    const antes = await listar(await tokenDe(contexto, recepcionista), meu.id, '?de=2026-12-01&ate=2026-12-23');
    const comHora = await listar(await tokenDe(contexto, recepcionista), meu.id, '?de=2026-12-25T23:00:00-03:00&ate=2026-12-27T00:00:00-03:00');
    const semFiltro = await listar(await tokenDe(contexto, recepcionista), meu.id);

    expect(dentro.body).toHaveLength(1);
    expect(noUltimoDia.body).toEqual([]); // o bloqueio termina às 00:00 do dia 26
    expect(antes.body).toEqual([]);
    expect(comHora.body).toHaveLength(1);
    expect(semFiltro.body).toHaveLength(1);
  });

  it('recepção lista de qualquer dentista; cliente → 403; de/ate inválido → 400; não-dentista → 404', async () => {
    const paciente = await criarPaciente(contexto);

    const daRecepcao = await listar(await tokenDe(contexto, recepcionista), dentista.id);
    const doCliente = await listar(await tokenDe(contexto, paciente), dentista.id);
    const invalido = await listar(await tokenDe(contexto, recepcionista), dentista.id, '?de=ontem');
    const naoDentista = await listar(await tokenDe(contexto, recepcionista), recepcionista.id);

    expect(daRecepcao.status).toBe(200);
    expect(doCliente.status).toBe(403);
    expect(invalido.status).toBe(400);
    expect(naoDentista.status).toBe(404);
  });
});

describe('DELETE /api/bloqueios/{id}', () => {
  it('DELETE apaga a linha → 204', async () => {
    const meu = await criarFuncionario(contexto, { categoria: 'DENTISTA' });
    const [bloqueio] = (await criar(await tokenDe(contexto, recepcionista), { dentistaIds: [meu.id], ...NATAL })).body;

    const resposta = await apagar(await tokenDe(contexto, recepcionista), bloqueio.id);

    expect(resposta.status).toBe(204);
    expect(await contexto.prisma.bloqueio.findUnique({ where: { id: bloqueio.id } })).toBeNull();
  });

  it('dentista apaga o próprio; o de outro dentista → 404 e nada some', async () => {
    const meu = await criarFuncionario(contexto, { categoria: 'DENTISTA' });
    const alheio = await criarFuncionario(contexto, { categoria: 'DENTISTA' });
    const criados = (await criar(await tokenDe(contexto, recepcionista), { dentistaIds: [meu.id, alheio.id], ...NATAL })).body;
    const doMeu = criados.find((bloqueio: { dentistaId: string }) => bloqueio.dentistaId === meu.id);
    const doAlheio = criados.find((bloqueio: { dentistaId: string }) => bloqueio.dentistaId === alheio.id);

    const dele = await apagar(await tokenDe(contexto, meu), doAlheio.id);
    const proprio = await apagar(await tokenDe(contexto, meu), doMeu.id);

    expect(dele.status).toBe(404);
    expect(await contexto.prisma.bloqueio.findUnique({ where: { id: doAlheio.id } })).not.toBeNull();
    expect(proprio.status).toBe(204);
  });

  it('DELETE de bloqueio inexistente ou id malformado → 404; cliente → 403', async () => {
    const paciente = await criarPaciente(contexto);

    const inexistente = await apagar(await tokenDe(contexto, recepcionista), '5b0f6a9e-1d4c-4c53-9c1e-0c3a9f6d2b11');
    const malformado = await apagar(await tokenDe(contexto, recepcionista), 'abc');
    const doCliente = await apagar(await tokenDe(contexto, paciente), '5b0f6a9e-1d4c-4c53-9c1e-0c3a9f6d2b11');

    expect(inexistente.status).toBe(404);
    expect(malformado.status).toBe(404);
    expect(doCliente.status).toBe(403);
  });
});
