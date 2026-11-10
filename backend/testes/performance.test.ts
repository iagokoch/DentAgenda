import { describe, expect, it, vi } from 'vitest';
import { gerarDadosDeCarga, validarBancoDeCarga } from '../scripts/performance/dados-ficticios.ts';
import { gravarDadosDeCarga } from '../scripts/performance/semear.ts';
import type { PrismaClient } from '../src/generated/prisma/client.ts';

describe('dados fictícios de carga', () => {
  it('aceita somente o destino explícito de carga em ambiente não produtivo', () => {
    const url = 'postgresql://localhost/dentagenda_performance_test';
    expect(validarBancoDeCarga(url, 'test')).toBe(url);
  });

  it.each([
    { banco: 'dentagenda', quantidade: 0 },
    { banco: 'dentagenda_performance_test', quantidade: 1 },
  ])('recusa gravações quando o destino real ou conteúdo não são autorizados: %j', async ({ banco, quantidade }) => {
    const escrever = vi.fn();
    const tabela = { count: vi.fn().mockResolvedValue(quantidade), create: escrever, createMany: escrever };
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(0), $queryRaw: vi.fn().mockResolvedValue([{ banco }]),
      cliente: tabela, funcionario: tabela, procedimento: tabela, codigoVerificacao: tabela, tentativaLogin: tabela,
    };
    const prisma = {
      $transaction: async (executar: (transacao: typeof tx) => Promise<void>) => executar(tx),
    } as unknown as PrismaClient;
    const dados = gerarDadosDeCarga({ dentistas: 1, pacientes: 1, consultas: 1 });
    await expect(gravarDadosDeCarga(prisma, dados, '')).rejects.toThrow();
    expect(escrever).not.toHaveBeenCalled();
  });

  it.each(['postgresql://localhost/dentagenda', 'postgresql://localhost/dentagenda_test', undefined])
  ('recusa banco fora do escopo exclusivo: %s', (url) => {
    expect(() => validarBancoDeCarga(url, 'test')).toThrow();
  });

  it('recusa execução em produção', () => {
    expect(() => validarBancoDeCarga('postgresql://localhost/carga_performance_test', 'production')).toThrow();
  });

  it('gera as quantidades pedidas, com intervalos disjuntos por dentista e paciente', () => {
    const dados = gerarDadosDeCarga({ dentistas: 2, pacientes: 7, consultas: 200 });
    expect(dados.dentistas).toHaveLength(2);
    expect(dados.pacientes).toHaveLength(7);
    expect(dados.consultas).toHaveLength(200);
    for (const campo of ['dentistaId', 'clienteId'] as const) {
      const fimPorDono = new Map<string, number>();
      for (const consulta of dados.consultas) {
        expect(consulta.inicio.getTime()).toBeGreaterThanOrEqual(fimPorDono.get(consulta[campo]) ?? 0);
        fimPorDono.set(consulta[campo], consulta.fim.getTime());
        expect([0, 6]).not.toContain(consulta.inicio.getUTCDay());
      }
    }
    expect(new Set(dados.pacientes.map((paciente) => paciente.cpf)).size).toBe(7);
    expect(new Date(dados.inicioDisputa).getTime()).toBeGreaterThan(dados.consultas.at(-1)!.fim.getTime());
    expect([0, 6]).not.toContain(new Date(dados.inicioDisputa).getUTCDay());
  });

  it('recusa parâmetros que poderiam gerar conflitos ou alocar volume não previsto', () => {
    expect(() => gerarDadosDeCarga({ dentistas: 3, pacientes: 2, consultas: 20 })).toThrow();
    expect(() => gerarDadosDeCarga({ dentistas: 1, pacientes: 5, consultas: -1 })).toThrow();
    expect(() => gerarDadosDeCarga({ dentistas: 1, pacientes: 5, consultas: 1_000_001 })).toThrow();
  });
});
