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

describe('PROXY_CONFIAVEL (D40)', () => {
  const comProxy = (valor: string) => carregarConfig({ ...variaveisValidas(), PROXY_CONFIAVEL: valor });

  it('ausente, vazio ou 0: não confia em proxy nenhum', () => {
    expect(carregarConfig(variaveisValidas()).proxyConfiavel).toBe(false);
    expect(comProxy('').proxyConfiavel).toBe(false);
    expect(comProxy('0').proxyConfiavel).toBe(false);
  });

  it('número: quantos proxies há na frente', () => {
    expect(comProxy('2').proxyConfiavel).toBe(2);
  });

  it('lista de IPs, sub-redes e nomes do Express', () => {
    expect(comProxy('loopback, 10.0.0.0/8,192.168.0.10, ::1').proxyConfiavel).toEqual(['loopback', '10.0.0.0/8', '192.168.0.10', '::1']);
  });

  it('recusa "true" e valores que não são IP nem nome conhecido', () => {
    expect(() => comProxy('true')).toThrow(/PROXY_CONFIAVEL/);
    expect(() => comProxy('meu-proxy')).toThrow(/PROXY_CONFIAVEL/);
    expect(() => comProxy('10.0.0.0/99')).toThrow(/PROXY_CONFIAVEL/);
  });
});

describe('RETENCAO_DIAS (D40)', () => {
  it('padrão de 90 dias, pendente de confirmação com a clínica; vazio (como no .env.example) também', () => {
    expect(carregarConfig(variaveisValidas()).retencaoDias).toBe(90);
    expect(carregarConfig({ ...variaveisValidas(), RETENCAO_DIAS: '', PROXY_CONFIAVEL: '' }).retencaoDias).toBe(90);
  });

  it('aceita outro prazo e recusa menos de 1 dia', () => {
    expect(carregarConfig({ ...variaveisValidas(), RETENCAO_DIAS: '30' }).retencaoDias).toBe(30);
    expect(() => carregarConfig({ ...variaveisValidas(), RETENCAO_DIAS: '0' })).toThrow(/RETENCAO_DIAS/);
  });
});
