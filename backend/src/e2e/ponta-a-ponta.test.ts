import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarContextoDeTeste } from '../../testes/contexto-de-teste.ts';
import { criarFuncionario, gerarCpfValido, SENHA_DE_TESTE } from '../../testes/fabricas.ts';
import { criarApp } from '../app.ts';
import { instanteEmSaoPaulo } from '../compartilhado/datas.ts';

// Ponta a ponta da Tarefa 23 (passo a passo em docs/ponta-a-ponta.md): o fluxo da clínica só pelas rotas da API,
// com login de verdade. O único atalho é o admin inicial, que em produção vem do `npm run db:seed`.
const contexto = criarContextoDeTeste();
const app = criarApp(contexto);
afterAll(() => contexto.prisma.$disconnect());

const com = (token: string) => ({ Authorization: `Bearer ${token}` });
const SENHA_NOVA = 'senha-da-clinica-123';

async function entrar(email: string, senha: string): Promise<string> {
  const resposta = await request(app).post('/api/auth/funcionario/login').send({ email, senha });
  expect(resposta.status).toBe(200);
  return resposta.body.accessToken;
}

// O funcionário nasce sem senha conhecida e define a dele em "Esqueci minha senha" (D16, api.md).
async function definirSenha(email: string): Promise<void> {
  const pedido = await request(app).post('/api/auth/funcionario/recuperacao/codigo').send({ email });
  expect(pedido.status).toBe(202);
  const codigo = contexto.enviador.ultimoCodigoPara(email);
  const confirmacao = await request(app)
    .post('/api/auth/funcionario/recuperacao/confirmar')
    .send({ email, codigo, novaSenha: SENHA_NOVA });
  expect(confirmacao.status).toBe(204);
}

async function contratar(tokenDoAdmin: string, dados: Record<string, unknown>): Promise<{ id: string; email: string }> {
  const resposta = await request(app).post('/api/funcionarios').set(com(tokenDoAdmin)).send({ cpf: gerarCpfValido(), dataInicio: '2026-10-01', isAdmin: false, ...dados });
  expect(resposta.status).toBe(201);
  await definirSenha(resposta.body.email);
  return resposta.body;
}

