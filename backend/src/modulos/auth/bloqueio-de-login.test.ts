import { describe, expect, it } from 'vitest';
import { clienteEstaBloqueado, funcionarioBloqueadoAte, type Tentativa } from './bloqueio-de-login.ts';

const as = (hora: string) => new Date(`2026-10-05T${hora}:00Z`);
const falha = (hora: string): Tentativa => ({ ocorridoEm: as(hora), resultado: 'FALHA' });
const sucesso = (hora: string): Tentativa => ({ ocorridoEm: as(hora), resultado: 'SUCESSO' });
const redefinicao = (hora: string): Tentativa => ({ ocorridoEm: as(hora), resultado: 'REDEFINICAO' });

describe('bloqueio de login do cliente (D5)', () => {
  it('cliente com 2 falhas não está bloqueado', () => {
    expect(clienteEstaBloqueado([falha('10:00'), falha('10:01')])).toBe(false);
  });

  it('cliente com 3 falhas está bloqueado', () => {
    expect(clienteEstaBloqueado([falha('10:00'), falha('10:01'), falha('10:02')])).toBe(true);
  });

  it('SUCESSO antes das falhas zera a contagem', () => {
    expect(clienteEstaBloqueado([falha('09:00'), falha('09:01'), sucesso('09:02'), falha('10:00')])).toBe(false);
  });

  it('falha no mesmo instante de um SUCESSO anterior conta', () => {
    expect(clienteEstaBloqueado([sucesso('10:00'), falha('10:00'), falha('10:00'), falha('10:00')])).toBe(true);
  });

  it('REDEFINICAO zera a contagem do cliente', () => {
    expect(clienteEstaBloqueado([falha('10:00'), falha('10:01'), falha('10:02'), redefinicao('11:00')])).toBe(false);
  });
});

describe('bloqueio de login do funcionário (D19, D25.2)', () => {
  it('funcionário: bloqueado até 3ª falha + 15 min', () => {
    const tentativas = [falha('10:00'), falha('10:01'), falha('10:02')];

    expect(funcionarioBloqueadoAte(tentativas, as('10:05'))).toEqual(as('10:17'));
  });

  it('funcionário: falhas durante o bloqueio não estendem o prazo', () => {
    const tentativas = [falha('10:00'), falha('10:01'), falha('10:02'), falha('10:10'), falha('10:15')];

    expect(funcionarioBloqueadoAte(tentativas, as('10:16'))).toEqual(as('10:17'));
    expect(funcionarioBloqueadoAte(tentativas, as('10:17'))).toBeNull();
  });

  it('funcionário: depois do bloqueio, recomeça a contar do zero', () => {
    const tentativas = [falha('10:00'), falha('10:01'), falha('10:02'), falha('10:10'), falha('10:20'), falha('10:21')];

    expect(funcionarioBloqueadoAte(tentativas, as('10:22'))).toBeNull();
    expect(funcionarioBloqueadoAte([...tentativas, falha('10:22')], as('10:23'))).toEqual(as('10:37'));
  });
});
