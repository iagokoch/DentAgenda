import { pino, stdSerializers, type DestinationStream, type Level, type Logger } from 'pino';

// D23: CPF é dado pessoal (LGPD) e senha, código, token e cookie em log são credenciais vazadas.
const CAMPOS_SENSIVEIS = ['senha', 'novaSenha', 'codigo', 'cpf'];

// A busca de pacientes recebe o CPF na query string (`?busca=`), e o redact não alcança trecho de URL.
export const serializarRequisicao = stdSerializers.wrapRequestSerializer((requisicao) => ({
  ...requisicao,
  url: requisicao.url.split('?')[0],
  query: undefined,
}));

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
