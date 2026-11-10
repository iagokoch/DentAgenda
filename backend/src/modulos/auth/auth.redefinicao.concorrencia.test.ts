import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { criarContextoDeTeste } from '../../../testes/contexto-de-teste.ts';
import { criarFuncionario, criarPaciente, SENHA_DE_TESTE } from '../../../testes/fabricas.ts';
import * as senhas from '../../compartilhado/senhas.ts';
import { loginCliente, loginFuncionario } from './login.service.ts';
import { confirmarRecuperacaoCliente, confirmarRecuperacaoFuncionario, pedirRecuperacaoCliente, pedirRecuperacaoFuncionario } from './recuperacao.service.ts';
import { renovarSessao } from './sessoes.ts';
import * as travas from './travas-de-autenticacao.ts';

const contexto = criarContextoDeTeste();
afterAll(() => contexto.prisma.$disconnect());
afterEach(() => vi.restoreAllMocks());

describe('login atravessando redefinição de senha', () => {
  it.each(['CLIENTE', 'FUNCIONARIO'] as const)('%s: não cria sessão com hash verificado antes do reset', async (tipo) => {
    const paciente = tipo === 'CLIENTE' ? await criarPaciente(contexto, {}, { comLogin: true }) : null;
    const funcionario = tipo === 'FUNCIONARIO' ? await criarFuncionario(contexto) : null;
    const identificador = paciente?.cpf ?? funcionario!.email;
    if (paciente) await pedirRecuperacaoCliente(contexto, identificador);
    else await pedirRecuperacaoFuncionario(contexto, identificador);
    const codigo = contexto.enviador.ultimoCodigoPara(paciente?.telefone ?? funcionario!.email);
    const verificada = Promise.withResolvers<void>();
    const continuar = Promise.withResolvers<void>();
    const conferir = senhas.conferirSenha;
    vi.spyOn(senhas, 'conferirSenha').mockImplementationOnce(async (senha, hash) => {
      const correta = await conferir(senha, hash);
      verificada.resolve();
      await continuar.promise;
      return correta;
    });
    const entrada = { senha: SENHA_DE_TESTE, ip: '127.0.0.1' };
    const resultado = (paciente
      ? loginCliente(contexto, { ...entrada, cpf: identificador })
      : loginFuncionario(contexto, { ...entrada, email: identificador }))
      .then(() => ({ sucesso: true }), (erro: unknown) => ({ erro }));
    await verificada.promise;
    try {
      const recuperacao = { codigo, novaSenha: `${SENHA_DE_TESTE}-nova`, ip: entrada.ip };
      if (paciente) await confirmarRecuperacaoCliente(contexto, { ...recuperacao, cpf: identificador });
      else await confirmarRecuperacaoFuncionario(contexto, { ...recuperacao, email: identificador });
    } finally {
      continuar.resolve();
    }
    expect(await resultado).toMatchObject({ erro: { codigo: 'CREDENCIAIS_INVALIDAS' } });
    const conta = paciente ? { login: { clienteId: paciente.id } } : { funcionarioId: funcionario!.id };
    expect(await contexto.prisma.refreshToken.count({ where: { ...conta, revogadoEm: null } })).toBe(0);
  });
});

describe('refresh e redefinição compartilham a ordem da conta', () => {
  it.each([
    ['CLIENTE', 'reset'], ['CLIENTE', 'refresh'],
    ['FUNCIONARIO', 'reset'], ['FUNCIONARIO', 'refresh'],
  ] as const)('%s: %s adquire a conta primeiro', async (tipo, primeiro) => {
    const paciente = tipo === 'CLIENTE' ? await criarPaciente(contexto, {}, { comLogin: true }) : null;
    const funcionario = tipo === 'FUNCIONARIO' ? await criarFuncionario(contexto) : null;
    const identificador = paciente?.cpf ?? funcionario!.email;
    const credenciais = { senha: SENHA_DE_TESTE, ip: '127.0.0.1' };
    const sessao = paciente
      ? await loginCliente(contexto, { ...credenciais, cpf: identificador })
      : await loginFuncionario(contexto, { ...credenciais, email: identificador });
    if (paciente) await pedirRecuperacaoCliente(contexto, identificador);
    else await pedirRecuperacaoFuncionario(contexto, identificador);
    const codigo = contexto.enviador.ultimoCodigoPara(paciente?.telefone ?? funcionario!.email);
    const entrada = { codigo, novaSenha: `${SENHA_DE_TESTE}-nova`, ip: credenciais.ip };
    const redefinir = () => paciente
      ? confirmarRecuperacaoCliente(contexto, { ...entrada, cpf: identificador })
      : confirmarRecuperacaoFuncionario(contexto, { ...entrada, email: identificador });
    const renovar = () => renovarSessao(contexto, sessao.refreshToken)
      .then(() => 'renovada', () => 'recusada');
    const adquirida = Promise.withResolvers<void>();
    const concorrente = Promise.withResolvers<void>();
    const liberar = Promise.withResolvers<void>();
    const travar = travas.travarConta;
    let chamadas = 0;
    vi.spyOn(travas, 'travarConta').mockImplementation(async (tx, conta) => {
      chamadas += 1;
      const primeira = chamadas === 1;
      if (!primeira) concorrente.resolve();
      await travar(tx, conta);
      if (primeira) {
        adquirida.resolve();
        await liberar.promise;
      }
    });
    const inicial = primeiro === 'reset' ? redefinir() : renovar();
    await adquirida.promise;
    const seguinte = primeiro === 'reset' ? renovar() : redefinir();
    try {
      await concorrente.promise;
    } finally {
      liberar.resolve();
    }
    const resultados = await Promise.all([inicial, seguinte]);
    expect(resultados[primeiro === 'reset' ? 1 : 0]).toBe(primeiro === 'reset' ? 'recusada' : 'renovada');
    const conta = paciente ? { login: { clienteId: paciente.id } } : { funcionarioId: funcionario!.id };
    expect(await contexto.prisma.refreshToken.count({ where: { ...conta, revogadoEm: null } })).toBe(0);
  });
});
