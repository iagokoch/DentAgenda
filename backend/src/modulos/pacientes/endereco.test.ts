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
  recepcionista = await criarFuncionario(contexto);
  dentista = await criarFuncionario(contexto, { categoria: 'DENTISTA' });
});

const com = (token: string) => ({ Authorization: `Bearer ${token}` });
const gravar = (token: string, id: string, corpo: object) =>
  request(app).put(`/api/pacientes/${id}/endereco`).set(com(token)).send(corpo);
const remover = (token: string, id: string) => request(app).delete(`/api/pacientes/${id}/endereco`).set(com(token));
const ver = (token: string, id: string) => request(app).get(`/api/pacientes/${id}`).set(com(token));

const ENDERECO = {
  cep: '01001000',
  logradouro: 'Praça da Sé',
  numero: '10',
  complemento: 'Sala 2',
  bairro: 'Sé',
  cidade: 'São Paulo',
  uf: 'SP',
};

describe('PUT /api/pacientes/{id}/endereco', () => {
  it('PUT cria o endereço; segundo PUT substitui inteiro', async () => {
    const paciente = await criarPaciente(contexto);

    const primeira = await gravar(await tokenDe(contexto, recepcionista), paciente.id, ENDERECO);
    const segunda = await gravar(await tokenDe(contexto, recepcionista), paciente.id, {
      cep: '20040020',
      logradouro: 'Rua da Assembleia',
      numero: '5',
      bairro: 'Centro',
      cidade: 'Rio de Janeiro',
      uf: 'rj',
    });

    expect(primeira.status).toBe(200);
    expect(primeira.body).toEqual(ENDERECO);
    expect(segunda.status).toBe(200);
    // Substituição inteira: o complemento antigo não sobrevive; uf vai em maiúsculas.
    expect(segunda.body).toEqual({
      cep: '20040020',
      logradouro: 'Rua da Assembleia',
      numero: '5',
      complemento: null,
      bairro: 'Centro',
      cidade: 'Rio de Janeiro',
      uf: 'RJ',
    });
    expect(await contexto.prisma.enderecoCliente.count({ where: { clienteId: paciente.id } })).toBe(1);
  });

  it('PUT sem complemento é aceito; sem cep → 400', async () => {
    const paciente = await criarPaciente(contexto);
    const { complemento: _complemento, cep: _cep, ...semCep } = ENDERECO;

    const semComplemento = await gravar(await tokenDe(contexto, recepcionista), paciente.id, {
      ...semCep,
      cep: '01001000',
    });
    const comErro = await gravar(await tokenDe(contexto, recepcionista), paciente.id, semCep);

    expect(semComplemento.status).toBe(200);
    expect(comErro.status).toBe(400);
    expect(comErro.body.erro.codigo).toBe('ENTRADA_INVALIDA');
  });

  it('cliente faz PUT no próprio; no de outro → 404', async () => {
    const eu = await criarPaciente(contexto);
    const outro = await criarPaciente(contexto);

    const proprio = await gravar(await tokenDe(contexto, eu), eu.id, ENDERECO);
    const alheio = await gravar(await tokenDe(contexto, eu), outro.id, ENDERECO);

    expect(proprio.status).toBe(200);
    expect(alheio.status).toBe(404);
    expect(alheio.body.erro.codigo).toBe('NAO_ENCONTRADO');
    expect(await contexto.prisma.enderecoCliente.count({ where: { clienteId: outro.id } })).toBe(0);
  });

  it('PUT de paciente inexistente → 404', async () => {
    const resposta = await gravar(
      await tokenDe(contexto, recepcionista),
      '5b0f6a9e-1d4c-4c53-9c1e-0c3a9f6d2b11',
      ENDERECO,
    );

    expect(resposta.status).toBe(404);
  });

  it('dentista no PUT → 403', async () => {
    const paciente = await criarPaciente(contexto);

    const resposta = await gravar(await tokenDe(contexto, dentista), paciente.id, ENDERECO);

    expect(resposta.status).toBe(403);
    expect(resposta.body.erro.codigo).toBe('SEM_PERMISSAO');
  });
});

describe('DELETE /api/pacientes/{id}/endereco', () => {
  it('DELETE → 204 e GET do paciente traz endereco null', async () => {
    const paciente = await criarPaciente(contexto);
    await gravar(await tokenDe(contexto, recepcionista), paciente.id, ENDERECO);

    const resposta = await remover(await tokenDe(contexto, recepcionista), paciente.id);
    const depois = await ver(await tokenDe(contexto, recepcionista), paciente.id);

    expect(resposta.status).toBe(204);
    expect(depois.body.endereco).toBeNull();
  });

  it('DELETE de paciente sem endereço → 204', async () => {
    const paciente = await criarPaciente(contexto);

    const resposta = await remover(await tokenDe(contexto, paciente), paciente.id);

    expect(resposta.status).toBe(204);
  });

  it('cliente apaga o próprio; o de outro → 404 e nada some', async () => {
    const eu = await criarPaciente(contexto);
    const outro = await criarPaciente(contexto);
    await gravar(await tokenDe(contexto, recepcionista), outro.id, ENDERECO);

    const alheio = await remover(await tokenDe(contexto, eu), outro.id);

    expect(alheio.status).toBe(404);
    expect(await contexto.prisma.enderecoCliente.count({ where: { clienteId: outro.id } })).toBe(1);
  });

  it('dentista no DELETE → 403', async () => {
    const paciente = await criarPaciente(contexto);

    const resposta = await remover(await tokenDe(contexto, dentista), paciente.id);

    expect(resposta.status).toBe(403);
  });
});
