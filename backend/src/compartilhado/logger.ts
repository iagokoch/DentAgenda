import { pino, type DestinationStream, type Level, type Logger } from 'pino';

// D23: CPF é dado pessoal (LGPD) e senha, código, token e cookie em log são credenciais vazadas.
const CAMPOS_SENSIVEIS = ['senha', 'novaSenha', 'codigo', 'cpf'];

export function criarLogger(destino?: DestinationStream, nivel: Level | 'silent' = 'info'): Logger {
  return pino(
    {
      level: nivel,
      redact: {
        paths: [
          ...CAMPOS_SENSIVEIS,
          ...CAMPOS_SENSIVEIS.map((campo) => `*.${campo}`),
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
        ],
        censor: '[OCULTO]',
      },
    },
    destino,
  );
}
