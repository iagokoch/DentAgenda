import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarContextoDeTeste } from '../../../testes/contexto-de-teste.ts';
import { criarFuncionario, criarPaciente, gerarCpfValido, tokenDe } from '../../../testes/fabricas.ts';
import { criarApp } from '../../app.ts';
import type { Funcionario } from '../../generated/prisma/client.ts';

const contexto = criarContextoDeTeste();
const app = criarApp(contexto);
afterAll(() => contexto.prisma.$disconnect());

// Criados no beforeAll: o banco é limpo antes dos testes de cada arquivo, depois do import.
let recepcionista: Funcionario;
let dentista: Funcionario;
beforeAll(async () => {
  recepcionista = await criarFuncionario(contexto);
  dentista = await criarFuncionario(contexto, { categoria: 'DENTISTA' });
});

const com = (token: string) => ({ Authorization: `Bearer ${token}` });
const buscar = (token: string, consulta = '') =>
  request(app).get(`/api/pacientes${consulta}`).set(com(token));
const cadastrar = (token: string, corpo: object) => request(app).post('/api/pacientes').set(com(token)).send(corpo);
const ver = (token: string, id: string) => request(app).get(`/api/pacientes/${id}`).set(com(token));
const editar = (token: string, id: string, corpo: object) =>
  request(app).patch(`/api/pacientes/${id}`).set(com(token)).send(corpo);

const novoPaciente = (extra: object = {}) => ({
  nome: 'Marcos Oliveira',
  cpf: gerarCpfValido(),
  telefone: '11987654321',
  ...extra,
});

const ENDERECO = {
  cep: '01001000',
  logradouro: 'Praça da Sé',
  numero: '10',
  complemento: null,
  bairro: 'Sé',
  cidade: 'São Paulo',
  uf: 'SP',
};

describe('GET /api/pacientes', () => {
  it('busca "jose" acha "José da Silva"', async () => {
    const jose = await criarPaciente(contexto, { nome: 'José da Silva' });

    const resposta = await buscar(await tokenDe(contexto, recepcionista), '?busca=jose');

    expect(resposta.status).toBe(200);
    const ids = resposta.body.itens.map((item: { id: string }) => item.id);
    expect(ids).toContain(jose.id);
    expect(resposta.body.itens.find((item: { id: string }) => item.id === jose.id)).toEqual({
      id: jose.id,
      nome: 'José da Silva',
      cpf: jose.cpf,
      telefone: jose.telefone,
    });
  });

  it('busca por CPF exato', async () => {
    const alvo = await criarPaciente(contexto, { nome: 'Fulana de Tal' });
    await criarPaciente(contexto, { nome: 'Outra Pessoa' });

    const resposta = await buscar(await tokenDe(contexto, dentista), `?busca=${alvo.cpf}`);

    expect(resposta.status).toBe(200);
    expect(resposta.body.itens.map((item: { id: string }) => item.id)).toEqual([alvo.id]);
    expect(resposta.body.total).toBe(1);
  });

  it('busca paginada devolve { itens, total }', async () => {
    for (const sufixo of ['A', 'B', 'C']) await criarPaciente(contexto, { nome: `Paginado ${sufixo}` });

    const resposta = await buscar(await tokenDe(contexto, recepcionista), '?busca=paginado&pagina=2&porPagina=2');

    expect(resposta.status).toBe(200);
    expect(resposta.body.total).toBe(3);
    expect(resposta.body.itens.map((item: { nome: string }) => item.nome)).toEqual(['Paginado C']);
  });

  it('busca com % ou _ não vira curinga', async () => {
    await criarPaciente(contexto, { nome: 'Curinga Teste' });

    const resposta = await buscar(await tokenDe(contexto, recepcionista), '?busca=%25');

    expect(resposta.status).toBe(200);
    expect(resposta.body.itens).toEqual([]);
    expect(resposta.body.total).toBe(0);
  });

  it('busca por cliente → 403', async () => {
    const paciente = await criarPaciente(contexto);

    const resposta = await buscar(await tokenDe(contexto, paciente));

    expect(resposta.status).toBe(403);
    expect(resposta.body.erro.codigo).toBe('SEM_PERMISSAO');
  });

  it('busca sem login → 401', async () => {
    const resposta = await request(app).get('/api/pacientes');

    expect(resposta.status).toBe(401);
  });
});

