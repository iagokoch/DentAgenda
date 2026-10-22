import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { criarContextoDeTeste } from '../../testes/contexto-de-teste.ts';
import { criarFuncionario, criarPaciente, tokenDe } from '../../testes/fabricas.ts';
import { autenticar, exigirPapel } from './autenticacao.ts';
import { criarMiddlewareDeErro } from './middleware-de-erro.ts';
import { gerarAccessToken } from './tokens.ts';

const contexto = criarContextoDeTeste();
afterAll(() => contexto.prisma.$disconnect());

const app = express();
app.get('/admin', autenticar(contexto), exigirPapel('A'), (_req, res) => {
  res.json({ ok: true });
});
app.get('/dentista', autenticar(contexto), exigirPapel('D'), (_req, res) => {
  res.json({ ok: true });
});
app.get('/qualquer-conta', autenticar(contexto), exigirPapel('R', 'D', 'C'), (_req, res) => {
  res.json({ ok: true });
});
app.use(criarMiddlewareDeErro(contexto.logger));

const comToken = (caminho: string, token: string) => request(app).get(caminho).set('Authorization', `Bearer ${token}`);

function sessaoDoToken(token: string): string {
  const carga = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()) as { sessaoId: string };
  return carga.sessaoId;
}

// AUD-005: o access token vale 15 min, mas a conta e a sessão são conferidas no banco a cada pedido.
describe('sessão e conta conferidas no banco', () => {
  it('funcionário desativado perde o acesso com o token que já tinha', async () => {
    const admin = await criarFuncionario(contexto, { isAdmin: true });
    const token = await tokenDe(contexto, admin);
    expect((await comToken('/admin', token)).status).toBe(200);

    await contexto.prisma.funcionario.update({ where: { id: admin.id }, data: { ativo: false } });
    const resposta = await comToken('/admin', token);

    expect(resposta.status).toBe(401);
    expect(resposta.body.erro.codigo).toBe('NAO_AUTENTICADO');
  });

  it('admin rebaixado perde a rota de admin com o token que já tinha', async () => {
    const admin = await criarFuncionario(contexto, { isAdmin: true });
    const token = await tokenDe(contexto, admin);

    await contexto.prisma.funcionario.update({ where: { id: admin.id }, data: { isAdmin: false } });
    const resposta = await comToken('/admin', token);

    expect(resposta.status).toBe(403);
    expect(resposta.body.erro.codigo).toBe('SEM_PERMISSAO');
  });

  it('categoria trocada no banco vale no pedido seguinte', async () => {
    const dentista = await criarFuncionario(contexto, { categoria: 'DENTISTA' });
    const token = await tokenDe(contexto, dentista);
    expect((await comToken('/dentista', token)).status).toBe(200);

    await contexto.prisma.funcionario.update({ where: { id: dentista.id }, data: { categoria: 'RECEPCIONISTA', cro: null } });
    const resposta = await comToken('/dentista', token);

    expect(resposta.status).toBe(403);
  });

  it('sessão revogada (logout ou suspeita de roubo) derruba o token na hora, de funcionário e de paciente', async () => {
    const recepcionista = await criarFuncionario(contexto);
    const paciente = await criarPaciente(contexto);
    const tokens = [await tokenDe(contexto, recepcionista), await tokenDe(contexto, paciente)];
    for (const token of tokens) expect((await comToken('/qualquer-conta', token)).status).toBe(200);

    for (const token of tokens) {
      await contexto.prisma.refreshToken.update({
        where: { id: sessaoDoToken(token) },
        data: { revogadoEm: contexto.relogio.agora() },
      });
      const resposta = await comToken('/qualquer-conta', token);

      expect(resposta.status).toBe(401);
      expect(resposta.body.erro.codigo).toBe('NAO_AUTENTICADO');
    }
  });

  it('token com sessaoId que não existe → 401', async () => {
    const recepcionista = await criarFuncionario(contexto);
    const token = gerarAccessToken(
      {
        tipo: 'FUNCIONARIO',
        funcionarioId: recepcionista.id,
        categoria: 'RECEPCIONISTA',
        isAdmin: false,
        sessaoId: randomUUID(),
      },
      contexto,
    );

    expect((await comToken('/qualquer-conta', token)).status).toBe(401);
  });

  it('token com sessaoId de outra conta → 401', async () => {
    const dono = await criarFuncionario(contexto);
    const outro = await criarFuncionario(contexto);
    const sessaoDoOutro = sessaoDoToken(await tokenDe(contexto, outro));
    const token = gerarAccessToken(
      { tipo: 'FUNCIONARIO', funcionarioId: dono.id, categoria: 'RECEPCIONISTA', isAdmin: false, sessaoId: sessaoDoOutro },
      contexto,
    );

    expect((await comToken('/qualquer-conta', token)).status).toBe(401);
  });

  it('sessaoId que não é UUID → 401, não 500', async () => {
    const recepcionista = await criarFuncionario(contexto);
    const token = gerarAccessToken(
      { tipo: 'FUNCIONARIO', funcionarioId: recepcionista.id, categoria: 'RECEPCIONISTA', isAdmin: false, sessaoId: 'abc' },
      contexto,
    );

    expect((await comToken('/qualquer-conta', token)).status).toBe(401);
  });
});
