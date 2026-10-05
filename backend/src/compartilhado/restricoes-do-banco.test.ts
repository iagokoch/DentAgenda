import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { limparBanco } from '../../testes/banco-de-teste.ts';
import { criarPrisma } from './banco.ts';
import { violacaoDoBanco } from './erros-do-banco.ts';

const prisma = criarPrisma(process.env.DATABASE_URL ?? '');

// As restrições comparam linhas entre si; cada teste começa sem nenhuma.
beforeEach(() => limparBanco(prisma));
afterAll(() => prisma.$disconnect());

let sequencia = 0;
const proximoCpf = () => String(++sequencia).padStart(11, '0');

const horario = (hora: string) => new Date(`2026-10-05T${hora}:00-03:00`);
const AGORA = horario('07:00');

function criarCliente() {
  return prisma.cliente.create({
    data: {
      nome: 'Paciente',
      cpf: proximoCpf(),
      telefone: '47999990000',
      criadoEm: AGORA,
      pacienteDesde: AGORA,
    },
  });
}

function criarFuncionario(dados: { categoria: 'DENTISTA' | 'RECEPCIONISTA'; cro?: string | null }) {
  const cpf = proximoCpf();
  return prisma.funcionario.create({
    data: {
      nome: 'Funcionário',
      cpf,
      email: `${cpf}@colzani.com.br`,
      senhaHash: 'x'.repeat(60),
      categoria: dados.categoria,
      cro: dados.cro === undefined ? `CRO-${cpf}` : dados.cro,
      dataInicio: AGORA,
    },
  });
}

function criarProcedimento() {
  return prisma.procedimento.create({
    data: { nome: `Limpeza ${++sequencia}`, duracaoMinutos: 60, precoCentavos: 18000 },
  });
}

async function cenario() {
  const [paciente, outroPaciente, dentista, outroDentista, procedimento] = await Promise.all([
    criarCliente(),
    criarCliente(),
    criarFuncionario({ categoria: 'DENTISTA' }),
    criarFuncionario({ categoria: 'DENTISTA' }),
    criarProcedimento(),
  ]);
  return { paciente, outroPaciente, dentista, outroDentista, procedimento };
}

type DadosConsulta = Parameters<typeof prisma.consulta.create>[0]['data'];

function criarConsulta(
  ids: { clienteId: string; dentistaId: string; procedimentoId: string },
  inicio: string,
  fim: string,
  extra: Partial<DadosConsulta> = {},
) {
  return prisma.consulta.create({
    data: {
      ...ids,
      inicio: horario(inicio),
      fim: horario(fim),
      status: 'CONFIRMADA',
      criadoEm: AGORA,
      ...extra,
    } as DadosConsulta,
  });
}

async function erroDe(promessa: Promise<unknown>): Promise<unknown> {
  try {
    await promessa;
  } catch (erro) {
    return erro;
  }
  throw new Error('era esperado que o banco recusasse a operação');
}

