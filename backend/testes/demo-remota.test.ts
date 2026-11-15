import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { carregarConfig, type Config } from '../src/config/env.ts';
import type { Contexto } from '../src/compartilhado/contexto.ts';
import { EnviadorIndisponivelDemo } from '../src/compartilhado/mensageria.ts';

const controllers = vi.hoisted(() => Object.fromEntries([
  'loginCliente', 'loginFuncionario', 'pedirRecuperacaoCliente', 'pedirRecuperacaoFuncionario',
  'confirmarRecuperacaoCliente', 'confirmarRecuperacaoFuncionario', 'pedirCodigoDeCadastro',
  'confirmarCadastro', 'renovar', 'sair', 'eu',
].map((nome) => [nome, vi.fn((_req: express.Request, res: express.Response) => res.sendStatus(204))])));
vi.mock('../src/modulos/auth/auth.controller.ts', () => ({ criarControllerAuth: () => controllers }));
import { criarRotasAuth } from '../src/modulos/auth/auth.rotas.ts';

const variaveis = () => ({
  NODE_ENV: 'production', PORTA: '3000', DATABASE_URL: 'postgresql://demo:ficticio@banco:5432/dentagenda_demo_remota',
  JWT_SEGREDO: 'a'.repeat(32), CODIGO_HMAC_SEGREDO: 'b'.repeat(32),
  ENVIADOR_MENSAGEM: 'indisponivel-demo', DEMONSTRACAO_RESTRITA: 'APENAS_DADOS_FICTICIOS_SEM_MENSAGENS',
});

describe('guardas da demonstração remota (D47)', () => {
  it('aceita somente habilitação explícita e banco exclusivo em produção', () => {
    expect(carregarConfig(variaveis()).enviadorMensagem).toBe('indisponivel-demo');
  });
  it.each([
    { DEMONSTRACAO_RESTRITA: undefined }, { DEMONSTRACAO_RESTRITA: 'true' },
    { NODE_ENV: 'development' }, { NODE_ENV: 'test' },
    { DATABASE_URL: 'postgresql://demo:ficticio@localhost:5432/dentagenda_demo_remota' },
    { DATABASE_URL: 'postgresql://demo:ficticio@banco:5432/dentagenda' },
    { DATABASE_URL: 'postgresql://demo:ficticio@banco:5432/dentagenda_demo_remota?host=externo' },
    { DATABASE_URL: 'postgresql://demo:ficticio@banco:5433/dentagenda_demo_remota' },
    { DATABASE_URL: 'postgresql://demo:ficticio@banco:5432/dentagenda_demo_remota#externo' },
    { DATABASE_URL: 'https://banco/dentagenda_demo_remota' },
  ])('recusa configuração demo fora das guardas: %j', (alteracao) => {
    expect(() => carregarConfig({ ...variaveis(), ...alteracao })).toThrow();
  });
  it('preserva a rejeição de production + log mesmo com a confirmação demo', () => {
    expect(() => carregarConfig({ ...variaveis(), ENVIADOR_MENSAGEM: 'log' })).toThrow(/ENVIADOR_MENSAGEM/);
  });
  it('preserva desenvolvimento com log sem ativar demo por uma flag isolada', () => {
    expect(carregarConfig({ ...variaveis(), NODE_ENV: 'development', ENVIADOR_MENSAGEM: 'log' }).enviadorMensagem).toBe('log');
  });
  it('não vaza a URL privada ao recusar o banco', () => {
    expect(() => carregarConfig({ ...variaveis(), DATABASE_URL: 'postgresql://segredo-privado@externo/banco' })).not.toThrow(/segredo-privado/);
  });
});

describe('enviador indisponível da demo', () => {
  it('falha sem incluir destino, mensagem ou código e sem escrever em console', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const erro = await new EnviadorIndisponivelDemo().enviar('destino-privado', 'Código 123456').catch((falha: Error) => falha);
    expect(erro).toBeInstanceOf(Error);
    expect(String(erro)).toBe('Error: Mensageria indisponível na demonstração restrita.');
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
});

describe('rotas de autenticação na demo restrita', () => {
  beforeEach(() => vi.clearAllMocks());
  const montar = (enviador: Config['enviadorMensagem']) => {
    const app = express();
    app.use('/api/auth', criarRotasAuth({ config: { enviadorMensagem: enviador } } as Contexto));
    return app;
  };
  it.each([
    '/cliente/cadastro/codigo', '/cliente/cadastro/confirmar',
    '/cliente/recuperacao/codigo', '/cliente/recuperacao/confirmar',
    '/funcionario/recuperacao/codigo', '/funcionario/recuperacao/confirmar',
  ])('bloqueia %s antes dos controllers ou serviços', async (caminho) => {
    const resposta = await request(montar('indisponivel-demo')).post(`/api/auth${caminho}`).send({});
    expect(resposta.status).toBe(503);
    expect(resposta.body).toEqual({ erro: { codigo: 'MENSAGERIA_INDISPONIVEL_DEMO', mensagem: 'Cadastro e recuperação indisponíveis nesta demonstração. Utilize uma conta de demonstração preparada.' } });
    for (const controller of Object.values(controllers)) expect(controller).not.toHaveBeenCalled();
  });
  it.each(['/cliente/login', '/funcionario/login', '/refresh'])('preserva %s', async (caminho) => {
    expect((await request(montar('indisponivel-demo')).post(`/api/auth${caminho}`)).status).toBe(204);
  });
  it('preserva emissão de código no desenvolvimento com log', async () => {
    expect((await request(montar('log')).post('/api/auth/cliente/cadastro/codigo')).status).toBe(204);
    expect(controllers.pedirCodigoDeCadastro).toHaveBeenCalledOnce();
  });
});
