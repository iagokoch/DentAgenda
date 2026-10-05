import { describe, expect, it } from 'vitest';
import { cpfValido } from './cpf.ts';

describe('cpfValido (D25.1)', () => {
  it('aceita 52998224725', () => {
    expect(cpfValido('52998224725')).toBe(true);
  });

  it('recusa dígito verificador errado 52998224724', () => {
    expect(cpfValido('52998224724')).toBe(false);
  });

  it('recusa 11111111111', () => {
    expect(cpfValido('11111111111')).toBe(false);
  });

  it('recusa com pontuação', () => {
    expect(cpfValido('529.982.247-25')).toBe(false);
  });

  it('recusa 10 dígitos', () => {
    expect(cpfValido('5299822472')).toBe(false);
  });
});
