import { describe, expect, it } from 'vitest';
import { carregarConfig } from './env.ts';

const SEGREDO_FICTICIO = 'a'.repeat(32);

function variaveisValidas(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'development',
    PORTA: '3000',
    DATABASE_URL: 'postgresql://usuario:senha@localhost:5432/dentagenda',
    JWT_SEGREDO: SEGREDO_FICTICIO,
    CODIGO_HMAC_SEGREDO: 'b'.repeat(32),
    ENVIADOR_MENSAGEM: 'log',
  };
}

describe('carregarConfig', () => {
  it('recusa subir quando falta JWT_SEGREDO e cita o nome, não o valor', () => {
    const variaveis = variaveisValidas();
    delete variaveis.JWT_SEGREDO;
    variaveis.CODIGO_HMAC_SEGREDO = 'segredo-que-nao-pode-vazar-na-mensagem-1234';

    expect(() => carregarConfig(variaveis)).toThrow(/JWT_SEGREDO/);
    expect(() => carregarConfig(variaveis)).not.toThrow(/segredo-que-nao-pode-vazar/);
  });

  it('recusa ENVIADOR_MENSAGEM=log com NODE_ENV=production', () => {
    const variaveis = { ...variaveisValidas(), NODE_ENV: 'production' };

    expect(() => carregarConfig(variaveis)).toThrow(/ENVIADOR_MENSAGEM/);
  });

  it('recusa segredo com menos de 32 caracteres', () => {
    const variaveis = { ...variaveisValidas(), CODIGO_HMAC_SEGREDO: 'curto' };

    expect(() => carregarConfig(variaveis)).toThrow(/CODIGO_HMAC_SEGREDO/);
  });

  it('converte PORTA para número', () => {
    const config = carregarConfig(variaveisValidas());

    expect(config.porta).toBe(3000);
    expect(config.jwtSegredo).toBe(SEGREDO_FICTICIO);
  });
});
