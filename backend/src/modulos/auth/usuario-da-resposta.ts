import type { UsuarioAutenticado } from '../../compartilhado/autenticacao.ts';
import type { Cliente, Funcionario } from '../../generated/prisma/client.ts';

// Objeto `usuario` do docs/api.md, devolvido no login e em GET /api/auth/eu.
export type UsuarioDaResposta =
  | { id: string; tipo: 'CLIENTE'; nome: string }
  | { id: string; tipo: 'FUNCIONARIO'; nome: string; categoria: 'RECEPCIONISTA' | 'DENTISTA'; isAdmin: boolean };

export function usuarioDoCliente(cliente: Pick<Cliente, 'id' | 'nome'>): UsuarioDaResposta {
  return { id: cliente.id, tipo: 'CLIENTE', nome: cliente.nome };
}

export function usuarioDoFuncionario(
  funcionario: Pick<Funcionario, 'id' | 'nome' | 'categoria' | 'isAdmin'>,
): UsuarioDaResposta {
  const { id, nome, categoria, isAdmin } = funcionario;
  return { id, tipo: 'FUNCIONARIO', nome, categoria, isAdmin };
}

export function autenticadoDoFuncionario(
  funcionario: Pick<Funcionario, 'id' | 'categoria' | 'isAdmin'>,
  sessaoId: string,
): UsuarioAutenticado {
  const { categoria, isAdmin } = funcionario;
  return { tipo: 'FUNCIONARIO', funcionarioId: funcionario.id, categoria, isAdmin, sessaoId };
}
