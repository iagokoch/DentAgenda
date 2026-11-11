import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { criarContextoDeTeste } from '../../../testes/contexto-de-teste.ts';
import { criarFuncionario, criarPaciente, SENHA_DE_TESTE, tokenDe } from '../../../testes/fabricas.ts';
import { criarApp } from '../../app.ts';
import { conferirSenha } from '../../compartilhado/senhas.ts';
import * as senhas from '../../compartilhado/senhas.ts';
import { editarFuncionario as editarFuncionarioNoServico } from '../funcionarios/funcionarios.service.ts';
import { confirmarRecuperacaoFuncionario, pedirRecuperacaoCliente, pedirRecuperacaoFuncionario } from './recuperacao.service.ts';
import * as travas from './travas-de-autenticacao.ts';

const contexto = criarContextoDeTeste();
const app = criarApp(contexto);
const NOVA_SENHA = 'nova-senha-dos-canais-123';
const TELEFONE_NOVO = '48987654321';

afterAll(() => contexto.prisma.$disconnect());
afterEach(() => vi.restoreAllMocks());

async function editarFuncionario(id: string, dados: object, autorizacao: string) {
  const resposta = await request(app).patch(`/api/funcionarios/${id}`).auth(autorizacao, { type: 'bearer' }).send(dados);
  expect(resposta.status).toBe(200);
}

async function editarTelefone(id: string, telefone: string, autorizacao: string) {
  const resposta = await request(app).patch(`/api/pacientes/${id}`).auth(autorizacao, { type: 'bearer' }).send({ telefone });
  expect(resposta.status).toBe(200);
}

async function pedirCodigoCliente(cpf: string, telefone: string) {
  const resposta = await request(app).post('/api/auth/cliente/recuperacao/codigo').send({ cpf });
  expect(resposta.status).toBe(202);
  return contexto.enviador.ultimoCodigoPara(telefone);
}

const confirmarCliente = (cpf: string, codigo: string) =>
  request(app).post('/api/auth/cliente/recuperacao/confirmar').send({ cpf, codigo, novaSenha: NOVA_SENHA });

