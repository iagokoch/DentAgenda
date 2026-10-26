import type { Request, RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { ErroDeNegocio } from './erros.ts';

const JANELA_EM_MS = 15 * 60 * 1000;

// Atrás de proxy, o IP vem do `trust proxy` (PROXY_CONFIAVEL, D40); sem ele, todo pedido teria o IP do proxy.
// `ignorar` tira do limite os pedidos que não gastam bcrypt nem SMS (D40: o refresh de cada carregamento de página).
export function limitarRequisicoesPorIp(limite: number, ignorar: (req: Request) => boolean = () => false): RequestHandler {
  return rateLimit({
    windowMs: JANELA_EM_MS,
    limit: limite,
    skip: ignorar,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // Passa pelo middleware de erro para a resposta ter o formato único de docs/api.md.
    handler: (_req, _res, next) => {
      next(new ErroDeNegocio(429, 'LIMITE_DE_REQUISICOES', 'Muitos pedidos deste endereço. Tente de novo em alguns minutos.'));
    },
  });
}
