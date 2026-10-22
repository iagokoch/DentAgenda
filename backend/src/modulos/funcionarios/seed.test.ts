import { afterAll, describe, expect, it } from 'vitest';
import { limparBanco } from '../../../testes/banco-de-teste.ts';
import { criarContextoDeTeste } from '../../../testes/contexto-de-teste.ts';
import { criarFuncionario, gerarCpfValido } from '../../../testes/fabricas.ts';
import { semearAdminInicial } from '../../../prisma/seed.ts';
import { semearDadosDeDesenvolvimento } from '../../../prisma/seed-dev.ts';
import { conferirSenha } from '../../compartilhado/senhas.ts';

const contexto = criarContextoDeTeste();
afterAll(() => contexto.prisma.$disconnect());

const HOJE = new Date('2026-10-05T12:00:00Z');

function variaveis(extra: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    ADMIN_INICIAL_EMAIL: 'Dono@Exemplo.dev',
    ADMIN_INICIAL_NOME: 'Dono da Clínica',
    ADMIN_INICIAL_CPF: gerarCpfValido(),
    ADMIN_INICIAL_CATEGORIA: 'RECEPCIONISTA',
    ...extra,
  };
}

describe('semearAdminInicial', () => {
  it('cria o admin com dataInicio = hoje e senha desconhecida', async () => {
    await limparBanco(contexto.prisma);
    const env = variaveis();

    const resultado = await semearAdminInicial(contexto.prisma, env, HOJE);

    expect(resultado).toBe('criado');
    const admin = await contexto.prisma.funcionario.findUniqueOrThrow({ where: { email: 'dono@exemplo.dev' } });
    expect(admin).toMatchObject({ isAdmin: true, ativo: true, categoria: 'RECEPCIONISTA', cro: null });
    expect(admin.dataInicio.toISOString().slice(0, 10)).toBe('2026-10-05');
    expect(await conferirSenha('qualquer-senha-123', admin.senhaHash)).toBe(false);
  });

  it('ADMIN_INICIAL_CRO vazio (como no .env.example) é aceito para RECEPCIONISTA', async () => {
    await limparBanco(contexto.prisma);

    const resultado = await semearAdminInicial(contexto.prisma, variaveis({ ADMIN_INICIAL_CRO: '' }), HOJE);

    expect(resultado).toBe('criado');
  });

  it('não faz nada se já existe admin', async () => {
    await limparBanco(contexto.prisma);
    await criarFuncionario(contexto, { isAdmin: true });

    const resultado = await semearAdminInicial(contexto.prisma, variaveis(), HOJE);

    expect(resultado).toBe('ja-existe');
    expect(await contexto.prisma.funcionario.count()).toBe(1);
  });

  it('recusa variável ADMIN_INICIAL_* faltando, citando o nome', async () => {
    await limparBanco(contexto.prisma);

    await expect(semearAdminInicial(contexto.prisma, variaveis({ ADMIN_INICIAL_EMAIL: undefined }), HOJE)).rejects.toThrow(
      /ADMIN_INICIAL_EMAIL/,
    );
    expect(await contexto.prisma.funcionario.count()).toBe(0);
  });

  it('DENTISTA sem ADMIN_INICIAL_CRO → recusa', async () => {
    await limparBanco(contexto.prisma);

    await expect(
      semearAdminInicial(contexto.prisma, variaveis({ ADMIN_INICIAL_CATEGORIA: 'DENTISTA' }), HOJE),
    ).rejects.toThrow(/ADMIN_INICIAL_CRO/);
  });
});

describe('semearDadosDeDesenvolvimento', () => {
  it('seed de desenvolvimento recusa NODE_ENV=production', async () => {
    await limparBanco(contexto.prisma);

    await expect(semearDadosDeDesenvolvimento(contexto.prisma, 'production')).rejects.toThrow(/production/);
    expect(await contexto.prisma.procedimento.count()).toBe(0);
  });

  it('cria procedimentos, dentista, recepcionista e grade; segunda execução não duplica', async () => {
    await limparBanco(contexto.prisma);

    await semearDadosDeDesenvolvimento(contexto.prisma, 'development');
    await semearDadosDeDesenvolvimento(contexto.prisma, 'development');

    expect(await contexto.prisma.procedimento.count()).toBe(4);
    const dentista = await contexto.prisma.funcionario.findFirstOrThrow({ where: { categoria: 'DENTISTA' } });
    expect(dentista.email.endsWith('@exemplo.dev')).toBe(true);
    expect(await contexto.prisma.funcionario.count({ where: { categoria: 'RECEPCIONISTA' } })).toBe(1);
    // seg–sex, manhã e tarde
    expect(await contexto.prisma.gradeHorario.count({ where: { dentistaId: dentista.id } })).toBe(10);
  });

  it('paciente de exemplo para a demonstração (D41): sem login, uma consulta pendente no último dia útil e uma no próximo', async () => {
    await limparBanco(contexto.prisma);
    const segunda = new Date('2026-10-05T12:00:00Z');

    await semearDadosDeDesenvolvimento(contexto.prisma, 'development', segunda);
    await semearDadosDeDesenvolvimento(contexto.prisma, 'development', segunda);

    const paciente = await contexto.prisma.cliente.findFirstOrThrow({ include: { login: true } });
    expect(paciente.nome).toBe('Marcos Oliveira (exemplo)');
    expect(paciente.login).toBeNull();
    const consultas = await contexto.prisma.consulta.findMany({ where: { clienteId: paciente.id }, orderBy: { inicio: 'asc' }, include: { procedimento: true } });
    expect(consultas.map((consulta) => [consulta.inicio.toISOString(), consulta.status, consulta.procedimento.nome])).toEqual([
      ['2026-10-02T12:00:00.000Z', 'CONFIRMADA', 'Limpeza'], // sexta, 09:00 em São Paulo: pendente de registro
      ['2026-10-06T13:00:00.000Z', 'CONFIRMADA', 'Limpeza'], // terça, 10:00
    ]);
  });
});
