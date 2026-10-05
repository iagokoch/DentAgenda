import * as z from 'zod';

export const esquemaPaginacao = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(20),
});

export function paginar(pagina: number, porPagina: number): { skip: number; take: number } {
  return { skip: (pagina - 1) * porPagina, take: porPagina };
}
