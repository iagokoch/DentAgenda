import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { criarContextoDeTeste } from '../../../testes/contexto-de-teste.ts';
import { criarFuncionario, criarPaciente, gerarCpfValido, SENHA_DE_TESTE } from '../../../testes/fabricas.ts';
import { criarApp } from '../../app.ts';

const contexto = criarContextoDeTeste();
const app = criarApp(contexto);
afterAll(() => contexto.prisma.$disconnect());

const MENSAGEM_PADRAO = 'Se os dados estiverem corretos, enviamos um código.';
const NOVA_SENHA = 'outra-senha-boa-456';

const pedirCodigoCliente = (cpf: string) => request(app).post('/api/auth/cliente/recuperacao/codigo').send({ cpf });
const confirmarCliente = (cpf: string, codigo: string, novaSenha = NOVA_SENHA) =>
  request(app).post('/api/auth/cliente/recuperacao/confirmar').send({ cpf, codigo, novaSenha });

function loginCliente(cpf: string, senha: string) {
  contexto.relogio.avancarMinutos(1);
  return request(app).post('/api/auth/cliente/login').send({ cpf, senha });
}

describe('recuperação de senha do cliente', () => {
  it('cliente: pedido → 202 com a mensagem padrão e SMS no telefone cadastrado', async () => {
    const paciente = await criarPaciente(contexto, {}, { comLogin: true });

    const resposta = await pedirCodigoCliente(paciente.cpf);

    expect(resposta.status).toBe(202);
    expect(resposta.body).toEqual({ mensagem: MENSAGEM_PADRAO });
    expect(contexto.enviador.ultimoCodigoPara(paciente.telefone)).toMatch(/^\d{6}$/);
  });

  it('CPF inexistente → mesma resposta 202, grava linha sem envio', async () => {
    const cpf = gerarCpfValido();
    const enviadasAntes = contexto.enviador.mensagens.length;

    const resposta = await pedirCodigoCliente(cpf);

    expect(resposta.status).toBe(202);
    expect(resposta.body).toEqual({ mensagem: MENSAGEM_PADRAO });
    expect(contexto.enviador.mensagens).toHaveLength(enviadasAntes);
    const linha = await contexto.prisma.codigoVerificacao.findFirstOrThrow({ where: { identificador: cpf } });
    expect(linha.destino).toBeNull();
  });

  it('paciente sem Login → mesma resposta, sem envio', async () => {
    const paciente = await criarPaciente(contexto);

    const resposta = await pedirCodigoCliente(paciente.cpf);

    expect(resposta.status).toBe(202);
    expect(resposta.body).toEqual({ mensagem: MENSAGEM_PADRAO });
    expect(contexto.enviador.mensagens.some((mensagem) => mensagem.destino === paciente.telefone)).toBe(false);
  });

  it('4º pedido na mesma hora → 429 LIMITE_DE_CODIGOS', async () => {
    const paciente = await criarPaciente(contexto, {}, { comLogin: true });
    for (let pedido = 0; pedido < 3; pedido++) await pedirCodigoCliente(paciente.cpf);

    const resposta = await pedirCodigoCliente(paciente.cpf);

    expect(resposta.status).toBe(429);
    expect(resposta.body.erro.codigo).toBe('LIMITE_DE_CODIGOS');
  });

  it('confirmar com código certo → 204; login com a senha nova funciona', async () => {
    const paciente = await criarPaciente(contexto, {}, { comLogin: true });
    await pedirCodigoCliente(paciente.cpf);

    const resposta = await confirmarCliente(paciente.cpf, contexto.enviador.ultimoCodigoPara(paciente.telefone));

    expect(resposta.status).toBe(204);
    expect((await loginCliente(paciente.cpf, NOVA_SENHA)).status).toBe(200);
    expect((await loginCliente(paciente.cpf, SENHA_DE_TESTE)).status).toBe(401);
  });

  it('confirmar grava REDEFINICAO e desbloqueia cliente bloqueado', async () => {
    const paciente = await criarPaciente(contexto, {}, { comLogin: true });
    for (let falha = 0; falha < 3; falha++) await loginCliente(paciente.cpf, 'senha-errada-123');
    await pedirCodigoCliente(paciente.cpf);

    await confirmarCliente(paciente.cpf, contexto.enviador.ultimoCodigoPara(paciente.telefone));

    const redefinicao = await contexto.prisma.tentativaLogin.count({
      where: { identificador: paciente.cpf, tipo: 'CLIENTE', resultado: 'REDEFINICAO' },
    });
    expect(redefinicao).toBe(1);
    expect((await loginCliente(paciente.cpf, NOVA_SENHA)).status).toBe(200);
  });

  it('confirmar revoga todas as sessões', async () => {
    const paciente = await criarPaciente(contexto, {}, { comLogin: true });
    await loginCliente(paciente.cpf, SENHA_DE_TESTE);
    await loginCliente(paciente.cpf, SENHA_DE_TESTE);
    await pedirCodigoCliente(paciente.cpf);

    await confirmarCliente(paciente.cpf, contexto.enviador.ultimoCodigoPara(paciente.telefone));

    const abertas = await contexto.prisma.refreshToken.count({
      where: { login: { clienteId: paciente.id }, revogadoEm: null },
    });
    expect(abertas).toBe(0);
  });

  it('confirmar com código errado → 400 CODIGO_INVALIDO', async () => {
    const paciente = await criarPaciente(contexto, {}, { comLogin: true });
    await pedirCodigoCliente(paciente.cpf);
    const certo = contexto.enviador.ultimoCodigoPara(paciente.telefone);

    const resposta = await confirmarCliente(paciente.cpf, certo === '000000' ? '000001' : '000000');

    expect(resposta.status).toBe(400);
    expect(resposta.body.erro.codigo).toBe('CODIGO_INVALIDO');
  });

  it('novaSenha com 7 caracteres → 400 ENTRADA_INVALIDA', async () => {
    const paciente = await criarPaciente(contexto, {}, { comLogin: true });
    await pedirCodigoCliente(paciente.cpf);

    const resposta = await confirmarCliente(paciente.cpf, contexto.enviador.ultimoCodigoPara(paciente.telefone), '1234567');

    expect(resposta.status).toBe(400);
    expect(resposta.body.erro.codigo).toBe('ENTRADA_INVALIDA');
  });
});