describe('POST /api/pacientes', () => {
  it('POST pela recepção cria só Cliente, sem Login; pacienteDesde ausente = hoje', async () => {
    const corpo = novoPaciente();

    const resposta = await cadastrar(await tokenDe(contexto, recepcionista), corpo);

    expect(resposta.status).toBe(201);
    expect(resposta.body).toMatchObject({
      nome: corpo.nome,
      cpf: corpo.cpf,
      telefone: corpo.telefone,
      email: null,
      nascimento: null,
      convenio: null,
      pacienteDesde: '2026-10-05',
      endereco: null,
      temLogin: false,
    });
    const login = await contexto.prisma.login.findUnique({ where: { clienteId: resposta.body.id } });
    expect(login).toBeNull();
  });

  it('POST com endereco cria EnderecoCliente', async () => {
    const resposta = await cadastrar(
      await tokenDe(contexto, recepcionista),
      novoPaciente({ endereco: ENDERECO, email: 'MARCOS@Email.com', nascimento: '1985-05-15', convenio: 'Unimed Odonto' }),
    );

    expect(resposta.status).toBe(201);
    expect(resposta.body.endereco).toEqual(ENDERECO);
    expect(resposta.body).toMatchObject({ email: 'marcos@email.com', nascimento: '1985-05-15', convenio: 'Unimed Odonto' });
    const salvo = await contexto.prisma.enderecoCliente.findUnique({ where: { clienteId: resposta.body.id } });
    expect(salvo?.cidade).toBe('São Paulo');
  });

  it('POST com pacienteDesde informado usa a data enviada', async () => {
    const resposta = await cadastrar(await tokenDe(contexto, recepcionista), novoPaciente({ pacienteDesde: '2019-03-01' }));

    expect(resposta.status).toBe(201);
    expect(resposta.body.pacienteDesde).toBe('2019-03-01');
  });

  it('POST com CPF repetido → 409 CPF_JA_CADASTRADO', async () => {
    const existente = await criarPaciente(contexto);

    const resposta = await cadastrar(await tokenDe(contexto, recepcionista), novoPaciente({ cpf: existente.cpf }));

    expect(resposta.status).toBe(409);
    expect(resposta.body.erro.codigo).toBe('CPF_JA_CADASTRADO');
  });

  it('POST com CPF inválido ou telefone sem DDD → 400', async () => {
    const comCpfInvalido = await cadastrar(await tokenDe(contexto, recepcionista), novoPaciente({ cpf: '11111111111' }));
    const comTelefoneCurto = await cadastrar(await tokenDe(contexto, recepcionista), novoPaciente({ telefone: '987654321' }));

    expect(comCpfInvalido.status).toBe(400);
    expect(comTelefoneCurto.status).toBe(400);
    expect(comCpfInvalido.body.erro.codigo).toBe('ENTRADA_INVALIDA');
  });

  it('POST com endereco sem cidade → 400', async () => {
    const { cidade: _cidade, ...semCidade } = ENDERECO;

    const resposta = await cadastrar(await tokenDe(contexto, recepcionista), novoPaciente({ endereco: semCidade }));

    expect(resposta.status).toBe(400);
    expect(resposta.body.erro.codigo).toBe('ENTRADA_INVALIDA');
  });

  it('POST por dentista ou cliente → 403', async () => {
    const paciente = await criarPaciente(contexto);

    const doDentista = await cadastrar(await tokenDe(contexto, dentista), novoPaciente());
    const doCliente = await cadastrar(await tokenDe(contexto, paciente), novoPaciente());

    expect(doDentista.status).toBe(403);
    expect(doCliente.status).toBe(403);
  });
});

describe('GET /api/pacientes/{id}', () => {
  it('GET por dentista → 200 com endereco e temLogin', async () => {
    const paciente = await criarPaciente(contexto, {}, { comLogin: true });
    await contexto.prisma.enderecoCliente.create({ data: { clienteId: paciente.id, ...ENDERECO } });

    const resposta = await ver(await tokenDe(contexto, dentista), paciente.id);

    expect(resposta.status).toBe(200);
    expect(resposta.body).toMatchObject({ id: paciente.id, cpf: paciente.cpf, endereco: ENDERECO, temLogin: true });
    expect(resposta.body).toHaveProperty('criadoEm');
  });

  it('GET do próprio cadastro pelo cliente → 200', async () => {
    const paciente = await criarPaciente(contexto);

    const resposta = await ver(await tokenDe(contexto, paciente), paciente.id);

    expect(resposta.status).toBe(200);
    expect(resposta.body.id).toBe(paciente.id);
  });

  it('GET de outro paciente pelo cliente → 404 NAO_ENCONTRADO', async () => {
    const eu = await criarPaciente(contexto);
    const outro = await criarPaciente(contexto);

    const resposta = await ver(await tokenDe(contexto, eu), outro.id);

    expect(resposta.status).toBe(404);
    expect(resposta.body.erro.codigo).toBe('NAO_ENCONTRADO');
  });

  it('GET de id inexistente ou malformado → 404', async () => {
    const inexistente = await ver(await tokenDe(contexto, recepcionista), '5b0f6a9e-1d4c-4c53-9c1e-0c3a9f6d2b11');
    const malformado = await ver(await tokenDe(contexto, recepcionista), 'abc');

    expect(inexistente.status).toBe(404);
    expect(malformado.status).toBe(404);
  });
});

