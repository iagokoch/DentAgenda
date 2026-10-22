import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarContextoDeTeste } from '../../../testes/contexto-de-teste.ts';
import { criarFuncionario, criarPaciente, criarProcedimento, tokenDe } from '../../../testes/fabricas.ts';
import { criarApp } from '../../app.ts';
import { instanteEmSaoPaulo } from '../../compartilhado/datas.ts';
import type { Funcionario } from '../../generated/prisma/client.ts';
import { cabeNaGrade, faixasDoDia, type Faixa } from './grade.service.ts';

const contexto = criarContextoDeTeste();
const app = criarApp(contexto);
afterAll(() => contexto.prisma.$disconnect());

// Relógio dos testes: segunda, 2026-10-05, 09:00 em São Paulo.
let admin: Funcionario;
let recepcionista: Funcionario;
let dentista: Funcionario;
let colega: Funcionario;
beforeAll(async () => {
  admin = await criarFuncionario(contexto, { isAdmin: true });
  recepcionista = await criarFuncionario(contexto);
  dentista = await criarFuncionario(contexto, { categoria: 'DENTISTA' });
  colega = await criarFuncionario(contexto, { categoria: 'DENTISTA' });
});

const com = (token: string) => ({ Authorization: `Bearer ${token}` });
const gravar = (token: string, id: string, corpo: unknown) =>
  request(app).put(`/api/dentistas/${id}/grade`).set(com(token)).send(corpo as object);
const ler = (token: string, id: string) => request(app).get(`/api/dentistas/${id}/grade`).set(com(token));

const MANHA_E_TARDE: Faixa[] = [
  { diaSemana: 1, inicio: '08:00', fim: '12:00' },
  { diaSemana: 1, inicio: '14:00', fim: '18:00' },
];

