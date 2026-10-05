import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';

const CUSTO_DO_BCRYPT = 12;

export function gerarHashDeSenha(senha: string): Promise<string> {
  return bcrypt.hash(senha, CUSTO_DO_BCRYPT);
}

export function conferirSenha(senha: string, hash: string): Promise<boolean> {
  return bcrypt.compare(senha, hash);
}

// D21: conta de funcionário nasce com senha que ninguém conhece; ele define a dele pela recuperação.
export function gerarSenhaAleatoria(): string {
  return randomBytes(32).toString('base64url');
}
