import type { Request, RequestHandler, Response } from 'express';
import type { Contexto } from '../../compartilhado/contexto.ts';
import { validar } from '../../compartilhado/validacao.ts';
import { esquemaLoginCliente, esquemaLoginFuncionario } from './auth.schemas.ts';
import { loginCliente, loginFuncionario, type ResultadoDoLogin } from './login.service.ts';
import { definirCookieDeRefresh } from './sessoes.ts';

export function criarControllerAuth(contexto: Contexto): Record<'loginCliente' | 'loginFuncionario', RequestHandler> {
  const responderLogin = (res: Response, resultado: ResultadoDoLogin) => {
    definirCookieDeRefresh(res, resultado.refreshToken, resultado.expiraEm, contexto);
    res.json({ accessToken: resultado.accessToken, usuario: resultado.usuario });
  };
  const ipDe = (req: Request) => req.ip ?? 'desconhecido';

  return {
    loginCliente: async (req, res) => {
      const entrada = validar(esquemaLoginCliente, req.body);
      responderLogin(res, await loginCliente(contexto, { ...entrada, ip: ipDe(req) }));
    },
    loginFuncionario: async (req, res) => {
      const entrada = validar(esquemaLoginFuncionario, req.body);
      responderLogin(res, await loginFuncionario(contexto, { ...entrada, ip: ipDe(req) }));
    },
  };
}
