import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarContextoDeTeste } from '../../../testes/contexto-de-teste.ts';
import { criarFuncionario, criarProcedimento, tokenDe } from '../../../testes/fabricas.ts';
import { criarApp } from '../../app.ts';

const contexto = criarContextoDeTeste();
const app = criarApp(contexto);
const MAXIMO_INTEIRO_POSTGRES = 2_147_483_647;
let token: string;

beforeAll(async () => {
  const admin = await criarFuncionario(contexto, { categoria: 'RECEPCIONISTA', isAdmin: true });
  token = await tokenDe(contexto, admin);
});

afterAll(() => contexto.prisma.$disconnect());

const nomeUnico = () => `Limites QA ${randomUUID()}`;

const casosValidos = [
  { descricao: 'minimos de duracao e preco', duracaoMinutos: 1, precoCentavos: 0 },
  { descricao: 'duracao maxima persistivel', duracaoMinutos: MAXIMO_INTEIRO_POSTGRES, precoCentavos: 100 },
  { descricao: 'preco maximo persistivel', duracaoMinutos: 60, precoCentavos: MAXIMO_INTEIRO_POSTGRES },
];

type CasoInvalido = {
  descricao: string;
  campo: 'duracaoMinutos' | 'precoCentavos';
  valor: unknown;
};

const valoresInvalidos = [
  { descricao: 'BUG-001 imediatamente acima do maximo', valor: MAXIMO_INTEIRO_POSTGRES + 1 },
  { descricao: 'negativo', valor: -1 },
  { descricao: 'fracionario', valor: 1.5 },
  { descricao: 'string numerica', valor: '60' },
  { descricao: 'null', valor: null },
  { descricao: 'booleano', valor: true },
  { descricao: 'array', valor: [60] },
  { descricao: 'objeto', valor: { valor: 60 } },
];

const casosInvalidos: CasoInvalido[] = (['duracaoMinutos', 'precoCentavos'] as const)
  .flatMap((campo) => valoresInvalidos.map((caso) => ({ ...caso, campo })));
casosInvalidos.push({ descricao: 'zero sem duracao', campo: 'duracaoMinutos', valor: 0 });

function conferirEntradaInvalida(resposta: request.Response, campo: CasoInvalido['campo']) {
  expect(resposta.status).toBe(400);
  expect(resposta.body.erro.codigo).toBe('ENTRADA_INVALIDA');
  expect(resposta.body.erro.campos).toEqual(expect.arrayContaining([
    expect.objectContaining({ caminho: campo }),
  ]));
}

describe('BUG-001: limites persistiveis na criacao de procedimentos', () => {
  it.each(casosValidos)('POST aceita $descricao e persiste os valores sem truncamento', async ({ duracaoMinutos, precoCentavos }) => {
    const entrada = { nome: nomeUnico(), duracaoMinutos, precoCentavos };

    const resposta = await request(app).post('/api/procedimentos')
      .set('Authorization', `Bearer ${token}`).send(entrada);

    expect(resposta.status).toBe(201);
    expect(resposta.body).toEqual({ ...entrada, id: expect.any(String), ativo: true });
    const salvo = await contexto.prisma.procedimento.findUniqueOrThrow({ where: { id: resposta.body.id } });
    expect(salvo).toEqual(resposta.body);
  });

  it.each(casosInvalidos)('POST recusa $descricao em $campo sem criar registro parcial', async ({ campo, valor }) => {
    const nome = nomeUnico();

    const resposta = await request(app).post('/api/procedimentos')
      .set('Authorization', `Bearer ${token}`)
      .send({ nome, duracaoMinutos: 60, precoCentavos: 100, [campo]: valor });

    expect(await contexto.prisma.procedimento.count({ where: { nome } })).toBe(0);
    conferirEntradaInvalida(resposta, campo);
  });
});

describe('BUG-001: limites persistiveis na edicao de procedimentos', () => {
  it.each(casosValidos)('PATCH aceita $descricao e preserva os campos nao enviados', async ({ duracaoMinutos, precoCentavos }) => {
    const antes = await criarProcedimento(contexto, { nome: nomeUnico(), ativo: false });
    const alteracao = { duracaoMinutos, precoCentavos };

    const resposta = await request(app).patch(`/api/procedimentos/${antes.id}`)
      .set('Authorization', `Bearer ${token}`).send(alteracao);

    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({ ...antes, ...alteracao });
    const depois = await contexto.prisma.procedimento.findUniqueOrThrow({ where: { id: antes.id } });
    expect(depois).toEqual({ ...antes, ...alteracao });
  });

  it.each(casosInvalidos)('PATCH recusa $descricao em $campo sem alterar nome, ativo ou qualquer outro campo', async ({ campo, valor }) => {
    const antes = await criarProcedimento(contexto, { nome: nomeUnico(), ativo: true });

    const resposta = await request(app).patch(`/api/procedimentos/${antes.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ nome: nomeUnico(), ativo: false, [campo]: valor });

    const depois = await contexto.prisma.procedimento.findUniqueOrThrow({ where: { id: antes.id } });
    expect(depois).toEqual(antes);
    conferirEntradaInvalida(resposta, campo);
  });
});
