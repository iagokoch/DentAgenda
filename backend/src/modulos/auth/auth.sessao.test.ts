import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { criarContextoDeTeste } from '../../../testes/contexto-de-teste.ts';
import { criarFuncionario, criarPaciente, SENHA_DE_TESTE } from '../../../testes/fabricas.ts';
import { criarApp } from '../../app.ts';
import { hashDoRefreshToken, lerAccessToken } from '../../compartilhado/tokens.ts';

const contexto = criarContextoDeTeste();
const app = criarApp(contexto);
afterAll(() => contexto.prisma.$disconnect());

const DIA_EM_MINUTOS = 24 * 60;

type Sessao = { accessToken: string; refreshToken: string };

function refreshDoCookie(cabecalhos: Record<string, unknown>): string {
  const cookie = String(cabecalhos['set-cookie']);
  const valor = /dentagenda_refresh=([^;]*)/.exec(cookie)?.[1];
  if (!valor) throw new Error('resposta sem cookie de refresh');
  return valor;
}

async function logarPaciente(): Promise<Sessao & { pacienteId: string }> {
  const paciente = await criarPaciente(contexto, { nome: 'Marcos Oliveira' }, { comLogin: true });
  const resposta = await request(app).post('/api/auth/cliente/login').send({ cpf: paciente.cpf, senha: SENHA_DE_TESTE });
  return { pacienteId: paciente.id, accessToken: resposta.body.accessToken, refreshToken: refreshDoCookie(resposta.headers) };
}

const renovar = (refreshToken: string) =>
  request(app)
    .post('/api/auth/refresh')
    .set('Cookie', `dentagenda_refresh=${refreshToken}`)
    .set('X-DentAgenda-Refresh', '1');

