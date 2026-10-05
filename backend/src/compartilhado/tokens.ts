import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import * as z from 'zod';
import type { UsuarioAutenticado } from './autenticacao.ts';
import type { Contexto } from './contexto.ts';
import { naoAutenticado } from './erros.ts';

export const DURACAO_ACCESS_SEGUNDOS = 15 * 60;

const esquemaDoAccessToken = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('CLIENTE'), clienteId: z.string(), sessaoId: z.string() }),
  z.object({
    tipo: z.literal('FUNCIONARIO'),
    funcionarioId: z.string(),
    categoria: z.enum(['RECEPCIONISTA', 'DENTISTA']),
    isAdmin: z.boolean(),
    sessaoId: z.string(),
  }),
]);

// iat/exp vêm do relógio do contexto, não de Date.now(), para os testes controlarem a validade (D23).
const segundosAgora = (contexto: Contexto) => Math.floor(contexto.relogio.agora().getTime() / 1000);

export function gerarAccessToken(usuario: UsuarioAutenticado, contexto: Contexto): string {
  const agora = segundosAgora(contexto);
  return jwt.sign({ ...usuario, iat: agora, exp: agora + DURACAO_ACCESS_SEGUNDOS }, contexto.config.jwtSegredo, {
    algorithm: 'HS256',
  });
}

export function lerAccessToken(token: string, contexto: Contexto): UsuarioAutenticado {
  try {
    const conteudo = jwt.verify(token, contexto.config.jwtSegredo, {
      algorithms: ['HS256'],
      clockTimestamp: segundosAgora(contexto),
    });
    return esquemaDoAccessToken.parse(conteudo);
  } catch {
    throw naoAutenticado();
  }
}

// O refresh é aleatório e de alta entropia; o banco guarda só o SHA-256 (D19).
export function gerarRefreshToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashDoRefreshToken(token) };
}

export function hashDoRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
