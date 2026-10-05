import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { criarContextoDeTeste } from '../../../testes/contexto-de-teste.ts';
import { criarFuncionario, criarPaciente, gerarCpfValido, SENHA_DE_TESTE } from '../../../testes/fabricas.ts';
import { criarApp } from '../../app.ts';
import { lerAccessToken } from '../../compartilhado/tokens.ts';

const contexto = criarContextoDeTeste();
const app = criarApp(contexto);
afterAll(() => contexto.prisma.$disconnect());

const HORA = 60 * 60 * 1000;

// Cada tentativa um minuto depois da anterior, como numa pessoa digitando de novo.
function loginCliente(cpf: string, senha: string) {
  contexto.relogio.avancarMinutos(1);
  return request(app).post('/api/auth/cliente/login').send({ cpf, senha });
}

function loginFuncionario(email: string, senha: string) {
  contexto.relogio.avancarMinutos(1);
  return request(app).post('/api/auth/funcionario/login').send({ email, senha });
}

async function errarTresVezesCliente(cpf: string) {
  for (let tentativa = 0; tentativa < 3; tentativa++) await loginCliente(cpf, 'senha-errada-123');
}

describe('POST /api/auth/cliente/login', () => {
  it('cliente com CPF e senha certos → 200, accessToken, usuario tipo CLIENTE e cookie httpOnly SameSite=Strict no path /api/auth/refresh', async () => {
    const paciente = await criarPaciente(contexto, { nome: 'Marcos Oliveira' }, { comLogin: true });

    const resposta = await loginCliente(paciente.cpf, SENHA_DE_TESTE);

    expect(resposta.status).toBe(200);
    expect(resposta.body.usuario).toEqual({ id: paciente.id, tipo: 'CLIENTE', nome: 'Marcos Oliveira' });
    expect(lerAccessToken(resposta.body.accessToken, contexto)).toMatchObject({ tipo: 'CLIENTE', clienteId: paciente.id });
    const cookie = String(resposta.headers['set-cookie']);
    expect(cookie).toContain('dentagenda_refresh=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/api/auth/refresh');
  });

  it('CPF inexistente e senha errada → mesma resposta 401 CREDENCIAIS_INVALIDAS', async () => {
    const paciente = await criarPaciente(contexto, {}, { comLogin: true });

    const senhaErrada = await loginCliente(paciente.cpf, 'senha-errada-123');
    const cpfInexistente = await loginCliente(gerarCpfValido(), 'senha-errada-123');

    expect(senhaErrada.status).toBe(401);
    expect(senhaErrada.body.erro.codigo).toBe('CREDENCIAIS_INVALIDAS');
    expect(cpfInexistente.status).toBe(senhaErrada.status);
    expect(cpfInexistente.body).toEqual(senhaErrada.body);
  });

  it('paciente sem Login → 401 CREDENCIAIS_INVALIDAS', async () => {
    const paciente = await criarPaciente(contexto);

    const resposta = await loginCliente(paciente.cpf, SENHA_DE_TESTE);

    expect(resposta.status).toBe(401);
    expect(resposta.body.erro.codigo).toBe('CREDENCIAIS_INVALIDAS');
  });

  it('CPF com formato inválido → 400 ENTRADA_INVALIDA, sem gravar tentativa', async () => {
    const resposta = await loginCliente('529.982.247-25', SENHA_DE_TESTE);

    expect(resposta.status).toBe(400);
    expect(resposta.body.erro.codigo).toBe('ENTRADA_INVALIDA');
    expect(await contexto.prisma.tentativaLogin.count({ where: { identificador: '529.982.247-25' } })).toBe(0);
  });

  it('grava SUCESSO e FALHA em TentativaLogin, inclusive CPF inexistente', async () => {
    const paciente = await criarPaciente(contexto, {}, { comLogin: true });
    const inexistente = gerarCpfValido();

    await loginCliente(paciente.cpf, 'senha-errada-123');
    await loginCliente(paciente.cpf, SENHA_DE_TESTE);
    await loginCliente(inexistente, 'senha-errada-123');

    const tentativas = await contexto.prisma.tentativaLogin.findMany({
      where: { identificador: { in: [paciente.cpf, inexistente] } },
      orderBy: { id: 'asc' },
    });
    expect(tentativas.map((t) => [t.identificador, t.tipo, t.resultado]).sort()).toEqual(
      [
        [paciente.cpf, 'CLIENTE', 'FALHA'],
        [paciente.cpf, 'CLIENTE', 'SUCESSO'],
        [inexistente, 'CLIENTE', 'FALHA'],
      ].sort(),
    );
    expect(tentativas.every((t) => t.ip.length > 0)).toBe(true);
  });

  it('3ª falha do cliente bloqueia: senha certa depois → 423 CONTA_BLOQUEADA', async () => {
    const paciente = await criarPaciente(contexto, {}, { comLogin: true });

    await errarTresVezesCliente(paciente.cpf);
    const resposta = await loginCliente(paciente.cpf, SENHA_DE_TESTE);

    expect(resposta.status).toBe(423);
    expect(resposta.body.erro.codigo).toBe('CONTA_BLOQUEADA');
  });

  it('3ª falha do cliente revoga as sessões abertas', async () => {
    const paciente = await criarPaciente(contexto, {}, { comLogin: true });
    await loginCliente(paciente.cpf, SENHA_DE_TESTE);

    await errarTresVezesCliente(paciente.cpf);

    const sessoes = await contexto.prisma.refreshToken.findMany({ where: { login: { clienteId: paciente.id } } });
    expect(sessoes).toHaveLength(1);
    expect(sessoes[0]?.revogadoEm).not.toBeNull();
  });

  it('3 falhas em CPF inexistente também respondem 423', async () => {
    const inexistente = gerarCpfValido();
    const existente = (await criarPaciente(contexto, {}, { comLogin: true })).cpf;

    await errarTresVezesCliente(inexistente);
    await errarTresVezesCliente(existente);
    const respostaInexistente = await loginCliente(inexistente, 'senha-errada-123');
    const respostaExistente = await loginCliente(existente, 'senha-errada-123');

    expect(respostaInexistente.status).toBe(423);
    expect(respostaInexistente.body).toEqual(respostaExistente.body);
  });

  it('senha com 73 caracteres → 400 ENTRADA_INVALIDA', async () => {
    const paciente = await criarPaciente(contexto, {}, { comLogin: true });

    const resposta = await loginCliente(paciente.cpf, 'a'.repeat(73));

    expect(resposta.status).toBe(400);
    expect(resposta.body.erro.codigo).toBe('ENTRADA_INVALIDA');
  });
});

