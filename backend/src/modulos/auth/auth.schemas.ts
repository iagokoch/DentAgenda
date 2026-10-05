import * as z from 'zod';
import { esquemaCpf, esquemaEmail, esquemaSenha, esquemaTelefone } from '../../compartilhado/validacao.ts';

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

export const esquemaPedidoDeCadastro = z.object({ cpf: esquemaCpf, telefone: esquemaTelefone });

export const esquemaConfirmacaoDeCadastro = z.object({
  cpf: esquemaCpf,
  telefone: esquemaTelefone,
  codigo: esquemaCodigo,
  senha: esquemaSenha,
  nome: z.string().trim().min(1),
  email: esquemaEmail.optional(),
  nascimento: z.iso.date().optional(),
});