describe('códigos não atravessam alterações cadastrais', () => {
  it('código emitido para A não redefine B após transferência do e-mail', async () => {
    const admin = await criarFuncionario(contexto, { isAdmin: true });
    const autorizacao = await tokenDe(contexto, admin);
    const antigo = await criarFuncionario(contexto);
    const novo = await criarFuncionario(contexto);
    await tokenDe(contexto, novo);
    await request(app).post('/api/auth/funcionario/recuperacao/codigo').send({ email: antigo.email }).expect(202);
    const codigo = contexto.enviador.ultimoCodigoPara(antigo.email);
    await editarFuncionario(antigo.id, { email: `novo-${antigo.email}` }, autorizacao);
    await editarFuncionario(novo.id, { email: antigo.email }, autorizacao);

    const resposta = await request(app).post('/api/auth/funcionario/recuperacao/confirmar')
      .send({ email: antigo.email, codigo, novaSenha: NOVA_SENHA });

    expect(resposta.status).toBe(400);
    expect(resposta.body.erro.codigo).toBe('CODIGO_INVALIDO');
    const conta = await contexto.prisma.funcionario.findUniqueOrThrow({ where: { id: novo.id } });
    expect(await conferirSenha(SENHA_DE_TESTE, conta.senhaHash)).toBe(true);
    expect(await contexto.prisma.refreshToken.count({ where: { funcionarioId: novo.id, revogadoEm: null } })).toBe(1);
  });

  it.each([false, true])('telefone anterior perde validade mesmo se restaurado: %s', async (restaurar) => {
    const recepcao = await criarFuncionario(contexto);
    const autorizacao = await tokenDe(contexto, recepcao);
    const paciente = await criarPaciente(contexto, {}, { comLogin: true });
    await tokenDe(contexto, paciente);
    const codigo = await pedirCodigoCliente(paciente.cpf, paciente.telefone);
    await editarTelefone(paciente.id, TELEFONE_NOVO, autorizacao);
    if (restaurar) await editarTelefone(paciente.id, paciente.telefone, autorizacao);

    const resposta = await confirmarCliente(paciente.cpf, codigo);

    expect(resposta.status).toBe(400);
    expect(resposta.body.erro.codigo).toBe('CODIGO_INVALIDO');
    const login = await contexto.prisma.login.findUniqueOrThrow({ where: { clienteId: paciente.id } });
    expect(await conferirSenha(SENHA_DE_TESTE, login.senhaHash)).toBe(true);
    expect(await contexto.prisma.refreshToken.count({ where: { loginId: login.id, revogadoEm: null } })).toBe(1);
  });

  it('nova emissão usa o telefone atual e permite redefinição', async () => {
    const recepcao = await criarFuncionario(contexto);
    const paciente = await criarPaciente(contexto, {}, { comLogin: true });
    await pedirCodigoCliente(paciente.cpf, paciente.telefone);
    await editarTelefone(paciente.id, TELEFONE_NOVO, await tokenDe(contexto, recepcao));

    const codigoNovo = await pedirCodigoCliente(paciente.cpf, TELEFONE_NOVO);

    expect((await confirmarCliente(paciente.cpf, codigoNovo)).status).toBe(204);
  });

  it('editar sem mudar telefone não invalida código', async () => {
    const recepcao = await criarFuncionario(contexto);
    const paciente = await criarPaciente(contexto, {}, { comLogin: true });
    const codigo = await pedirCodigoCliente(paciente.cpf, paciente.telefone);
    await editarTelefone(paciente.id, paciente.telefone, await tokenDe(contexto, recepcao));

    expect((await confirmarCliente(paciente.cpf, codigo)).status).toBe(204);
  });

  it('inativar e reativar funcionário não restaura o código anterior', async () => {
    const admin = await criarFuncionario(contexto, { isAdmin: true });
    const autorizacao = await tokenDe(contexto, admin);
    const funcionario = await criarFuncionario(contexto);
    await request(app).post('/api/auth/funcionario/recuperacao/codigo').send({ email: funcionario.email }).expect(202);
    const codigo = contexto.enviador.ultimoCodigoPara(funcionario.email);
    await editarFuncionario(funcionario.id, { ativo: false }, autorizacao);
    await editarFuncionario(funcionario.id, { ativo: true }, autorizacao);

    const resposta = await request(app).post('/api/auth/funcionario/recuperacao/confirmar')
      .send({ email: funcionario.email, codigo, novaSenha: NOVA_SENHA });

    expect(resposta.status).toBe(400);
    expect(resposta.body.erro.codigo).toBe('CODIGO_INVALIDO');
  });

  it.each([false, true])('ativação recusa telefone anterior mesmo se restaurado: %s', async (restaurar) => {
    const recepcao = await criarFuncionario(contexto);
    const autorizacao = await tokenDe(contexto, recepcao);
    const paciente = await criarPaciente(contexto);
    await request(app).post('/api/auth/cliente/cadastro/codigo').send({ cpf: paciente.cpf, telefone: paciente.telefone }).expect(202);
    const codigo = contexto.enviador.ultimoCodigoPara(paciente.telefone);
    await editarTelefone(paciente.id, TELEFONE_NOVO, autorizacao);
    if (restaurar) await editarTelefone(paciente.id, paciente.telefone, autorizacao);

    const resposta = await request(app).post('/api/auth/cliente/cadastro/confirmar')
      .send({ cpf: paciente.cpf, telefone: paciente.telefone, codigo, nome: paciente.nome, senha: NOVA_SENHA });

    expect(resposta.status).toBe(400);
    expect(resposta.body.erro.codigo).toBe('CODIGO_INVALIDO');
    expect(await contexto.prisma.login.count({ where: { clienteId: paciente.id } })).toBe(0);
  });
});

// As duas operações chegam à mesma trava real; a segunda espera o commit da primeira.
async function executarNaOrdem(primeira: () => Promise<unknown>, segunda: () => Promise<unknown>) {
  const adquirida = Promise.withResolvers<void>();
  const concorrente = Promise.withResolvers<void>();
  const liberar = Promise.withResolvers<void>();
  const travar = travas.travarCodigos;
  let chamadas = 0;
  vi.spyOn(travas, 'travarCodigos').mockImplementation(async (...args) => {
    const inicial = ++chamadas === 1;
    if (!inicial) concorrente.resolve();
    await travar(...args);
    if (inicial) {
      adquirida.resolve();
      await liberar.promise;
    }
  });
  const inicial = primeira();
  await adquirida.promise;
  const seguinte = segunda();
  try {
    await concorrente.promise;
  } finally {
    liberar.resolve();
  }
  return Promise.all([inicial, seguinte]);
}

