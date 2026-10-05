import express from 'express';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { criarContextoDeTeste } from '../../testes/contexto-de-teste.ts';
import { criarFuncionario, SENHA_DE_TESTE, tokenDe } from '../../testes/fabricas.ts';
import { autenticar, exigirPapel } from './autenticacao.ts';
import { criarMiddlewareDeErro } from './middleware-de-erro.ts';
import { conferirSenha, gerarHashDeSenha } from './senhas.ts';

const contexto = criarContextoDeTeste();
afterAll(() => contexto.prisma.$disconnect());

const app = express();
app.get('/recepcao-ou-cliente', autenticar(contexto), exigirPapel('R', 'C'), (_req, res) => {
  res.json({ ok: true });
});
app.get('/admin', autenticar(contexto), exigirPapel('A'), (_req, res) => {
  res.json({ ok: true });
});
app.use(criarMiddlewareDeErro(contexto.logger));

const comToken = (caminho: string, token: string) => request(app).get(caminho).set('Authorization', `Bearer ${token}`);

describe('autenticação e papéis', () => {
  it('sem Authorization → 401 NAO_AUTENTICADO', async () => {
    const resposta = await request(app).get('/recepcao-ou-cliente');

    expect(resposta.status).toBe(401);
    expect(resposta.body.erro.codigo).toBe('NAO_AUTENTICADO');
  });

  it('token com assinatura de outro segredo → 401', async () => {
    const recepcionista = await criarFuncionario(contexto, { categoria: 'RECEPCIONISTA' });
    const outroSegredo = { ...contexto, config: { ...contexto.config, jwtSegredo: 'outro-segredo-'.repeat(4) } };

    const resposta = await comToken('/recepcao-ou-cliente', tokenDe(outroSegredo, recepcionista));

    expect(resposta.status).toBe(401);
    expect(resposta.body.erro.codigo).toBe('NAO_AUTENTICADO');
  });

  it('token vencido (relógio +16 min) → 401', async () => {
    const recepcionista = await criarFuncionario(contexto, { categoria: 'RECEPCIONISTA' });
    const token = tokenDe(contexto, recepcionista);

    contexto.relogio.avancarMinutos(16);
    const resposta = await comToken('/recepcao-ou-cliente', token);
    contexto.relogio.avancarMinutos(-16);

    expect(resposta.status).toBe(401);
    expect(resposta.body.erro.codigo).toBe('NAO_AUTENTICADO');
  });

  it('token ainda válido com 14 min → 200', async () => {
    const recepcionista = await criarFuncionario(contexto, { categoria: 'RECEPCIONISTA' });
    const token = tokenDe(contexto, recepcionista);

    contexto.relogio.avancarMinutos(14);
    const resposta = await comToken('/recepcao-ou-cliente', token);
    contexto.relogio.avancarMinutos(-14);

    expect(resposta.status).toBe(200);
  });

  it('dentista em rota de R e C → 403 SEM_PERMISSAO', async () => {
    const dentista = await criarFuncionario(contexto, { categoria: 'DENTISTA' });

    const resposta = await comToken('/recepcao-ou-cliente', tokenDe(contexto, dentista));

    expect(resposta.status).toBe(403);
    expect(resposta.body.erro.codigo).toBe('SEM_PERMISSAO');
  });

  it('recepcionista com isAdmin passa em rota A', async () => {
    const admin = await criarFuncionario(contexto, { categoria: 'RECEPCIONISTA', isAdmin: true });

    const resposta = await comToken('/admin', tokenDe(contexto, admin));

    expect(resposta.status).toBe(200);
  });

  it('dentista sem isAdmin em rota A → 403', async () => {
    const dentista = await criarFuncionario(contexto, { categoria: 'DENTISTA' });

    const resposta = await comToken('/admin', tokenDe(contexto, dentista));

    expect(resposta.status).toBe(403);
    expect(resposta.body.erro.codigo).toBe('SEM_PERMISSAO');
  });

  it('conferirSenha aceita a senha certa e recusa a errada', async () => {
    const hash = await gerarHashDeSenha(SENHA_DE_TESTE);

    expect(hash).toHaveLength(60);
    expect(await conferirSenha(SENHA_DE_TESTE, hash)).toBe(true);
    expect(await conferirSenha('senha-errada', hash)).toBe(false);
  });
});
