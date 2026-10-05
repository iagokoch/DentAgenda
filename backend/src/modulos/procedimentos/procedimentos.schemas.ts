import * as z from 'zod';

// D11/D18: duração positiva (o banco também tem CHECK); preço em centavos, só exibição.
const campos = {
  nome: z.string().trim().min(1),
  duracaoMinutos: z.int().positive(),
  precoCentavos: z.int().nonnegative(),
};

export const esquemaNovoProcedimento = z.object(campos);

export const esquemaEdicaoDeProcedimento = z.object({ ...campos, ativo: z.boolean() }).partial();

export type NovoProcedimento = z.infer<typeof esquemaNovoProcedimento>;
export type EdicaoDeProcedimento = z.infer<typeof esquemaEdicaoDeProcedimento>;
