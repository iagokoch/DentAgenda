import * as z from 'zod';
import { esquemaCpf, esquemaSenha } from '../../compartilhado/validacao.ts';

export const esquemaLoginCliente = z.object({ cpf: esquemaCpf, senha: esquemaSenha });

export const esquemaLoginFuncionario = z.object({ email: z.email(), senha: esquemaSenha });
