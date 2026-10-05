import * as z from 'zod';
import { esquemaCpf, esquemaEmail, esquemaSenha } from '../../compartilhado/validacao.ts';

const esquemaCodigo = z.string().regex(/^\d{6}$/, { error: 'O código tem 6 dígitos.' });

export const esquemaLoginCliente = z.object({ cpf: esquemaCpf, senha: esquemaSenha });

export const esquemaLoginFuncionario = z.object({ email: esquemaEmail, senha: esquemaSenha });

export const esquemaPedidoDeRecuperacaoCliente = z.object({ cpf: esquemaCpf });

export const esquemaPedidoDeRecuperacaoFuncionario = z.object({ email: esquemaEmail });

export const esquemaConfirmacaoDeRecuperacaoCliente = z.object({
  cpf: esquemaCpf,
  codigo: esquemaCodigo,
  novaSenha: esquemaSenha,
});

export const esquemaConfirmacaoDeRecuperacaoFuncionario = z.object({
  email: esquemaEmail,
  codigo: esquemaCodigo,
  novaSenha: esquemaSenha,
});