describe('POST /api/auth/refresh', () => {
  it('refresh com cookie e cabeçalho → 200 com accessToken e cookie novo', async () => {
    const sessao = await logarPaciente();

    const resposta = await renovar(sessao.refreshToken);

    expect(resposta.status).toBe(200);
    expect(lerAccessToken(resposta.body.accessToken, contexto)).toMatchObject({ clienteId: sessao.pacienteId });
    expect(refreshDoCookie(resposta.headers)).not.toBe(sessao.refreshToken);
  });

  it('refresh sem o cabeçalho X-DentAgenda-Refresh → 401 NAO_AUTENTICADO', async () => {
    const sessao = await logarPaciente();

    const resposta = await request(app).post('/api/auth/refresh').set('Cookie', `dentagenda_refresh=${sessao.refreshToken}`);

    expect(resposta.status).toBe(401);
    expect(resposta.body.erro.codigo).toBe('NAO_AUTENTICADO');
  });

  it('refresh sem cookie → 401', async () => {
    const resposta = await request(app).post('/api/auth/refresh').set('X-DentAgenda-Refresh', '1');

    expect(resposta.status).toBe(401);
    expect(resposta.body.erro.codigo).toBe('NAO_AUTENTICADO');
  });

  it('refresh vencido (cliente +30 dias) → 401', async () => {
    const sessao = await logarPaciente();

    contexto.relogio.avancarMinutos(30 * DIA_EM_MINUTOS);
    const resposta = await renovar(sessao.refreshToken);

    expect(resposta.status).toBe(401);
  });

  it('o cookie anterior não funciona mais depois da rotação', async () => {
    const sessao = await logarPaciente();
    const rotacao = await renovar(sessao.refreshToken);

    const reuso = await renovar(sessao.refreshToken);

    expect(rotacao.status).toBe(200);
    expect(reuso.status).toBe(401);
  });

  it('reapresentar token já revogado derruba todas as sessões da conta', async () => {
    const primeira = await logarPaciente();
    const paciente = await contexto.prisma.cliente.findUniqueOrThrow({ where: { id: primeira.pacienteId } });
    const outroLogin = await request(app).post('/api/auth/cliente/login').send({ cpf: paciente.cpf, senha: SENHA_DE_TESTE });
    const segundaRefresh = refreshDoCookie(outroLogin.headers);
    await renovar(primeira.refreshToken);

    await renovar(primeira.refreshToken);
    const segunda = await renovar(segundaRefresh);

    expect(segunda.status).toBe(401);
  });

  it('access token novo carrega o sessaoId da sessão nova', async () => {
    const sessao = await logarPaciente();

    const resposta = await renovar(sessao.refreshToken);

    const sessaoNova = await contexto.prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: hashDoRefreshToken(refreshDoCookie(resposta.headers)) },
    });
    expect(lerAccessToken(resposta.body.accessToken, contexto).sessaoId).toBe(sessaoNova.id);
  });

  it('a rotação mantém o prazo da sessão original (D29)', async () => {
    const recepcionista = await criarFuncionario(contexto);
    const login = await request(app)
      .post('/api/auth/funcionario/login')
      .send({ email: recepcionista.email, senha: SENHA_DE_TESTE });
    const original = await contexto.prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: hashDoRefreshToken(refreshDoCookie(login.headers)) },
    });

    contexto.relogio.avancarMinutos(11 * 60);
    const rotacao = await renovar(refreshDoCookie(login.headers));
    contexto.relogio.avancarMinutos(61);
    const depoisDas12Horas = await renovar(refreshDoCookie(rotacao.headers));

    const nova = await contexto.prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: hashDoRefreshToken(refreshDoCookie(rotacao.headers)) },
    });
    expect(nova.expiraEm).toEqual(original.expiraEm);
    expect(depoisDas12Horas.status).toBe(401);
  });

  it('funcionário desativado não renova a sessão', async () => {
    const recepcionista = await criarFuncionario(contexto);
    const login = await request(app)
      .post('/api/auth/funcionario/login')
      .send({ email: recepcionista.email, senha: SENHA_DE_TESTE });
    await contexto.prisma.funcionario.update({ where: { id: recepcionista.id }, data: { ativo: false } });

    const resposta = await renovar(refreshDoCookie(login.headers));

    expect(resposta.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('logout → 204, revoga a sessão do sessaoId e apaga o cookie', async () => {
    const sessao = await logarPaciente();

    const resposta = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${sessao.accessToken}`);
    const refreshDepois = await renovar(sessao.refreshToken);

    expect(resposta.status).toBe(204);
    expect(String(resposta.headers['set-cookie'])).toMatch(/dentagenda_refresh=;.*Expires=Thu, 01 Jan 1970/);
    expect(refreshDepois.status).toBe(401);
  });

  it('logout sem token → 401', async () => {
    const resposta = await request(app).post('/api/auth/logout');

    expect(resposta.status).toBe(401);
    expect(resposta.body.erro.codigo).toBe('NAO_AUTENTICADO');
  });
});

describe('GET /api/auth/eu', () => {
  it('eu → 200 { usuario } de cliente e de funcionário', async () => {
    const sessao = await logarPaciente();
    const dentista = await criarFuncionario(contexto, { categoria: 'DENTISTA', nome: 'Ana Costa' });
    const loginDentista = await request(app)
      .post('/api/auth/funcionario/login')
      .send({ email: dentista.email, senha: SENHA_DE_TESTE });

    const doPaciente = await request(app).get('/api/auth/eu').set('Authorization', `Bearer ${sessao.accessToken}`);
    const doDentista = await request(app)
      .get('/api/auth/eu')
      .set('Authorization', `Bearer ${loginDentista.body.accessToken}`);

    expect(doPaciente.status).toBe(200);
    expect(doPaciente.body).toEqual({ usuario: { id: sessao.pacienteId, tipo: 'CLIENTE', nome: 'Marcos Oliveira' } });
    expect(doDentista.body).toEqual({
      usuario: { id: dentista.id, tipo: 'FUNCIONARIO', nome: 'Ana Costa', categoria: 'DENTISTA', isAdmin: false },
    });
  });
});