describe('restrições do banco', () => {
  it('recusa duas consultas não canceladas sobrepostas do mesmo dentista', async () => {
    const c = await cenario();
    await criarConsulta({ clienteId: c.paciente.id, dentistaId: c.dentista.id, procedimentoId: c.procedimento.id }, '08:00', '09:00');

    const erro = await erroDe(
      criarConsulta({ clienteId: c.outroPaciente.id, dentistaId: c.dentista.id, procedimentoId: c.procedimento.id }, '08:30', '09:30'),
    );

    expect(violacaoDoBanco(erro)).toMatchObject({ codigoSql: '23P01', restricao: 'consulta_dentista_sem_sobreposicao' });
  });

  it('aceita consultas encostadas: [08:00,09:00) e [09:00,10:00)', async () => {
    const c = await cenario();
    await criarConsulta({ clienteId: c.paciente.id, dentistaId: c.dentista.id, procedimentoId: c.procedimento.id }, '08:00', '09:00');
    await criarConsulta({ clienteId: c.outroPaciente.id, dentistaId: c.dentista.id, procedimentoId: c.procedimento.id }, '09:00', '10:00');

    expect(await prisma.consulta.count()).toBe(2);
  });

  it('ignora consulta CANCELADA na sobreposição', async () => {
    const c = await cenario();
    await criarConsulta({ clienteId: c.paciente.id, dentistaId: c.dentista.id, procedimentoId: c.procedimento.id }, '08:00', '09:00', {
      status: 'CANCELADA',
      canceladoEm: AGORA,
      canceladoPor: 'PACIENTE',
      justificativa: 'Imprevisto',
    });
    await criarConsulta({ clienteId: c.outroPaciente.id, dentistaId: c.dentista.id, procedimentoId: c.procedimento.id }, '08:00', '09:00');

    expect(await prisma.consulta.count()).toBe(2);
  });

  it('recusa o mesmo paciente em dois dentistas no mesmo horário', async () => {
    const c = await cenario();
    await criarConsulta({ clienteId: c.paciente.id, dentistaId: c.dentista.id, procedimentoId: c.procedimento.id }, '08:00', '09:00');

    const erro = await erroDe(
      criarConsulta({ clienteId: c.paciente.id, dentistaId: c.outroDentista.id, procedimentoId: c.procedimento.id }, '08:00', '09:00'),
    );

    expect(violacaoDoBanco(erro)).toMatchObject({ codigoSql: '23P01', restricao: 'consulta_paciente_sem_sobreposicao' });
  });

  it('recusa dentista sem CRO', async () => {
    const erro = await erroDe(criarFuncionario({ categoria: 'DENTISTA', cro: null }));

    expect(violacaoDoBanco(erro)).toMatchObject({ codigoSql: '23514', restricao: 'funcionario_dentista_tem_cro' });
  });

  it('recusa CANCELADA sem canceladoEm', async () => {
    const c = await cenario();

    const erro = await erroDe(
      criarConsulta({ clienteId: c.paciente.id, dentistaId: c.dentista.id, procedimentoId: c.procedimento.id }, '08:00', '09:00', {
        status: 'CANCELADA',
        canceladoPor: 'PACIENTE',
      }),
    );

    expect(violacaoDoBanco(erro)).toMatchObject({ codigoSql: '23514', restricao: 'consulta_cancelamento_coerente' });
  });

  it('recusa cancelamento da CLINICA sem funcionário', async () => {
    const c = await cenario();

    const erro = await erroDe(
      criarConsulta({ clienteId: c.paciente.id, dentistaId: c.dentista.id, procedimentoId: c.procedimento.id }, '08:00', '09:00', {
        status: 'CANCELADA',
        canceladoEm: AGORA,
        canceladoPor: 'CLINICA',
      }),
    );

    expect(violacaoDoBanco(erro)).toMatchObject({
      codigoSql: '23514',
      restricao: 'consulta_cancelamento_clinica_tem_funcionario',
    });
  });

  it('recusa paciente cancelando com 23h sem justificativa e aceita com 24h', async () => {
    const c = await cenario();
    const ids = { clienteId: c.paciente.id, dentistaId: c.dentista.id, procedimentoId: c.procedimento.id };
    const umaHora = 60 * 60 * 1000;
    const inicio = horario('08:00');

    const erro = await erroDe(
      criarConsulta(ids, '08:00', '09:00', {
        status: 'CANCELADA',
        canceladoEm: new Date(inicio.getTime() - 23 * umaHora),
        canceladoPor: 'PACIENTE',
      }),
    );
    await criarConsulta(ids, '08:00', '09:00', {
      status: 'CANCELADA',
      canceladoEm: new Date(inicio.getTime() - 24 * umaHora),
      canceladoPor: 'PACIENTE',
    });

    expect(violacaoDoBanco(erro)).toMatchObject({ codigoSql: '23514', restricao: 'consulta_justificativa_menos_de_24h' });
    expect(await prisma.consulta.count()).toBe(1);
  });

  it('recusa refresh com loginId e funcionarioId ao mesmo tempo', async () => {
    const [paciente, recepcionista] = await Promise.all([criarCliente(), criarFuncionario({ categoria: 'RECEPCIONISTA' })]);
    const login = await prisma.login.create({ data: { clienteId: paciente.id, senhaHash: 'x'.repeat(60) } });

    const erro = await erroDe(
      prisma.refreshToken.create({
        data: {
          loginId: login.id,
          funcionarioId: recepcionista.id,
          tokenHash: 'hash',
          criadoEm: AGORA,
          expiraEm: horario('19:00'),
        },
      }),
    );

    expect(violacaoDoBanco(erro)).toMatchObject({ codigoSql: '23514', restricao: 'refresh_uma_conta' });
  });

  it('recusa código com 4 tentativas', async () => {
    const erro = await erroDe(
      prisma.codigoVerificacao.create({
        data: {
          identificador: proximoCpf(),
          tipo: 'CLIENTE',
          finalidade: 'RECUPERACAO',
          codigoHash: 'hash',
          criadoEm: AGORA,
          expiraEm: horario('07:10'),
          tentativas: 4,
        },
      }),
    );

    expect(violacaoDoBanco(erro)).toMatchObject({ codigoSql: '23514', restricao: 'codigo_tentativas_ate_3' });
  });

  it('informa os campos do UNIQUE violado', async () => {
    const paciente = await criarCliente();

    const erro = await erroDe(
      prisma.cliente.create({
        data: { nome: 'Outro', cpf: paciente.cpf, telefone: '47999990001', criadoEm: AGORA, pacienteDesde: AGORA },
      }),
    );

    const violacao = violacaoDoBanco(erro);
    expect(violacao?.codigoSql).toBe('23505');
    expect(violacao?.campos).toContain('cpf');
  });

  it('recusa e-mail de funcionário com maiúscula (D28)', async () => {
    const funcionario = await criarFuncionario({ categoria: 'RECEPCIONISTA' });

    const erro = await erroDe(
      prisma.funcionario.update({ where: { id: funcionario.id }, data: { email: 'Ana@colzani.com.br' } }),
    );

    expect(violacaoDoBanco(erro)).toMatchObject({ codigoSql: '23514', restricao: 'funcionario_email_minusculo' });
  });

  it('recusa e-mail de paciente com maiúscula e aceita paciente sem e-mail (D28)', async () => {
    const paciente = await criarCliente();

    const erro = await erroDe(
      prisma.cliente.update({ where: { id: paciente.id }, data: { email: 'Marcos@Email.com' } }),
    );

    expect(paciente.email).toBeNull();
    expect(violacaoDoBanco(erro)).toMatchObject({ codigoSql: '23514', restricao: 'cliente_email_minusculo' });
  });

  it('devolve null para erro que não veio do banco', () => {
    expect(violacaoDoBanco(new Error('qualquer'))).toBeNull();
  });
});
