import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarContextoDeTeste } from '../../../testes/contexto-de-teste.ts';
import { criarFuncionario, criarPaciente, tokenDe } from '../../../testes/fabricas.ts';
import { criarApp } from '../../app.ts';
import type { Funcionario } from '../../generated/prisma/client.ts';

const contexto = criarContextoDeTeste();
const app = criarApp(contexto);
afterAll(() => contexto.prisma.$disconnect());

let recepcionista: Funcionario;
let dentista: Funcionario;
beforeAll(async () => {
  recepcionista = await criarFuncionario(contexto, { nome: 'Carla Souza' });
  dentista = await criarFuncionario(contexto, { categoria: 'DENTISTA', nome: 'Dra. Ana' });
});

const com = (token: string) => ({ Authorization: `Bearer ${token}` });
const criar = (token: string, id: string, corpo: object) =>
  request(app).post(`/api/pacientes/${id}/alertas`).set(com(token)).send(corpo);
const listar = (token: string, id: string, consulta = '') =>
  request(app).get(`/api/pacientes/${id}/alertas${consulta}`).set(com(token));
const apagar = (token: string, id: string, alertaId: string) =>
  request(app).delete(`/api/pacientes/${id}/alertas/${alertaId}`).set(com(token));

describe('POST /api/pacientes/{id}/alertas', () => {
  it('POST pelo cliente grava autor PACIENTE sem funcionário', async () => {
    const paciente = await criarPaciente(contexto);

    const resposta = await criar(tokenDe(contexto, paciente), paciente.id, { texto: 'Alergia à Penicilina' });

    expect(resposta.status).toBe(201);
    expect(resposta.body).toMatchObject({
      texto: 'Alergia à Penicilina',
      autor: 'PACIENTE',
      funcionario: null,
      removidoEm: null,
      removidoPor: null,
    });
    expect(resposta.body.criadoEm).toBe('2026-10-05T09:00:00-03:00');
  });

  it('POST pela recepção grava autor CLINICA com o funcionário do token', async () => {
    const paciente = await criarPaciente(contexto);

    const resposta = await criar(tokenDe(contexto, recepcionista), paciente.id, { texto: 'Diabético' });

    expect(resposta.status).toBe(201);
    expect(resposta.body).toMatchObject({
      autor: 'CLINICA',
      funcionario: { id: recepcionista.id, nome: 'Carla Souza' },
    });
  });

  it('corpo com autor é ignorado: autor vem do token', async () => {
    const paciente = await criarPaciente(contexto);

    const resposta = await criar(tokenDe(contexto, paciente), paciente.id, {
      texto: 'Pressão alta',
      autor: 'CLINICA',
      autorFuncionarioId: recepcionista.id,
    });

    expect(resposta.status).toBe(201);
    expect(resposta.body.autor).toBe('PACIENTE');
    expect(resposta.body.funcionario).toBeNull();
  });

  it('POST com texto vazio ou ausente → 400', async () => {
    const paciente = await criarPaciente(contexto);

    const vazio = await criar(tokenDe(contexto, recepcionista), paciente.id, { texto: '   ' });
    const ausente = await criar(tokenDe(contexto, recepcionista), paciente.id, {});

    expect(vazio.status).toBe(400);
    expect(ausente.status).toBe(400);
    expect(ausente.body.erro.codigo).toBe('ENTRADA_INVALIDA');
  });

  it('cliente no POST de outro paciente → 404; paciente inexistente → 404', async () => {
    const eu = await criarPaciente(contexto);
    const outro = await criarPaciente(contexto);

    const alheio = await criar(tokenDe(contexto, eu), outro.id, { texto: 'x' });
    const inexistente = await criar(tokenDe(contexto, recepcionista), '5b0f6a9e-1d4c-4c53-9c1e-0c3a9f6d2b11', {
      texto: 'x',
    });

    expect(alheio.status).toBe(404);
    expect(inexistente.status).toBe(404);
    expect(await contexto.prisma.alertaCliente.count({ where: { clienteId: outro.id } })).toBe(0);
  });
});

