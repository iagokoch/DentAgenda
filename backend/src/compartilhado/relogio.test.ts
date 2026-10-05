import { describe, expect, it } from 'vitest';
import { RelogioFixo } from '../../testes/contexto-de-teste.ts';
import { relogioDoSistema } from './relogio.ts';

describe('relógio', () => {
  it('relogioDoSistema devolve o instante atual', () => {
    const antes = Date.now();
    const agora = relogioDoSistema.agora().getTime();

    expect(agora).toBeGreaterThanOrEqual(antes);
    expect(agora).toBeLessThanOrEqual(Date.now());
  });

  it('RelogioFixo avança minutos sem alterar o instante já devolvido', () => {
    const relogio = new RelogioFixo(new Date('2026-10-05T11:00:00Z'));
    const antes = relogio.agora();

    relogio.avancarMinutos(90);

    expect(antes.toISOString()).toBe('2026-10-05T11:00:00.000Z');
    expect(relogio.agora().toISOString()).toBe('2026-10-05T12:30:00.000Z');
  });

  it('RelogioFixo.definir troca o instante', () => {
    const relogio = new RelogioFixo(new Date('2026-10-05T11:00:00Z'));

    relogio.definir(new Date('2026-10-06T09:00:00Z'));

    expect(relogio.agora().toISOString()).toBe('2026-10-06T09:00:00.000Z');
  });
});