describe('PUT /api/dentistas/{id}/grade', () => {
  it('PUT por admin substitui a semana e GET devolve a nova', async () => {
    await gravar(tokenDe(contexto, admin), dentista.id, [{ diaSemana: 3, inicio: '09:00', fim: '10:00' }]);

    const resposta = await gravar(tokenDe(contexto, admin), dentista.id, MANHA_E_TARDE);
    const leitura = await ler(tokenDe(contexto, admin), dentista.id);

    expect(resposta.status).toBe(200);
    expect(resposta.body.grade).toEqual(MANHA_E_TARDE);
    expect(resposta.body.consultasForaDaGrade).toEqual([]);
    expect(leitura.status).toBe(200);
    expect(leitura.body).toEqual(MANHA_E_TARDE);
  });

  it('PUT com lista vazia limpa a grade', async () => {
    await gravar(tokenDe(contexto, admin), dentista.id, MANHA_E_TARDE);

    const resposta = await gravar(tokenDe(contexto, admin), dentista.id, []);

    expect(resposta.status).toBe(200);
    expect(resposta.body.grade).toEqual([]);
  });

  it('PUT com faixas sobrepostas no mesmo dia → 422 FAIXAS_SOBREPOSTAS', async () => {
    await gravar(tokenDe(contexto, admin), dentista.id, MANHA_E_TARDE);

    const resposta = await gravar(tokenDe(contexto, admin), dentista.id, [
      { diaSemana: 2, inicio: '08:00', fim: '12:00' },
      { diaSemana: 2, inicio: '11:00', fim: '14:00' },
    ]);

    expect(resposta.status).toBe(422);
    expect(resposta.body.erro.codigo).toBe('FAIXAS_SOBREPOSTAS');
    // A recusa não mexe na grade que já existia.
    expect((await ler(tokenDe(contexto, admin), dentista.id)).body).toEqual(MANHA_E_TARDE);
  });

  it('faixas encostadas 08:00–12:00 e 12:00–14:00 são aceitas', async () => {
    const encostadas = [
      { diaSemana: 2, inicio: '08:00', fim: '12:00' },
      { diaSemana: 2, inicio: '12:00', fim: '14:00' },
    ];

    const resposta = await gravar(tokenDe(contexto, admin), dentista.id, encostadas);

    expect(resposta.status).toBe(200);
    expect(resposta.body.grade).toEqual(encostadas);
  });

  it('mesmo horário em dias diferentes não é sobreposição', async () => {
    const resposta = await gravar(tokenDe(contexto, admin), dentista.id, [
      { diaSemana: 1, inicio: '08:00', fim: '12:00' },
      { diaSemana: 2, inicio: '08:00', fim: '12:00' },
    ]);

    expect(resposta.status).toBe(200);
  });

  it('PUT com inicio >= fim → 422 FAIXA_INVALIDA', async () => {
    const invertida = await gravar(tokenDe(contexto, admin), dentista.id, [
      { diaSemana: 1, inicio: '12:00', fim: '08:00' },
    ]);
    const vazia = await gravar(tokenDe(contexto, admin), dentista.id, [{ diaSemana: 1, inicio: '08:00', fim: '08:00' }]);

    expect(invertida.status).toBe(422);
    expect(invertida.body.erro.codigo).toBe('FAIXA_INVALIDA');
    expect(vazia.status).toBe(422);
    expect(vazia.body.erro.codigo).toBe('FAIXA_INVALIDA');
  });

  it('PUT com formato inválido → 400 ENTRADA_INVALIDA', async () => {
    const diaInvalido = await gravar(tokenDe(contexto, admin), dentista.id, [
      { diaSemana: 7, inicio: '08:00', fim: '12:00' },
    ]);
    const horaInvalida = await gravar(tokenDe(contexto, admin), dentista.id, [
      { diaSemana: 1, inicio: '8:00', fim: '25:00' },
    ]);
    const naoELista = await gravar(tokenDe(contexto, admin), dentista.id, { diaSemana: 1 });

    for (const resposta of [diaInvalido, horaInvalida, naoELista]) {
      expect(resposta.status).toBe(400);
      expect(resposta.body.erro.codigo).toBe('ENTRADA_INVALIDA');
    }
  });

  it('PUT lista consultasForaDaGrade futuras e não cancela nenhuma', async () => {
    await gravar(tokenDe(contexto, admin), dentista.id, [
      { diaSemana: 1, inicio: '08:00', fim: '18:00' },
      { diaSemana: 2, inicio: '08:00', fim: '18:00' },
    ]);
    const paciente = await criarPaciente(contexto, { nome: 'Marcos Oliveira' });
    const procedimento = await criarProcedimento(contexto);
    const marcar = (data: string, de: string, ate: string, status: 'CONFIRMADA' | 'CANCELADA' = 'CONFIRMADA') =>
      contexto.prisma.consulta.create({
        data: {
          clienteId: paciente.id,
          dentistaId: dentista.id,
          procedimentoId: procedimento.id,
          inicio: instanteEmSaoPaulo(data, de),
          fim: instanteEmSaoPaulo(data, ate),
          status,
          criadoEm: contexto.relogio.agora(),
          ...(status === 'CANCELADA'
            ? { canceladoEm: contexto.relogio.agora(), canceladoPor: 'CLINICA' as const, canceladoPorFuncionarioId: admin.id }
            : {}),
        },
      });
    const fora = await marcar('2026-10-06', '14:00', '15:00'); // terça: sai da grade
    const dentro = await marcar('2026-10-12', '09:00', '10:00'); // segunda: continua na grade
    await marcar('2026-10-13', '10:00', '11:00', 'CANCELADA'); // cancelada: não interessa
    await marcar('2026-10-01', '14:00', '15:00'); // passada: não interessa

    const resposta = await gravar(tokenDe(contexto, admin), dentista.id, [
      { diaSemana: 1, inicio: '08:00', fim: '18:00' },
    ]);

    expect(resposta.status).toBe(200);
    expect(resposta.body.consultasForaDaGrade).toEqual([
      {
        id: fora.id,
        inicio: '2026-10-06T14:00:00-03:00',
        fim: '2026-10-06T15:00:00-03:00',
        paciente: { id: paciente.id, nome: 'Marcos Oliveira' },
      },
    ]);
    const salvas = await contexto.prisma.consulta.findMany({ where: { dentistaId: dentista.id, status: 'CONFIRMADA' } });
    expect(salvas.map((consulta) => consulta.id)).toEqual(expect.arrayContaining([fora.id, dentro.id]));
  });

  it('PUT em id de recepcionista → 404', async () => {
    const resposta = await gravar(tokenDe(contexto, admin), recepcionista.id, MANHA_E_TARDE);

    expect(resposta.status).toBe(404);
    expect(resposta.body.erro.codigo).toBe('NAO_ENCONTRADO');
  });

  it('PUT em id inexistente ou malformado → 404', async () => {
    const inexistente = await gravar(tokenDe(contexto, admin), '5b0f6a9e-1d4c-4c53-9c1e-0c3a9f6d2b11', MANHA_E_TARDE);
    const malformado = await gravar(tokenDe(contexto, admin), 'abc', MANHA_E_TARDE);

    expect(inexistente.status).toBe(404);
    expect(malformado.status).toBe(404);
  });

  it('PUT por recepcionista sem isAdmin → 403', async () => {
    const resposta = await gravar(tokenDe(contexto, recepcionista), dentista.id, MANHA_E_TARDE);

    expect(resposta.status).toBe(403);
    expect(resposta.body.erro.codigo).toBe('SEM_PERMISSAO');
  });

  it('PUT pelo próprio dentista sem isAdmin → 403', async () => {
    const resposta = await gravar(tokenDe(contexto, dentista), dentista.id, MANHA_E_TARDE);

    expect(resposta.status).toBe(403);
  });
});

