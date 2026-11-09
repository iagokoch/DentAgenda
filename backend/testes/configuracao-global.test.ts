import { execSync } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import aplicarMigrationsNoBancoDeTeste from './configuracao-global.ts';

vi.mock('node:child_process', () => ({ execSync: vi.fn() }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('destino das migrations de teste', () => {
  it.each([
    undefined, '', 'invalida',
    'https://localhost/dentagenda_test',
    'postgresql://localhost/dentagenda',
    'postgresql://localhost/dentagenda_test_extra',
    'postgresql://localhost/',
    'postgresql://localhost/dentagenda_test/outro',
    'postgresql://localhost/dentagenda_test?dbname=dentagenda',
    'postgresql://localhost/dentagenda_test#ignorado',
    ' postgresql://localhost/dentagenda_test',
    'postgresql://localhost/dentagenda_test ',
    'postgresql://localhost/dentagenda%5ftest',
    'postgresql://localhost/dentagenda_test%2foutro',
  ])('recusa destino não autorizado antes de iniciar subprocesso: %s', (url) => {
    vi.stubEnv('DATABASE_URL_TESTE', url);
    expect(() => aplicarMigrationsNoBancoDeTeste()).toThrow();
    expect(execSync).not.toHaveBeenCalled();
  });

  it.each(['postgresql://localhost/dentagenda_test', 'postgres://localhost:5433/outro_test'])
  ('encaminha o destino autorizado ao subprocesso: %s', (url) => {
    vi.stubEnv('DATABASE_URL_TESTE', url);
    aplicarMigrationsNoBancoDeTeste();
    expect(execSync).toHaveBeenCalledExactlyOnceWith('npx prisma migrate deploy', {
      env: expect.objectContaining({ DATABASE_URL: url }), stdio: 'pipe',
    });
  });
});
