import * as z from 'zod';
import { cpfValido } from './cpf.ts';

// D25.1 e api.md: só dígitos, com dígitos verificadores corretos.
export const esquemaCpf = z.string().refine(cpfValido, { error: 'CPF inválido.' });

// D28: e-mail sempre em minúsculas, na entrada e no banco.
export const esquemaEmail = z.email().toLowerCase();

// D20: 8 a 72 caracteres (72 é o limite do bcrypt), sem regra de composição.
export const esquemaSenha = z.string().min(8).max(72);

// Lança o ZodError; o middleware de erro o traduz para 400 ENTRADA_INVALIDA.
export function validar<T>(esquema: z.ZodType<T>, dado: unknown): T {
  return esquema.parse(dado);
}

// api.md: telefone só com dígitos, com DDD (fixo 10, celular 11).
export const esquemaTelefone = z.string().regex(/^\d{10,11}$/, { error: 'Telefone só com dígitos, com DDD.' });
