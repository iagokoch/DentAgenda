import { describe, expect, it } from 'vitest';
import { criarLogger } from './logger.ts';

describe('logger', () => {
  it('troca senha, novaSenha, codigo, cpf, authorization e cookie por [OCULTO]', () => {
    const linhas: string[] = [];
    const logger = criarLogger({ write: (linha: string) => linhas.push(linha) });

    logger.info({
      senha: 'senha-original',
      novaSenha: 'nova-senha-original',
      codigo: '481516',
      cpf: '52998224725',
      corpo: { senha: 'senha-aninhada', cpf: '11144477735' },
      req: { headers: { authorization: 'Bearer token-original', cookie: 'refresh=cookie-original' } },
      res: { headers: { 'set-cookie': 'refresh=refresh-original' } },
    });

    const saida = linhas.join('');
    for (const valor of [
      'senha-original',
      'nova-senha-original',
      '481516',
      '52998224725',
      'senha-aninhada',
      '11144477735',
      'token-original',
      'cookie-original',
      'refresh-original',
    ]) {
      expect(saida).not.toContain(valor);
    }
    expect(saida).toContain('[OCULTO]');
  });
});
