import * as z from 'zod';
import { esquemaCpf, esquemaEmail, esquemaSenha } from '../../compartilhado/validacao.ts';

export const esquemaLoginCliente = z.object({ cpf: esquemaCpf, senha: esquemaSenha });

export const esquemaLoginFuncionario = z.object({ email: esquemaEmail, senha: esquemaSenha });
