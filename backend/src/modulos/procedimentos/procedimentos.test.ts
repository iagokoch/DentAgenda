import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarContextoDeTeste } from '../../../testes/contexto-de-teste.ts';
import { criarFuncionario, criarPaciente, criarProcedimento, tokenDe } from '../../../testes/fabricas.ts';
import { criarApp } from '../../app.ts';
import type { Cliente, Funcionario } from '../../generated/prisma/client.ts';

const contexto = criarContextoDeTeste();
const app = criarApp(contexto);
afterAll(() => contexto.prisma.$disconnect());

// Criados no beforeAll: o banco é limpo antes dos testes de cada arquivo, depois do import.
let admin: Funcionario;
let recepcionista: Funcionario;
let paciente: Cliente;
beforeAll(async () => {
  admin = await criarFuncionario(contexto, { categoria: 'RECEPCIONISTA', isAdmin: true });
  recepcionista = await criarFuncionario(contexto, { categoria: 'RECEPCIONISTA' });
  paciente = await criarPaciente(contexto);
});

const nomeUnico = (prefixo: string) => `${prefixo} ${randomUUID().slice(0, 8)}`;
const listar = (token: string) => request(app).get('/api/procedimentos').set('Authorization', `Bearer ${token}`);
const criar = (token: string, corpo: object) =>
  request(app).post('/api/procedimentos').set('Authorization', `Bearer ${token}`).send(corpo);
const editar = (token: string, id: string, corpo: object) =>
  request(app).patch(`/api/procedimentos/${id}`).set('Authorization', `Bearer ${token}`).send(corpo);

