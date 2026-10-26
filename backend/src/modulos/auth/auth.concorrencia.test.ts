import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { criarContextoDeTeste, INSTANTE_INICIAL_DOS_TESTES } from '../../../testes/contexto-de-teste.ts';
import { criarFuncionario, criarPaciente, gerarCpfValido, SENHA_DE_TESTE } from '../../../testes/fabricas.ts';
import { criarApp } from '../../app.ts';
import { JANELA_DE_CORRIDA_DO_REFRESH_MS } from './sessoes.ts';

// #6 (D38): o que acontece quando os mesmos pedidos chegam juntos. Cada caso dispara com Promise.all e fixa o resultado.
const contexto = criarContextoDeTeste();
const app = criarApp(contexto);
afterAll(() => contexto.prisma.$disconnect());
beforeEach(() => contexto.relogio.definir(INSTANTE_INICIAL_DOS_TESTES));

const juntos = <T>(quantidade: number, pedido: () => PromiseLike<T>) => Promise.all(Array.from({ length: quantidade }, pedido));
const statusEmOrdem = (respostas: { status: number }[]) => respostas.map((resposta) => resposta.status).sort();

function refreshDoCookie(cabecalhos: Record<string, unknown>): string {
  const valor = /dentagenda_refresh=([^;]*)/.exec(String(cabecalhos['set-cookie']))?.[1];
  if (!valor) throw new Error('resposta sem cookie de refresh');
  return valor;
}
const renovar = (refreshToken: string) =>
  request(app).post('/api/auth/refresh').set('Cookie', `dentagenda_refresh=${refreshToken}`).set('X-DentAgenda-Refresh', '1');

describe('login com tentativas simultâneas', () => {
  it('cliente: 3 senhas erradas juntas → duas 401 e a 3ª já 423; a senha certa depois continua bloqueada', async () => {
    const paciente = await criarPaciente(contexto, {}, { comLogin: true });

    const respostas = await juntos(3, () => request(app).post('/api/auth/cliente/login').send({ cpf: paciente.cpf, senha: 'senha-errada-123' }));
    const depois = await request(app).post('/api/auth/cliente/login').send({ cpf: paciente.cpf, senha: SENHA_DE_TESTE });

    expect(statusEmOrdem(respostas)).toEqual([401, 401, 423]);
    expect(depois.status).toBe(423);
  });

  it('cliente: 8 senhas erradas juntas não passam do limite (só 2 recebem 401)', async () => {
    const paciente = await criarPaciente(contexto, {}, { comLogin: true });

    const respostas = await juntos(8, () => request(app).post('/api/auth/cliente/login').send({ cpf: paciente.cpf, senha: 'senha-errada-123' }));

    expect(statusEmOrdem(respostas)).toEqual([401, 401, 423, 423, 423, 423, 423, 423]);
    expect(await contexto.prisma.tentativaLogin.count({ where: { identificador: paciente.cpf, resultado: 'FALHA' } })).toBe(8);
  });

  it('funcionário: 3 senhas erradas juntas → duas 401 e uma 423', async () => {
    const funcionario = await criarFuncionario(contexto);

    const respostas = await juntos(3, () => request(app).post('/api/auth/funcionario/login').send({ email: funcionario.email, senha: 'senha-errada-123' }));

    expect(statusEmOrdem(respostas)).toEqual([401, 401, 423]);
  });

  it('dois logins certos juntos → duas sessões independentes', async () => {
    const paciente = await criarPaciente(contexto, {}, { comLogin: true });

    const respostas = await juntos(2, () => request(app).post('/api/auth/cliente/login').send({ cpf: paciente.cpf, senha: SENHA_DE_TESTE }));

    expect(statusEmOrdem(respostas)).toEqual([200, 200]);
    const login = await contexto.prisma.login.findUniqueOrThrow({ where: { clienteId: paciente.id } });
    expect(await contexto.prisma.refreshToken.count({ where: { loginId: login.id, revogadoEm: null } })).toBe(2);
  });
});