describe('PATCH /api/pacientes/{id}', () => {
  it('PATCH pela recepção muda nome, telefone e pacienteDesde', async () => {
    const paciente = await criarPaciente(contexto);

    const resposta = await editar(await tokenDe(contexto, recepcionista), paciente.id, {
      nome: 'Nome Novo',
      telefone: '11912345678',
      pacienteDesde: '2020-01-02',
    });

    expect(resposta.status).toBe(200);
    expect(resposta.body).toMatchObject({ nome: 'Nome Novo', telefone: '11912345678', pacienteDesde: '2020-01-02' });
  });

  it('PATCH pelo cliente muda email, convenio e nascimento', async () => {
    const paciente = await criarPaciente(contexto);

    const resposta = await editar(await tokenDe(contexto, paciente), paciente.id, {
      email: 'Novo@Email.com',
      convenio: 'Amil',
      nascimento: '1990-02-03',
    });

    expect(resposta.status).toBe(200);
    expect(resposta.body).toMatchObject({ email: 'novo@email.com', convenio: 'Amil', nascimento: '1990-02-03' });
  });

  it('PATCH com null limpa convenio (volta a particular)', async () => {
    const paciente = await criarPaciente(contexto, { convenio: 'Amil' });

    const resposta = await editar(await tokenDe(contexto, paciente), paciente.id, { convenio: null });

    expect(resposta.status).toBe(200);
    expect(resposta.body.convenio).toBeNull();
  });

  it('PATCH pelo cliente com telefone → 403 CAMPO_NAO_EDITAVEL', async () => {
    const paciente = await criarPaciente(contexto);

    const resposta = await editar(await tokenDe(contexto, paciente), paciente.id, { telefone: '11912345678' });

    expect(resposta.status).toBe(403);
    expect(resposta.body.erro.codigo).toBe('CAMPO_NAO_EDITAVEL');
    const depois = await contexto.prisma.cliente.findUniqueOrThrow({ where: { id: paciente.id } });
    expect(depois.telefone).toBe(paciente.telefone);
  });

  it('PATCH com cpf → 422 CPF_IMUTAVEL, inclusive para o cliente', async () => {
    const paciente = await criarPaciente(contexto);

    const doCliente = await editar(await tokenDe(contexto, paciente), paciente.id, { cpf: gerarCpfValido() });
    const daRecepcao = await editar(await tokenDe(contexto, recepcionista), paciente.id, { cpf: gerarCpfValido() });

    expect(doCliente.status).toBe(422);
    expect(doCliente.body.erro.codigo).toBe('CPF_IMUTAVEL');
    expect(daRecepcao.status).toBe(422);
    expect(daRecepcao.body.erro.codigo).toBe('CPF_IMUTAVEL');
  });

  it('PATCH pelo dentista → 403', async () => {
    const paciente = await criarPaciente(contexto);

    const resposta = await editar(await tokenDe(contexto, dentista), paciente.id, { nome: 'Outro' });

    expect(resposta.status).toBe(403);
    expect(resposta.body.erro.codigo).toBe('SEM_PERMISSAO');
  });

  it('PATCH do cadastro de outro paciente pelo cliente → 404', async () => {
    const eu = await criarPaciente(contexto);
    const outro = await criarPaciente(contexto);

    const resposta = await editar(await tokenDe(contexto, eu), outro.id, { convenio: 'Amil' });

    expect(resposta.status).toBe(404);
  });

  it('PATCH de paciente inexistente → 404', async () => {
    const resposta = await editar(await tokenDe(contexto, recepcionista), '5b0f6a9e-1d4c-4c53-9c1e-0c3a9f6d2b11', {
      nome: 'Fulano',
    });

    expect(resposta.status).toBe(404);
  });

  it('PATCH com nome vazio → 400', async () => {
    const paciente = await criarPaciente(contexto);

    const resposta = await editar(await tokenDe(contexto, recepcionista), paciente.id, { nome: '  ' });

    expect(resposta.status).toBe(400);
  });
});