describe('GET /api/pacientes/{id}/alertas', () => {
  it('GET lista só ativos; incluirRemovidos=true traz removidos com quem removeu', async () => {
    const paciente = await criarPaciente(contexto);
    const ativo = await criar(tokenDe(contexto, recepcionista), paciente.id, { texto: 'Alergia a látex' });
    const removido = await criar(tokenDe(contexto, recepcionista), paciente.id, { texto: 'Gestante' });
    await apagar(tokenDe(contexto, dentista), paciente.id, removido.body.id);

    const soAtivos = await listar(tokenDe(contexto, dentista), paciente.id);
    const todos = await listar(tokenDe(contexto, dentista), paciente.id, '?incluirRemovidos=true');

    expect(soAtivos.status).toBe(200);
    expect(soAtivos.body.map((alerta: { id: string }) => alerta.id)).toEqual([ativo.body.id]);
    expect(todos.body).toHaveLength(2);
    const doRemovido = todos.body.find((alerta: { id: string }) => alerta.id === removido.body.id);
    expect(doRemovido).toMatchObject({
      removidoEm: '2026-10-05T09:00:00-03:00',
      removidoPor: { id: dentista.id, nome: 'Dra. Ana' },
    });
  });

  it('cliente lista os próprios alertas; os de outro paciente → 404', async () => {
    const eu = await criarPaciente(contexto);
    const outro = await criarPaciente(contexto);
    await criar(tokenDe(contexto, recepcionista), eu.id, { texto: 'Meu alerta' });

    const proprios = await listar(tokenDe(contexto, eu), eu.id);
    const alheios = await listar(tokenDe(contexto, eu), outro.id);

    expect(proprios.status).toBe(200);
    expect(proprios.body).toHaveLength(1);
    expect(alheios.status).toBe(404);
  });

  it('GET sem login → 401', async () => {
    const paciente = await criarPaciente(contexto);

    const resposta = await request(app).get(`/api/pacientes/${paciente.id}/alertas`);

    expect(resposta.status).toBe(401);
  });
});

describe('DELETE /api/pacientes/{id}/alertas/{alertaId}', () => {
  it('DELETE pelo dentista marca removidoEm, não apaga', async () => {
    const paciente = await criarPaciente(contexto);
    const alerta = await criar(tokenDe(contexto, paciente), paciente.id, { texto: 'Alergia' });

    const resposta = await apagar(tokenDe(contexto, dentista), paciente.id, alerta.body.id);

    expect(resposta.status).toBe(204);
    const salvo = await contexto.prisma.alertaCliente.findUniqueOrThrow({ where: { id: alerta.body.id } });
    expect(salvo.removidoEm).not.toBeNull();
    expect(salvo.removidoPorFuncionarioId).toBe(dentista.id);
  });

  it('DELETE de alerta já removido → 204 e mantém quem removeu primeiro', async () => {
    const paciente = await criarPaciente(contexto);
    const alerta = await criar(tokenDe(contexto, recepcionista), paciente.id, { texto: 'Alergia' });
    await apagar(tokenDe(contexto, dentista), paciente.id, alerta.body.id);

    const segunda = await apagar(tokenDe(contexto, recepcionista), paciente.id, alerta.body.id);

    expect(segunda.status).toBe(204);
    const salvo = await contexto.prisma.alertaCliente.findUniqueOrThrow({ where: { id: alerta.body.id } });
    expect(salvo.removidoPorFuncionarioId).toBe(dentista.id);
  });

  it('DELETE pelo cliente → 403', async () => {
    const paciente = await criarPaciente(contexto);
    const alerta = await criar(tokenDe(contexto, paciente), paciente.id, { texto: 'Alergia' });

    const resposta = await apagar(tokenDe(contexto, paciente), paciente.id, alerta.body.id);

    expect(resposta.status).toBe(403);
    expect(resposta.body.erro.codigo).toBe('SEM_PERMISSAO');
    const salvo = await contexto.prisma.alertaCliente.findUniqueOrThrow({ where: { id: alerta.body.id } });
    expect(salvo.removidoEm).toBeNull();
  });

  it('DELETE de alerta de outro paciente pela URL → 404', async () => {
    const dono = await criarPaciente(contexto);
    const outro = await criarPaciente(contexto);
    const alerta = await criar(tokenDe(contexto, recepcionista), dono.id, { texto: 'Alergia' });

    const resposta = await apagar(tokenDe(contexto, recepcionista), outro.id, alerta.body.id);

    expect(resposta.status).toBe(404);
    const salvo = await contexto.prisma.alertaCliente.findUniqueOrThrow({ where: { id: alerta.body.id } });
    expect(salvo.removidoEm).toBeNull();
  });

  it('DELETE de alerta inexistente ou id malformado → 404', async () => {
    const paciente = await criarPaciente(contexto);

    const inexistente = await apagar(
      tokenDe(contexto, recepcionista),
      paciente.id,
      '5b0f6a9e-1d4c-4c53-9c1e-0c3a9f6d2b11',
    );
    const malformado = await apagar(tokenDe(contexto, recepcionista), paciente.id, 'abc');

    expect(inexistente.status).toBe(404);
    expect(malformado.status).toBe(404);
  });
});