describe('POST /api/auth/funcionario/login', () => {
  it('funcionário certo → 200 com categoria e isAdmin; refresh expira em 12 h', async () => {
    const dentista = await criarFuncionario(contexto, { categoria: 'DENTISTA', isAdmin: true, nome: 'Ana Costa' });

    const resposta = await loginFuncionario(dentista.email, SENHA_DE_TESTE);

    expect(resposta.status).toBe(200);
    expect(resposta.body.usuario).toEqual({
      id: dentista.id,
      tipo: 'FUNCIONARIO',
      nome: 'Ana Costa',
      categoria: 'DENTISTA',
      isAdmin: true,
    });
    const sessao = await contexto.prisma.refreshToken.findFirstOrThrow({ where: { funcionarioId: dentista.id } });
    expect(sessao.expiraEm.getTime() - sessao.criadoEm.getTime()).toBe(12 * HORA);
  });

  it('cliente recebe refresh de 30 dias', async () => {
    const paciente = await criarPaciente(contexto, {}, { comLogin: true });

    await loginCliente(paciente.cpf, SENHA_DE_TESTE);

    const sessao = await contexto.prisma.refreshToken.findFirstOrThrow({ where: { login: { clienteId: paciente.id } } });
    expect(sessao.expiraEm.getTime() - sessao.criadoEm.getTime()).toBe(30 * 24 * HORA);
  });

  it('e-mail digitado com maiúsculas loga e registra a tentativa em minúsculas (D28)', async () => {
    const recepcionista = await criarFuncionario(contexto);

    const resposta = await loginFuncionario(recepcionista.email.toUpperCase(), SENHA_DE_TESTE);

    expect(resposta.status).toBe(200);
    expect(await contexto.prisma.tentativaLogin.count({ where: { identificador: recepcionista.email } })).toBe(1);
  });

  it('funcionário inativo com senha certa → 401 CREDENCIAIS_INVALIDAS', async () => {
    const inativo = await criarFuncionario(contexto, { ativo: false });

    const resposta = await loginFuncionario(inativo.email, SENHA_DE_TESTE);

    expect(resposta.status).toBe(401);
    expect(resposta.body.erro.codigo).toBe('CREDENCIAIS_INVALIDAS');
  });

  it('funcionário bloqueado → 423; 15 min depois loga', async () => {
    const recepcionista = await criarFuncionario(contexto);
    for (let tentativa = 0; tentativa < 3; tentativa++) await loginFuncionario(recepcionista.email, 'senha-errada-123');

    const bloqueado = await loginFuncionario(recepcionista.email, SENHA_DE_TESTE);
    contexto.relogio.avancarMinutos(15);
    const liberado = await loginFuncionario(recepcionista.email, SENHA_DE_TESTE);

    expect(bloqueado.status).toBe(423);
    expect(bloqueado.body.erro.codigo).toBe('CONTA_BLOQUEADA');
    expect(liberado.status).toBe(200);
  });
});
