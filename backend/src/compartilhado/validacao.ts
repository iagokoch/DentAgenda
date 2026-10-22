import * as z from 'zod';
import { cpfValido } from './cpf.ts';
import { naoEncontrado } from './erros.ts';

// D25.1 e api.md: só dígitos, com dígitos verificadores corretos.
export const esquemaCpf = z.string().refine(cpfValido, { error: 'CPF inválido.' });

// D28: e-mail sempre em minúsculas, na entrada e no banco.
export const esquemaEmail = z.email().toLowerCase();

// D20: mínimo de 8 caracteres e máximo de 72 bytes (limite do bcrypt, que trunca o resto em silêncio; acento e
// emoji ocupam mais de um byte), sem regra de composição.
const LIMITE_DE_BYTES_DO_BCRYPT = 72;
export const esquemaSenha = z
  .string()
  .min(8)
  .refine((senha) => Buffer.byteLength(senha, 'utf8') <= LIMITE_DE_BYTES_DO_BCRYPT, {
    error: `Senha com no máximo ${LIMITE_DE_BYTES_DO_BCRYPT} bytes.`,
  });

// Lança o ZodError; o middleware de erro o traduz para 400 ENTRADA_INVALIDA.
export function validar<T>(esquema: z.ZodType<T>, dado: unknown): T {
  return esquema.parse(dado);
}

// api.md: telefone só com dígitos, com DDD (fixo 10, celular 11).
export const esquemaTelefone = z.string().regex(/^\d{10,11}$/, { error: 'Telefone só com dígitos, com DDD.' });

// D20: id que não é UUID não aponta para nada; responde como recurso inexistente, não 400 nem 500.
export function idDaRota(valor: unknown): string {
  const id = z.uuid().safeParse(valor);
  if (!id.success) throw naoEncontrado();
  return id.data;
}