describe('emissão e confirmação concorrendo com edição', () => {
  it.each(['emissao', 'edicao'] as const)('telefone: %s adquire a trava primeiro', async (primeira) => {
    const recepcao = await criarFuncionario(contexto);
    const autorizacao = await tokenDe(contexto, recepcao);
    const paciente = await criarPaciente(contexto, {}, { comLogin: true });
    const emitir = () => pedirRecuperacaoCliente(contexto, paciente.cpf);
    const editar = () => editarTelefone(paciente.id, TELEFONE_NOVO, autorizacao);

    await executarNaOrdem(primeira === 'emissao' ? emitir : editar, primeira === 'emissao' ? editar : emitir);

    const linha = await contexto.prisma.codigoVerificacao.findFirstOrThrow({ where: { identificador: paciente.cpf } });
    if (primeira === 'edicao') {
      expect(linha.destino).toBe(TELEFONE_NOVO);
      expect(linha.expiraEm > contexto.relogio.agora()).toBe(true);
    } else {
      expect(linha.destino).toBe(paciente.telefone);
      expect(linha.expiraEm <= contexto.relogio.agora()).toBe(true);
    }
  });

  it.each(['emissao', 'edicao'] as const)('e-mail: %s adquire a trava primeiro', async (primeira) => {
    const funcionario = await criarFuncionario(contexto);
    const emitir = () => pedirRecuperacaoFuncionario(contexto, funcionario.email);
    const editar = () => editarFuncionarioNoServico(contexto, funcionario.id, { email: `outro-${funcionario.email}` });

    await executarNaOrdem(primeira === 'emissao' ? emitir : editar, primeira === 'emissao' ? editar : emitir);

    const linha = await contexto.prisma.codigoVerificacao.findFirstOrThrow({ where: { identificador: funcionario.email } });
    if (primeira === 'edicao') expect(linha.destino).toBeNull();
    else expect(linha.expiraEm <= contexto.relogio.agora()).toBe(true);
  });

  it.each(['confirmacao', 'edicao'] as const)('recuperação: %s adquire a trava primeiro', async (primeira) => {
    const recepcao = await criarFuncionario(contexto);
    const autorizacao = await tokenDe(contexto, recepcao);
    const paciente = await criarPaciente(contexto, {}, { comLogin: true });
    const codigo = await pedirCodigoCliente(paciente.cpf, paciente.telefone);
    const confirmar = () => confirmarCliente(paciente.cpf, codigo).then((resposta) => resposta.status);
    const editar = () => editarTelefone(paciente.id, TELEFONE_NOVO, autorizacao);

    const resultados = await executarNaOrdem(primeira === 'confirmacao' ? confirmar : editar, primeira === 'confirmacao' ? editar : confirmar);

    expect(resultados[primeira === 'confirmacao' ? 0 : 1]).toBe(primeira === 'confirmacao' ? 204 : 400);
  });

  it('alteração cadastral durante bcrypt impede uso do código já apresentado', async () => {
    const funcionario = await criarFuncionario(contexto);
    await pedirRecuperacaoFuncionario(contexto, funcionario.email);
    const codigo = contexto.enviador.ultimoCodigoPara(funcionario.email);
    const calculada = Promise.withResolvers<void>();
    const liberar = Promise.withResolvers<void>();
    const gerarHash = senhas.gerarHashDeSenha;
    vi.spyOn(senhas, 'gerarHashDeSenha').mockImplementationOnce(async (senha) => {
      const hash = await gerarHash(senha);
      calculada.resolve();
      await liberar.promise;
      return hash;
    });
    const confirmacao = confirmarRecuperacaoFuncionario(contexto, {
      email: funcionario.email, codigo, novaSenha: NOVA_SENHA, ip: '127.0.0.1',
    }).then(() => 'aceita', (erro: unknown) => (erro as { codigo: string }).codigo);
    await calculada.promise;
    try {
      await editarFuncionarioNoServico(contexto, funcionario.id, { email: `outro-${funcionario.email}` });
    } finally {
      liberar.resolve();
    }

    expect(await confirmacao).toBe('CODIGO_INVALIDO');
  });

  it('tentativas erradas persistem após rollback lógico da recuperação', async () => {
    const paciente = await criarPaciente(contexto, {}, { comLogin: true });
    const codigo = await pedirCodigoCliente(paciente.cpf, paciente.telefone);
    const errado = codigo === '000000' ? '000001' : '000000';
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      expect((await confirmarCliente(paciente.cpf, errado)).status).toBe(400);
    }

    const linha = await contexto.prisma.codigoVerificacao.findFirstOrThrow({ where: { identificador: paciente.cpf } });
    expect(linha.tentativas).toBe(3);
    expect((await confirmarCliente(paciente.cpf, codigo)).status).toBe(400);
  });

  it('e-mail duplicado desfaz edição e preserva código emitido', async () => {
    const funcionario = await criarFuncionario(contexto);
    const outro = await criarFuncionario(contexto);
    await pedirRecuperacaoFuncionario(contexto, funcionario.email);
    const codigo = contexto.enviador.ultimoCodigoPara(funcionario.email);

    await expect(editarFuncionarioNoServico(contexto, funcionario.id, { email: outro.email }))
      .rejects.toMatchObject({ codigo: 'EMAIL_JA_CADASTRADO' });
    await expect(confirmarRecuperacaoFuncionario(contexto, {
      email: funcionario.email, codigo, novaSenha: NOVA_SENHA, ip: '127.0.0.1',
    })).resolves.toBeUndefined();
  });

  it.each(['ativacao', 'edicao'] as const)('ativação: %s adquire a trava primeiro', async (primeira) => {
    const recepcao = await criarFuncionario(contexto);
    const autorizacao = await tokenDe(contexto, recepcao);
    const paciente = await criarPaciente(contexto);
    await request(app).post('/api/auth/cliente/cadastro/codigo').send({ cpf: paciente.cpf, telefone: paciente.telefone }).expect(202);
    const codigo = contexto.enviador.ultimoCodigoPara(paciente.telefone);
    const ativar = () => request(app).post('/api/auth/cliente/cadastro/confirmar')
      .send({ cpf: paciente.cpf, telefone: paciente.telefone, codigo, nome: paciente.nome, senha: NOVA_SENHA })
      .then((resposta) => resposta.status);
    const editar = () => editarTelefone(paciente.id, TELEFONE_NOVO, autorizacao);

    const resultados = await executarNaOrdem(primeira === 'ativacao' ? ativar : editar, primeira === 'ativacao' ? editar : ativar);

    expect(resultados[primeira === 'ativacao' ? 0 : 1]).toBe(primeira === 'ativacao' ? 201 : 400);
    expect(await contexto.prisma.login.count({ where: { clienteId: paciente.id } })).toBe(primeira === 'ativacao' ? 1 : 0);
  });

  it.each(['confirmacao', 'edicao'] as const)('administrador: %s adquire a trava primeiro', async (primeira) => {
    const admin = await criarFuncionario(contexto, { isAdmin: true });
    await pedirRecuperacaoFuncionario(contexto, admin.email);
    const codigo = contexto.enviador.ultimoCodigoPara(admin.email);
    const confirmar = () => confirmarRecuperacaoFuncionario(contexto, {
      email: admin.email, codigo, novaSenha: NOVA_SENHA, ip: '127.0.0.1',
    }).then(() => 'aceita', (erro: unknown) => (erro as { codigo: string }).codigo);
    const editar = () => editarFuncionarioNoServico(contexto, admin.id, { email: `outro-${admin.email}` });

    const resultados = await executarNaOrdem(primeira === 'confirmacao' ? confirmar : editar, primeira === 'confirmacao' ? editar : confirmar);

    expect(resultados[primeira === 'confirmacao' ? 0 : 1]).toBe(primeira === 'confirmacao' ? 'aceita' : 'CODIGO_INVALIDO');
  });

  it.each(['confirmacao', 'inativacao'] as const)('%s adquire a trava primeiro ao inativar funcionário', async (primeira) => {
    const funcionario = await criarFuncionario(contexto);
    await tokenDe(contexto, funcionario);
    await pedirRecuperacaoFuncionario(contexto, funcionario.email);
    const codigo = contexto.enviador.ultimoCodigoPara(funcionario.email);
    const confirmar = () => confirmarRecuperacaoFuncionario(contexto, {
      email: funcionario.email, codigo, novaSenha: NOVA_SENHA, ip: '127.0.0.1',
    }).then(() => 'aceita', (erro: unknown) => (erro as { codigo: string }).codigo);
    const inativar = () => editarFuncionarioNoServico(contexto, funcionario.id, { ativo: false });

    const resultados = await executarNaOrdem(primeira === 'confirmacao' ? confirmar : inativar, primeira === 'confirmacao' ? inativar : confirmar);

    const redefinida = primeira === 'confirmacao';
    expect(resultados[redefinida ? 0 : 1]).toBe(redefinida ? 'aceita' : 'CODIGO_INVALIDO');
    const conta = await contexto.prisma.funcionario.findUniqueOrThrow({ where: { id: funcionario.id } });
    expect(conta.ativo).toBe(false);
    expect(await conferirSenha(redefinida ? NOVA_SENHA : SENHA_DE_TESTE, conta.senhaHash)).toBe(true);
    expect(await contexto.prisma.refreshToken.count({ where: { funcionarioId: funcionario.id, revogadoEm: null } })).toBe(0);
    expect(await contexto.prisma.tentativaLogin.count({
      where: { tipo: 'FUNCIONARIO', identificador: funcionario.email, resultado: 'REDEFINICAO' },
    })).toBe(redefinida ? 1 : 0);
  });

  it('alterar canal não reinicia limite de emissão', async () => {
    const recepcao = await criarFuncionario(contexto);
    const paciente = await criarPaciente(contexto, {}, { comLogin: true });
    await pedirCodigoCliente(paciente.cpf, paciente.telefone);
    await editarTelefone(paciente.id, TELEFONE_NOVO, await tokenDe(contexto, recepcao));
    await pedirCodigoCliente(paciente.cpf, TELEFONE_NOVO);
    await pedirCodigoCliente(paciente.cpf, TELEFONE_NOVO);

    const resposta = await request(app).post('/api/auth/cliente/recuperacao/codigo').send({ cpf: paciente.cpf });

    expect(resposta.status).toBe(429);
    expect(resposta.body.erro.codigo).toBe('LIMITE_DE_CODIGOS');
  });

  it('editar sem mudar e-mail preserva código', async () => {
    const funcionario = await criarFuncionario(contexto);
    await pedirRecuperacaoFuncionario(contexto, funcionario.email);
    const codigo = contexto.enviador.ultimoCodigoPara(funcionario.email);

    await editarFuncionarioNoServico(contexto, funcionario.id, { email: funcionario.email });

    await expect(confirmarRecuperacaoFuncionario(contexto, {
      email: funcionario.email, codigo, novaSenha: NOVA_SENHA, ip: '127.0.0.1',
    })).resolves.toBeUndefined();
  });

  it('guarda do último admin desfaz edição de e-mail sem invalidar o código', async () => {
    const admin = await criarFuncionario(contexto, { isAdmin: true });
    await contexto.prisma.funcionario.updateMany({ where: { isAdmin: true, id: { not: admin.id } }, data: { ativo: false } });
    await pedirRecuperacaoFuncionario(contexto, admin.email);
    const codigo = contexto.enviador.ultimoCodigoPara(admin.email);

    await expect(editarFuncionarioNoServico(contexto, admin.id, { email: `outro-${admin.email}`, ativo: false }))
      .rejects.toMatchObject({ codigo: 'ULTIMO_ADMIN' });

    await expect(confirmarRecuperacaoFuncionario(contexto, {
      email: admin.email, codigo, novaSenha: NOVA_SENHA, ip: '127.0.0.1',
    })).resolves.toBeUndefined();
  });
});
