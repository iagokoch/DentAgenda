import type * as z from 'zod';

// Lança o ZodError; o middleware de erro o traduz para 400 ENTRADA_INVALIDA.
export function validar<T>(esquema: z.ZodType<T>, dado: unknown): T {
  return esquema.parse(dado);
}
