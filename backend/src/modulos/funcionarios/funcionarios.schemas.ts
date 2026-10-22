import * as z from 'zod';
import { esquemaCpf, esquemaEmail } from '../../compartilhado/validacao.ts';

// api.md: o POST não recebe senha (D21.1). CRO só é obrigatório para DENTISTA — regra de negócio (422), não de formato.
const campos = {
  nome: z.string().trim().min(1),
  cpf: esquemaCpf,
  email: esquemaEmail,
  categoria: z.enum(['RECEPCIONISTA', 'DENTISTA']),
  cro: z.string().trim().min(1),
  dataInicio: z.iso.date(),
  isAdmin: z.boolean(),
};

export const esquemaNovoFuncionario = z.object({ ...campos, cro: campos.cro.optional(), isAdmin: campos.isAdmin.optional() });

export const esquemaEdicaoDeFuncionario = z.object({ ...campos, ativo: z.boolean() }).partial();

export type NovoFuncionario = z.infer<typeof esquemaNovoFuncionario>;
export type EdicaoDeFuncionario = z.infer<typeof esquemaEdicaoDeFuncionario>;