describe('ponta a ponta: da grade da dentista à consulta realizada', () => {
  let recepcao: string;
  let dentista: string;
  let dentistaId: string;
  let procedimentoId: string;
  let marcos: string;
  let julia: string;
  let consultaDoMarcos: string;

  beforeAll(async () => {
    // Segunda, 2026-10-05, 07:00 em São Paulo; as consultas são na segunda seguinte.
    contexto.relogio.definir(instanteEmSaoPaulo('2026-10-05', '07:00'));
    const admin = await criarFuncionario(contexto, { isAdmin: true, email: 'admin@colzani.com.br' });
    expect(admin.isAdmin).toBe(true);
    const tokenDoAdmin = await entrar('admin@colzani.com.br', SENHA_DE_TESTE);

    const ana = await contratar(tokenDoAdmin, { nome: 'Ana Costa', email: 'ana@colzani.com.br', categoria: 'DENTISTA', cro: 'SC-12345' });
    await contratar(tokenDoAdmin, { nome: 'Carla Souza', email: 'carla@colzani.com.br', categoria: 'RECEPCIONISTA' });
    dentistaId = ana.id;
    dentista = await entrar('ana@colzani.com.br', SENHA_NOVA);
    recepcao = await entrar('carla@colzani.com.br', SENHA_NOVA);

    const limpeza = await request(app).post('/api/procedimentos').set(com(tokenDoAdmin)).send({ nome: 'Limpeza', duracaoMinutos: 60, precoCentavos: 18000 });
    expect(limpeza.status).toBe(201);
    procedimentoId = limpeza.body.id;

    // 1. Grade da dentista pela API: segunda, 08:00–12:00 (só o admin define).
    const grade = await request(app)
      .put(`/api/dentistas/${dentistaId}/grade`)
      .set(com(tokenDoAdmin))
      .send([{ diaSemana: 1, inicio: '08:00', fim: '12:00' }]);
    expect(grade.status).toBe(200);
    expect(grade.body.consultasForaDaGrade).toEqual([]);

    for (const [nome, telefone] of [['Marcos Oliveira', '47987654321'], ['Júlia Ramos', '47912345678']] as const) {
      const paciente = await request(app).post('/api/pacientes').set(com(recepcao)).send({ nome, cpf: gerarCpfValido(), telefone });
      expect(paciente.status).toBe(201);
      if (nome === 'Marcos Oliveira') marcos = paciente.body.id;
      else julia = paciente.body.id;
    }
  });

  const marcar = (pacienteId: string, hora: string) =>
    request(app)
      .post('/api/consultas')
      .set(com(recepcao))
      .send({ pacienteId, dentistaId, procedimentoId, inicio: `2026-10-12T${hora}:00-03:00` });

  it('2. a recepção vê os horários livres da grade e marca uma consulta', async () => {
    const livres = await request(app).get('/api/horarios-livres').query({ procedimentoId, data: '2026-10-12', dentistaId }).set(com(recepcao));
    expect(livres.status).toBe(200);
    expect(livres.body.horarios.map((horario: { inicio: string }) => horario.inicio)).toEqual(
      ['08:00', '09:00', '10:00', '11:00'].map((hora) => `2026-10-12T${hora}:00-03:00`),
    );

    const resposta = await marcar(marcos, '09:00');

    expect(resposta.status).toBe(201);
    expect(resposta.body).toMatchObject({ status: 'CONFIRMADA', inicio: '2026-10-12T09:00:00-03:00', fim: '2026-10-12T10:00:00-03:00' });
    consultaDoMarcos = resposta.body.id;
  });

  it('3. o mesmo horário para outra paciente → 409 HORARIO_INDISPONIVEL', async () => {
    const resposta = await marcar(julia, '09:00');

    expect(resposta.status).toBe(409);
    expect(resposta.body.erro.codigo).toBe('HORARIO_INDISPONIVEL');
  });

  it('4. a recepção remarca para as 10:00: a original fica cancelada e o paciente recebe um SMS', async () => {
    const mensagensAntes = contexto.enviador.mensagens.length;

    const resposta = await request(app)
      .post(`/api/consultas/${consultaDoMarcos}/remarcacao`)
      .set(com(recepcao))
      .send({ inicio: '2026-10-12T10:00:00-03:00' });

    expect(resposta.status).toBe(201);
    expect(resposta.body.cancelada).toMatchObject({ id: consultaDoMarcos, status: 'CANCELADA', canceladoPor: 'CLINICA' });
    expect(resposta.body.nova).toMatchObject({ status: 'CONFIRMADA', inicio: '2026-10-12T10:00:00-03:00' });
    expect(contexto.enviador.mensagens.length).toBe(mensagensAntes + 1);
    consultaDoMarcos = resposta.body.nova.id;

    // O horário das 09:00 voltou a ficar livre.
    expect((await marcar(julia, '09:00')).status).toBe(201);
  });

  it('5. a recepção cancela a consulta da Júlia sem justificativa (a clínica não precisa dela)', async () => {
    const daJulia = await request(app).get('/api/consultas').query({ pacienteId: julia, status: 'CONFIRMADA' }).set(com(recepcao));
    expect(daJulia.body.total).toBe(1);

    const resposta = await request(app).post(`/api/consultas/${daJulia.body.itens[0].id}/cancelamento`).set(com(recepcao)).send({});

    expect(resposta.status).toBe(200);
    expect(resposta.body).toMatchObject({ status: 'CANCELADA', canceladoPor: 'CLINICA' });
  });

  it('6. a dentista registra uma observação, que entra no histórico', async () => {
    const resposta = await request(app)
      .put(`/api/consultas/${consultaDoMarcos}/observacao`)
      .set(com(dentista))
      .send({ texto: 'Dente 24 – Oclusal. Sem intercorrências.' });

    expect(resposta.status).toBe(200);
    expect(resposta.body.observacao).toBe('Dente 24 – Oclusal. Sem intercorrências.');
    const historico = await request(app).get(`/api/consultas/${consultaDoMarcos}/observacao/historico`).set(com(recepcao));
    expect(historico.body).toEqual([expect.objectContaining({ autor: 'CLINICA', funcionario: { id: dentistaId, nome: 'Ana Costa' } })]);
  });

  it('7. antes do horário não dá para realizar; depois do início, a dentista marca como realizada', async () => {
    const cedo = await request(app).post(`/api/consultas/${consultaDoMarcos}/realizacao`).set(com(dentista));
    expect(cedo.status).toBe(422);
    expect(cedo.body.erro.codigo).toBe('CONSULTA_NAO_INICIADA');

    // Uma semana depois a sessão de 12 h já venceu: a dentista entra de novo no dia da consulta.
    contexto.relogio.definir(instanteEmSaoPaulo('2026-10-12', '11:30'));
    expect((await request(app).get('/api/auth/eu').set(com(dentista))).status).toBe(401);
    dentista = await entrar('ana@colzani.com.br', SENHA_NOVA);
    const pendentes = await request(app).get('/api/consultas/pendentes').set(com(dentista));
    expect(pendentes.body.itens.map((consulta: { id: string }) => consulta.id)).toEqual([consultaDoMarcos]);

    const resposta = await request(app).post(`/api/consultas/${consultaDoMarcos}/realizacao`).set(com(dentista));

    expect(resposta.status).toBe(200);
    expect(resposta.body.status).toBe('REALIZADA');
    expect((await request(app).get('/api/consultas/pendentes').set(com(dentista))).body.total).toBe(0);
  });
});
