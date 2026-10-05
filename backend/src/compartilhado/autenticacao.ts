import type { RequestHandler } from 'express';
import type { Contexto } from './contexto.ts';
import { naoAutenticado, semPermissao } from './erros.ts';
import { lerAccessToken } from './tokens.ts';

export type UsuarioAutenticado =
  | { tipo: 'CLIENTE'; clienteId: string; sessaoId: string }
  | {
      tipo: 'FUNCIONARIO';
      funcionarioId: string;
      categoria: 'RECEPCIONISTA' | 'DENTISTA';
      isAdmin: boolean;
      sessaoId: string;
    };

// Legenda de docs/api.md: R = recepcionista, D = dentista, A = admin (soma-se à categoria), C = cliente.
export type Papel = 'R' | 'D' | 'A' | 'C';

declare module 'express-serve-static-core' {
  interface Request {
    usuario?: UsuarioAutenticado;
  }
}

export function autenticar(contexto: Contexto): RequestHandler {
  return (req, _res, next) => {
    const cabecalho = req.headers.authorization;
    if (!cabecalho?.startsWith('Bearer ')) throw naoAutenticado();
    req.usuario = lerAccessToken(cabecalho.slice('Bearer '.length), contexto);
    next();
  };
}

export function exigirPapel(...papeis: Papel[]): RequestHandler {
  return (req, _res, next) => {
    const usuario = req.usuario;
    if (!usuario) throw naoAutenticado();
    if (!papeis.some((papel) => temPapel(usuario, papel))) throw semPermissao();
    next();
  };
}

function temPapel(usuario: UsuarioAutenticado, papel: Papel): boolean {
  if (usuario.tipo === 'CLIENTE') return papel === 'C';
  if (papel === 'R') return usuario.categoria === 'RECEPCIONISTA';
  if (papel === 'D') return usuario.categoria === 'DENTISTA';
  return papel === 'A' && usuario.isAdmin;
}