describe('GET /api/dentistas/{id}/grade', () => {
  it('GET pelo próprio dentista → 200; da grade de outro → 404', async () => {
    await gravar(tokenDe(contexto, admin), dentista.id, MANHA_E_TARDE);

    const propria = await ler(tokenDe(contexto, dentista), dentista.id);
    const alheia = await ler(tokenDe(contexto, colega), dentista.id);

    expect(propria.status).toBe(200);
    expect(propria.body).toEqual(MANHA_E_TARDE);
    expect(alheia.status).toBe(404);
    expect(alheia.body.erro.codigo).toBe('NAO_ENCONTRADO');
  });

  it('GET pela recepção e pelo admin → 200; por cliente → 403', async () => {
    const paciente = await criarPaciente(contexto);

    const daRecepcao = await ler(tokenDe(contexto, recepcionista), dentista.id);
    const doAdmin = await ler(tokenDe(contexto, admin), dentista.id);
    const doCliente = await ler(tokenDe(contexto, paciente), dentista.id);

    expect(daRecepcao.status).toBe(200);
    expect(doAdmin.status).toBe(200);
    expect(doCliente.status).toBe(403);
  });

  it('GET de quem não é dentista → 404; sem login → 401', async () => {
    const naoDentista = await ler(tokenDe(contexto, admin), recepcionista.id);
    const semLogin = await request(app).get(`/api/dentistas/${dentista.id}/grade`);

    expect(naoDentista.status).toBe(404);
    expect(semLogin.status).toBe(401);
  });

  it('devolve as faixas ordenadas por dia e hora', async () => {
    await gravar(tokenDe(contexto, admin), dentista.id, [
      { diaSemana: 5, inicio: '14:00', fim: '18:00' },
      { diaSemana: 1, inicio: '14:00', fim: '18:00' },
      { diaSemana: 1, inicio: '08:00', fim: '12:00' },
    ]);

    const resposta = await ler(tokenDe(contexto, admin), dentista.id);

    expect(resposta.body).toEqual([
      { diaSemana: 1, inicio: '08:00', fim: '12:00' },
      { diaSemana: 1, inicio: '14:00', fim: '18:00' },
      { diaSemana: 5, inicio: '14:00', fim: '18:00' },
    ]);
  });
});

describe('faixasDoDia e cabeNaGrade (puras)', () => {
  const segunda = '2026-10-05';

  it('faixasDoDia converte as faixas do dia da semana em instantes de São Paulo', () => {
    const faixas = faixasDoDia(MANHA_E_TARDE, segunda);

    expect(faixas).toEqual([
      { inicio: instanteEmSaoPaulo(segunda, '08:00'), fim: instanteEmSaoPaulo(segunda, '12:00') },
      { inicio: instanteEmSaoPaulo(segunda, '14:00'), fim: instanteEmSaoPaulo(segunda, '18:00') },
    ]);
    expect(faixasDoDia(MANHA_E_TARDE, '2026-10-06')).toEqual([]);
  });

  it('cabeNaGrade: consulta 11:30–12:30 numa faixa 08:00–12:00 → false', () => {
    const consulta = { inicio: instanteEmSaoPaulo(segunda, '11:30'), fim: instanteEmSaoPaulo(segunda, '12:30') };

    expect(cabeNaGrade(MANHA_E_TARDE, consulta)).toBe(false);
  });

  it('cabeNaGrade: consulta inteira dentro de uma faixa → true, inclusive encostando nas pontas', () => {
    const dentro = { inicio: instanteEmSaoPaulo(segunda, '08:00'), fim: instanteEmSaoPaulo(segunda, '09:00') };
    const naPonta = { inicio: instanteEmSaoPaulo(segunda, '11:00'), fim: instanteEmSaoPaulo(segunda, '12:00') };

    expect(cabeNaGrade(MANHA_E_TARDE, dentro)).toBe(true);
    expect(cabeNaGrade(MANHA_E_TARDE, naPonta)).toBe(true);
  });

  it('cabeNaGrade: no almoço entre duas faixas → false', () => {
    const almoco = { inicio: instanteEmSaoPaulo(segunda, '12:00'), fim: instanteEmSaoPaulo(segunda, '13:00') };

    expect(cabeNaGrade(MANHA_E_TARDE, almoco)).toBe(false);
  });

  it('cabeNaGrade: usa o dia de São Paulo — 22:00 de segunda é terça em UTC', () => {
    const noite: Faixa[] = [{ diaSemana: 1, inicio: '20:00', fim: '23:00' }];
    const consulta = { inicio: instanteEmSaoPaulo(segunda, '22:00'), fim: instanteEmSaoPaulo(segunda, '23:00') };

    expect(consulta.inicio.toISOString().slice(0, 10)).toBe('2026-10-06');
    expect(cabeNaGrade(noite, consulta)).toBe(true);
  });

  it('cabeNaGrade: consulta que atravessa a meia-noite → false', () => {
    const noite: Faixa[] = [{ diaSemana: 1, inicio: '20:00', fim: '23:59' }];
    const consulta = { inicio: instanteEmSaoPaulo(segunda, '23:30'), fim: instanteEmSaoPaulo('2026-10-06', '00:30') };

    expect(cabeNaGrade(noite, consulta)).toBe(false);
  });
});
