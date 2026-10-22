import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarContextoDeTeste } from '../../../testes/contexto-de-teste.ts';
import { criarFuncionario, criarPaciente, gerarCpfValido, SENHA_DE_TESTE, tokenDe } from '../../../testes/fabricas.ts';
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
  admin = await criarFuncionario(contexto, { isAdmin: true });
  recepcionista = await criarFuncionario(contexto);
  paciente = await criarPaciente(contexto);
});

const com = (token: string) => ({ Authorization: `Bearer ${token}` });
const listar = (token: string) => request(app).get('/api/funcionarios').set(com(token));
const criar = (token: string, corpo: object) => request(app).post('/api/funcionarios').set(com(token)).send(corpo);
const editar = (token: string, id: string, corpo: object) =>
  request(app).patch(`/api/funcionarios/${id}`).set(com(token)).send(corpo);

let sequencia = 0;
function novoFuncionario(extra: object = {}) {
  sequencia += 1;
  return {
    nome: 'Ana Costa',
    cpf: gerarCpfValido(),
    email: `ana${sequencia}@exemplo.dev`,
    categoria: 'RECEPCIONISTA',
    dataInicio: '2026-10-01',
    ...extra,
  };
}

// Deixa só o admin do teste como admin ativo, para exercitar a regra do último admin.
async function ficarComUmAdminAtivo(): Promise<Funcionario> {
  await contexto.prisma.funcionario.updateMany({ where: { id: { not: admin.id } }, data: { isAdmin: false } });
  return admin;
}

describe('GET /api/funcionarios', () => {
  it('GET /api/funcionarios por admin → lista sem senhaHash', async () => {
    const resposta = await listar(await tokenDe(contexto, admin));

    expect(resposta.status).toBe(200);
    expect(Array.isArray(resposta.body)).toBe(true);
    const doAdmin = resposta.body.find((funcionario: { id: string }) => funcionario.id === admin.id);
    expect(doAdmin).toMatchObject({ id: admin.id, nome: admin.nome, email: admin.email, isAdmin: true, ativo: true });
    for (const funcionario of resposta.body) expect(funcionario).not.toHaveProperty('senhaHash');
  });

  it('por não admin → 403', async () => {
    const resposta = await listar(await tokenDe(contexto, recepcionista));

    expect(resposta.status).toBe(403);
    expect(resposta.body.erro.codigo).toBe('SEM_PERMISSAO');
  });
});

describe('POST /api/funcionarios', () => {
  it('POST cria com senha aleatória: login com qualquer senha falha', async () => {
    const corpo = novoFuncionario();

    const resposta = await criar(await tokenDe(contexto, admin), corpo);

    expect(resposta.status).toBe(201);
    expect(resposta.body).toMatchObject({ nome: corpo.nome, email: corpo.email, categoria: 'RECEPCIONISTA', ativo: true });
    expect(resposta.body).not.toHaveProperty('senhaHash');
    for (const senha of [SENHA_DE_TESTE, 'qualquer-senha-123']) {
      const login = await request(app).post('/api/auth/funcionario/login').send({ email: corpo.email, senha });
      expect(login.status).toBe(401);
    }
  });

  it('POST DENTISTA sem cro → 422 CRO_OBRIGATORIO', async () => {
    const resposta = await criar(await tokenDe(contexto, admin), novoFuncionario({ categoria: 'DENTISTA' }));

    expect(resposta.status).toBe(422);
    expect(resposta.body.erro.codigo).toBe('CRO_OBRIGATORIO');
  });

  it('POST e-mail repetido → 409 EMAIL_JA_CADASTRADO', async () => {
    const resposta = await criar(await tokenDe(contexto, admin), novoFuncionario({ email: recepcionista.email.toUpperCase() }));

    expect(resposta.status).toBe(409);
    expect(resposta.body.erro.codigo).toBe('EMAIL_JA_CADASTRADO');
  });

  it('CPF repetido → 409 CPF_JA_CADASTRADO', async () => {
    const resposta = await criar(await tokenDe(contexto, admin), novoFuncionario({ cpf: recepcionista.cpf }));

    expect(resposta.status).toBe(409);
    expect(resposta.body.erro.codigo).toBe('CPF_JA_CADASTRADO');
  });

  it('CRO repetido → 409 CRO_JA_CADASTRADO', async () => {
    const dentista = await criarFuncionario(contexto, { categoria: 'DENTISTA' });

    const resposta = await criar(
      await tokenDe(contexto, admin),
      novoFuncionario({ categoria: 'DENTISTA', cro: dentista.cro }),
    );

    expect(resposta.status).toBe(409);
    expect(resposta.body.erro.codigo).toBe('CRO_JA_CADASTRADO');
  });

  it('POST com CPF inválido → 400', async () => {
    const resposta = await criar(await tokenDe(contexto, admin), novoFuncionario({ cpf: '11111111111' }));

    expect(resposta.status).toBe(400);
    expect(resposta.body.erro.codigo).toBe('ENTRADA_INVALIDA');
  });
});

