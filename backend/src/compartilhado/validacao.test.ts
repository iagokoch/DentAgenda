import { describe, expect, it } from 'vitest';
import { esquemaSenha } from './validacao.ts';

describe('esquemaSenha', () => {
  it('aceita 72 bytes, o limite do bcrypt', () => {
    expect(esquemaSenha.safeParse('a'.repeat(72)).success).toBe(true);
    expect(esquemaSenha.safeParse('é'.repeat(36)).success).toBe(true);
  });

  it('recusa mais de 72 bytes mesmo com menos de 72 caracteres', () => {
    expect(esquemaSenha.safeParse('a'.repeat(73)).success).toBe(false);
    expect(esquemaSenha.safeParse('é'.repeat(37)).success).toBe(false);
  });

  it('recusa menos de 8 caracteres', () => {
    expect(esquemaSenha.safeParse('1234567').success).toBe(false);
  });
});
