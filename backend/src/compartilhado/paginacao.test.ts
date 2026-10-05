import { describe, expect, it } from 'vitest';
import { esquemaPaginacao, paginar } from './paginacao.ts';

describe('paginação', () => {
  it('padrão pagina 1, porPagina 20', () => {
    expect(esquemaPaginacao.parse({})).toEqual({ pagina: 1, porPagina: 20 });
  });

  it('converte os valores da query string', () => {
    expect(esquemaPaginacao.parse({ pagina: '2', porPagina: '50' })).toEqual({ pagina: 2, porPagina: 50 });
  });

  it('recusa porPagina 101', () => {
    expect(esquemaPaginacao.safeParse({ porPagina: '101' }).success).toBe(false);
  });

  it('recusa pagina 0', () => {
    expect(esquemaPaginacao.safeParse({ pagina: '0' }).success).toBe(false);
  });

  it('pagina 3 de 20 → skip 40', () => {
    expect(paginar(3, 20)).toEqual({ skip: 40, take: 20 });
  });
});