describe('recuperação de senha do funcionário', () => {
  it('funcionário: código vai para o e-mail', async () => {
    const recepcionista = await criarFuncionario(contexto);

    const resposta = await request(app)
      .post('/api/auth/funcionario/recuperacao/codigo')
      .send({ email: recepcionista.email.toUpperCase() });

    expect(resposta.status).toBe(202);
    expect(contexto.enviador.ultimoCodigoPara(recepcionista.email)).toMatch(/^\d{6}$/);
  });

  it('funcionário inativo → 202 sem envio', async () => {
    const inativo = await criarFuncionario(contexto, { ativo: false });

    const resposta = await request(app).post('/api/auth/funcionario/recuperacao/codigo').send({ email: inativo.email });

    expect(resposta.status).toBe(202);
    expect(resposta.body).toEqual({ mensagem: MENSAGEM_PADRAO });
    expect(contexto.enviador.mensagens.some((mensagem) => mensagem.destino === inativo.email)).toBe(false);
  });

  it('funcionário confirma e loga com a senha nova', async () => {
    const recepcionista = await criarFuncionario(contexto);
    await request(app).post('/api/auth/funcionario/recuperacao/codigo').send({ email: recepcionista.email });

    const resposta = await request(app)
      .post('/api/auth/funcionario/recuperacao/confirmar')
      .send({ email: recepcionista.email, codigo: contexto.enviador.ultimoCodigoPara(recepcionista.email), novaSenha: NOVA_SENHA });
    const login = await request(app)
      .post('/api/auth/funcionario/login')
      .send({ email: recepcionista.email, senha: NOVA_SENHA });

    expect(resposta.status).toBe(204);
    expect(login.status).toBe(200);
  });
});
