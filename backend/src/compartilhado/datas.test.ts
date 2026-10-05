import { describe, expect, it } from 'vitest';
import {
  dataEmSaoPaulo,
  diaDaSemana,
  formatarEmSaoPaulo,
  instanteEmSaoPaulo,
  minutosDoDiaEmSaoPaulo,
} from './datas.ts';

describe('datas no fuso da clínica', () => {
  it('08:00 de 2026-10-05 em São Paulo é 11:00Z', () => {
    expect(instanteEmSaoPaulo('2026-10-05', '08:00').toISOString()).toBe('2026-10-05T11:00:00.000Z');
  });

  it('22:00 de segunda em São Paulo é terça em UTC, mas dataEmSaoPaulo devolve segunda', () => {
    const instante = instanteEmSaoPaulo('2026-10-05', '22:00');

    expect(instante.toISOString().slice(0, 10)).toBe('2026-10-06');
    expect(dataEmSaoPaulo(instante)).toBe('2026-10-05');
  });

  it('formata com -03:00', () => {
    expect(formatarEmSaoPaulo(new Date('2026-10-05T11:00:00Z'))).toBe('2026-10-05T08:00:00-03:00');
  });

  it('2026-10-05 é segunda (1)', () => {
    expect(diaDaSemana('2026-10-05')).toBe(1);
  });

  it('08:30 em São Paulo é o minuto 510 do dia', () => {
    expect(minutosDoDiaEmSaoPaulo(new Date('2026-10-05T11:30:00Z'))).toBe(510);
  });
});