describe('refresh do mesmo cookie em duas abas', () => {
  async function logar() {
    const paciente = await criarPaciente(contexto, {}, { comLogin: true });
    const login = await request(app).post('/api/auth/cliente/login').send({ cpf: paciente.cpf, senha: SENHA_DE_TESTE });
    return { paciente, refreshToken: refreshDoCookie(login.headers) };
  }

  it('dois refresh juntos → um 200 e um 401, uma sessão só, e a vencedora continua valendo', async () => {
    const { paciente, refreshToken } = await logar();

    const respostas = await juntos(2, () => renovar(refreshToken));

    expect(statusEmOrdem(respostas)).toEqual([200, 401]);
    const vencedora = respostas.find((resposta) => resposta.status === 200);
    const login = await contexto.prisma.login.findUniqueOrThrow({ where: { clienteId: paciente.id } });
    expect(await contexto.prisma.refreshToken.count({ where: { loginId: login.id, revogadoEm: null } })).toBe(1);
    expect((await renovar(refreshDoCookie(vencedora!.headers))).status).toBe(200);
  });

  it('a aba atrasada dentro da janela de corrida recebe 401 sem derrubar a sessão da outra', async () => {
    const { refreshToken } = await logar();
    const primeira = await renovar(refreshToken);

    contexto.relogio.avancarMinutos(JANELA_DE_CORRIDA_DO_REFRESH_MS / 60_000 / 2);
    const atrasada = await renovar(refreshToken);

    expect(atrasada.status).toBe(401);
    expect((await renovar(refreshDoCookie(primeira.headers))).status).toBe(200);
  });

  it('depois da janela, reapresentar o token revogado continua derrubando todas as sessões (D19)', async () => {
    const { refreshToken } = await logar();
    const primeira = await renovar(refreshToken);

    contexto.relogio.avancarMinutos(JANELA_DE_CORRIDA_DO_REFRESH_MS / 60_000 + 1);
    const reuso = await renovar(refreshToken);

    expect(reuso.status).toBe(401);
    expect((await renovar(refreshDoCookie(primeira.headers))).status).toBe(401);
  });
});

describe('códigos e cadastro em paralelo', () => {
  const pedirCodigo = (cpf: string, telefone: string) => request(app).post('/api/auth/cliente/cadastro/codigo').send({ cpf, telefone });

  it('5 pedidos de código juntos respeitam o limite de 3 por hora', async () => {
    const cpf = gerarCpfValido();

    const respostas = await juntos(5, () => pedirCodigo(cpf, '47999990000'));

    expect(statusEmOrdem(respostas)).toEqual([202, 202, 202, 429, 429]);
    expect(await contexto.prisma.codigoVerificacao.count({ where: { identificador: cpf } })).toBe(3);
  });

  it('6 códigos errados juntos gastam só as 3 tentativas: o certo depois não vale', async () => {
    const cpf = gerarCpfValido();
    await pedirCodigo(cpf, '47999990001');
    const certo = contexto.enviador.ultimoCodigoPara('47999990001');
    const errado = certo === '000000' ? '111111' : '000000';
    const confirmar = (codigo: string) =>
      request(app).post('/api/auth/cliente/cadastro/confirmar').send({ cpf, telefone: '47999990001', codigo, senha: 'senha-nova-123', nome: 'Paciente Novo' });

    const respostas = await juntos(6, () => confirmar(errado));

    expect(statusEmOrdem(respostas)).toEqual([400, 400, 400, 400, 400, 400]);
    expect((await contexto.prisma.codigoVerificacao.findFirstOrThrow({ where: { identificador: cpf } })).tentativas).toBe(3);
    expect((await confirmar(certo)).status).toBe(400);
  });

  it('a mesma confirmação de cadastro duas vezes juntas → um 201 e um 400; um paciente e um login', async () => {
    const cpf = gerarCpfValido();
    await pedirCodigo(cpf, '47999990002');
    const codigo = contexto.enviador.ultimoCodigoPara('47999990002');

    const respostas = await juntos(2, () =>
      request(app).post('/api/auth/cliente/cadastro/confirmar').send({ cpf, telefone: '47999990002', codigo, senha: 'senha-nova-123', nome: 'Paciente Novo' }),
    );

    expect(statusEmOrdem(respostas)).toEqual([201, 400]);
    expect(respostas.find((resposta) => resposta.status === 400)?.body.erro.codigo).toBe('CODIGO_INVALIDO');
    expect(await contexto.prisma.cliente.count({ where: { cpf } })).toBe(1);
    expect(await contexto.prisma.login.count({ where: { cliente: { cpf } } })).toBe(1);
  });
});