describe('PATCH /api/funcionarios/{id}', () => {
  it('PATCH ativo=false revoga as sessões; refresh dele → 401', async () => {
    const alvo = await criarFuncionario(contexto);
    const login = await request(app).post('/api/auth/funcionario/login').send({ email: alvo.email, senha: SENHA_DE_TESTE });
    expect(login.status).toBe(200);
    const refreshToken = /dentagenda_refresh=([^;]*)/.exec(String(login.headers['set-cookie']))?.[1] ?? '';

    const resposta = await editar(await tokenDe(contexto, admin), alvo.id, { ativo: false });
    const renovacao = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `dentagenda_refresh=${refreshToken}`)
      .set('X-DentAgenda-Refresh', '1');

    expect(resposta.status).toBe(200);
    expect(resposta.body).toMatchObject({ id: alvo.id, ativo: false });
    expect(renovacao.status).toBe(401);
    const sessoes = await contexto.prisma.refreshToken.findMany({ where: { funcionarioId: alvo.id } });
    expect(sessoes.every((sessao) => sessao.revogadoEm !== null)).toBe(true);
  });

  it('PATCH tirando isAdmin do último admin ativo → 422 ULTIMO_ADMIN', async () => {
    const unico = await ficarComUmAdminAtivo();

    const resposta = await editar(await tokenDe(contexto, unico), unico.id, { isAdmin: false });

    expect(resposta.status).toBe(422);
    expect(resposta.body.erro.codigo).toBe('ULTIMO_ADMIN');
  });

  it('PATCH desativando o último admin ativo → 422 ULTIMO_ADMIN', async () => {
    const unico = await ficarComUmAdminAtivo();

    const resposta = await editar(await tokenDe(contexto, unico), unico.id, { ativo: false });

    expect(resposta.status).toBe(422);
    expect(resposta.body.erro.codigo).toBe('ULTIMO_ADMIN');
    const depois = await contexto.prisma.funcionario.findUniqueOrThrow({ where: { id: unico.id } });
    expect(depois.ativo).toBe(true);
  });

  it('PATCH tirando isAdmin quando há outro admin ativo → 200', async () => {
    const outro = await criarFuncionario(contexto, { isAdmin: true });

    const resposta = await editar(await tokenDe(contexto, admin), outro.id, { isAdmin: false });

    expect(resposta.status).toBe(200);
    expect(resposta.body.isAdmin).toBe(false);
  });

  it('PATCH categoria para DENTISTA sem cro → 422 CRO_OBRIGATORIO', async () => {
    const alvo = await criarFuncionario(contexto);

    const resposta = await editar(await tokenDe(contexto, admin), alvo.id, { categoria: 'DENTISTA' });

    expect(resposta.status).toBe(422);
    expect(resposta.body.erro.codigo).toBe('CRO_OBRIGATORIO');
  });

  it('PATCH de id inexistente → 404 NAO_ENCONTRADO', async () => {
    const resposta = await editar(await tokenDe(contexto, admin), '5b0f6a9e-1d4c-4c53-9c1e-0c3a9f6d2b11', { nome: 'Fulano' });

    expect(resposta.status).toBe(404);
    expect(resposta.body.erro.codigo).toBe('NAO_ENCONTRADO');
  });
});

describe('GET /api/dentistas', () => {
  it('GET /api/dentistas por cliente → só dentistas ativos, [{ id, nome }]', async () => {
    const ativo = await criarFuncionario(contexto, { categoria: 'DENTISTA', nome: 'Dra. Ativa' });
    const inativo = await criarFuncionario(contexto, { categoria: 'DENTISTA', nome: 'Dr. Inativo', ativo: false });

    const resposta = await request(app).get('/api/dentistas').set(com(await tokenDe(contexto, paciente)));

    expect(resposta.status).toBe(200);
    expect(resposta.body).toContainEqual({ id: ativo.id, nome: 'Dra. Ativa' });
    const ids = resposta.body.map((dentista: { id: string }) => dentista.id);
    expect(ids).not.toContain(inativo.id);
    expect(ids).not.toContain(recepcionista.id);
    for (const dentista of resposta.body) expect(Object.keys(dentista).sort()).toEqual(['id', 'nome']);
  });

  it('GET /api/dentistas sem login → 401', async () => {
    const resposta = await request(app).get('/api/dentistas');

    expect(resposta.status).toBe(401);
  });
});
