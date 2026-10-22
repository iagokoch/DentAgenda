import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { ErroDeNegocio } from './erros.ts';

const JANELA_EM_MS = 15 * 60 * 1000;

// Atrás de proxy, todo pedido chega com o IP do proxy até o `trust proxy` ser configurado no deploy (D32).
export function limitarRequisicoesPorIp(limite: number): RequestHandler {
  return rateLimit({
    windowMs: JANELA_EM_MS,
    limit: limite,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // Passa pelo middleware de erro para a resposta ter o formato único de docs/api.md.
    handler: (_req, _res, next) => {
      next(new ErroDeNegocio(429, 'LIMITE_DE_REQUISICOES', 'Muitos pedidos deste endereço. Tente de novo em alguns minutos.'));
    },
  });
}