describe('GET /api/procedimentos', () => {
  it('GET de cliente traz só os ativos; de funcionário traz todos', async () => {
    const ativo = await criarProcedimento(contexto, { nome: nomeUnico('Ativo') });
    const inativo = await criarProcedimento(contexto, { nome: nomeUnico('Inativo'), ativo: false });

    const doCliente = await listar(tokenDe(contexto, paciente));
    const doFuncionario = await listar(tokenDe(contexto, recepcionista));

    expect(doCliente.status).toBe(200);
    const idsDoCliente = doCliente.body.map((procedimento: { id: string }) => procedimento.id);
    expect(idsDoCliente).toContain(ativo.id);
    expect(idsDoCliente).not.toContain(inativo.id);
    const idsDoFuncionario = doFuncionario.body.map((procedimento: { id: string }) => procedimento.id);
    expect(idsDoFuncionario).toEqual(expect.arrayContaining([ativo.id, inativo.id]));
    expect(doCliente.body.find((procedimento: { id: string }) => procedimento.id === ativo.id)).toEqual({
      id: ativo.id,
      nome: ativo.nome,
      duracaoMinutos: 60,
      precoCentavos: 18000,
      ativo: true,
    });
  });

  it('lista em ordem alfabética de nome', async () => {
    const resposta = await listar(tokenDe(contexto, recepcionista));

    const nomes = resposta.body.map((procedimento: { nome: string }) => procedimento.nome);
    expect(nomes).toEqual([...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR')));
  });

  it('GET sem login → 401', async () => {
    const resposta = await request(app).get('/api/procedimentos');

    expect(resposta.status).toBe(401);
    expect(resposta.body.erro.codigo).toBe('NAO_AUTENTICADO');
  });
});

describe('POST /api/procedimentos', () => {
  it('POST por admin → 201 { id, nome, duracaoMinutos, precoCentavos, ativo: true }', async () => {
    const nome = nomeUnico('Limpeza');

    const resposta = await criar(tokenDe(contexto, admin), { nome, duracaoMinutos: 45, precoCentavos: 15000 });

    expect(resposta.status).toBe(201);
    expect(resposta.body).toEqual({ id: expect.any(String), nome, duracaoMinutos: 45, precoCentavos: 15000, ativo: true });
  });

  it('POST por recepcionista sem isAdmin → 403 SEM_PERMISSAO', async () => {
    const resposta = await criar(tokenDe(contexto, recepcionista), {
      nome: nomeUnico('Clareamento'),
      duracaoMinutos: 60,
      precoCentavos: 50000,
    });

    expect(resposta.status).toBe(403);
    expect(resposta.body.erro.codigo).toBe('SEM_PERMISSAO');
  });

  it('POST com nome repetido → 409 NOME_JA_CADASTRADO', async () => {
    const existente = await criarProcedimento(contexto, { nome: nomeUnico('Canal') });

    const resposta = await criar(tokenDe(contexto, admin), { nome: existente.nome, duracaoMinutos: 90, precoCentavos: 80000 });

    expect(resposta.status).toBe(409);
    expect(resposta.body.erro.codigo).toBe('NOME_JA_CADASTRADO');
  });

  it('POST com duracaoMinutos 0 ou preço negativo → 400 ENTRADA_INVALIDA', async () => {
    const token = tokenDe(contexto, admin);

    const semDuracao = await criar(token, { nome: nomeUnico('Zero'), duracaoMinutos: 0, precoCentavos: 100 });
    const precoNegativo = await criar(token, { nome: nomeUnico('Negativo'), duracaoMinutos: 30, precoCentavos: -1 });

    expect(semDuracao.status).toBe(400);
    expect(semDuracao.body.erro.codigo).toBe('ENTRADA_INVALIDA');
    expect(precoNegativo.status).toBe(400);
    expect(precoNegativo.body.erro.codigo).toBe('ENTRADA_INVALIDA');
  });
});

describe('PATCH /api/procedimentos/{id}', () => {
  it('PATCH ativo=false some da lista do cliente', async () => {
    const procedimento = await criarProcedimento(contexto, { nome: nomeUnico('Restauração') });

    const resposta = await editar(tokenDe(contexto, admin), procedimento.id, { ativo: false });

    expect(resposta.status).toBe(200);
    expect(resposta.body.ativo).toBe(false);
    const doCliente = await listar(tokenDe(contexto, paciente));
    expect(doCliente.body.map((item: { id: string }) => item.id)).not.toContain(procedimento.id);
  });

  it('PATCH duracaoMinutos não altera o fim de consulta já marcada', async () => {
    const procedimento = await criarProcedimento(contexto, { nome: nomeUnico('Extração'), duracaoMinutos: 60 });
    const dentista = await criarFuncionario(contexto, { categoria: 'DENTISTA' });
    const inicio = new Date('2026-10-20T12:00:00Z');
    const fim = new Date('2026-10-20T13:00:00Z');
    const consulta = await contexto.prisma.consulta.create({
      data: {
        clienteId: paciente.id,
        dentistaId: dentista.id,
        procedimentoId: procedimento.id,
        inicio,
        fim,
        status: 'CONFIRMADA',
        criadoEm: contexto.relogio.agora(),
      },
    });

    const resposta = await editar(tokenDe(contexto, admin), procedimento.id, { duracaoMinutos: 90 });

    expect(resposta.status).toBe(200);
    expect(resposta.body.duracaoMinutos).toBe(90);
    const depois = await contexto.prisma.consulta.findUniqueOrThrow({ where: { id: consulta.id } });
    expect(depois.fim).toEqual(fim);
  });

  it('PATCH com nome de outro procedimento → 409 NOME_JA_CADASTRADO', async () => {
    const primeiro = await criarProcedimento(contexto, { nome: nomeUnico('Faceta') });
    const segundo = await criarProcedimento(contexto, { nome: nomeUnico('Lente') });

    const resposta = await editar(tokenDe(contexto, admin), segundo.id, { nome: primeiro.nome });

    expect(resposta.status).toBe(409);
    expect(resposta.body.erro.codigo).toBe('NOME_JA_CADASTRADO');
  });

  it('PATCH de id inexistente → 404 NAO_ENCONTRADO', async () => {
    const resposta = await editar(tokenDe(contexto, admin), randomUUID(), { ativo: false });

    expect(resposta.status).toBe(404);
    expect(resposta.body.erro.codigo).toBe('NAO_ENCONTRADO');
  });

  it('PATCH com id que não é UUID → 404 NAO_ENCONTRADO', async () => {
    const resposta = await editar(tokenDe(contexto, admin), 'nao-e-uuid', { ativo: false });

    expect(resposta.status).toBe(404);
    expect(resposta.body.erro.codigo).toBe('NAO_ENCONTRADO');
  });
});
