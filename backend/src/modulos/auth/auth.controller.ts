import type { Request, RequestHandler, Response } from 'express';
import type { UsuarioAutenticado } from '../../compartilhado/autenticacao.ts';
import type { Contexto } from '../../compartilhado/contexto.ts';
import { naoAutenticado } from '../../compartilhado/erros.ts';
import { validar } from '../../compartilhado/validacao.ts';
import {
  esquemaConfirmacaoDeRecuperacaoCliente,
  esquemaConfirmacaoDeRecuperacaoFuncionario,
  esquemaLoginCliente,
  esquemaLoginFuncionario,
  esquemaPedidoDeRecuperacaoCliente,
  esquemaPedidoDeRecuperacaoFuncionario,
} from './auth.schemas.ts';
import { loginCliente, loginFuncionario, type ResultadoDoLogin } from './login.service.ts';
import {
  apagarCookieDeRefresh,
  definirCookieDeRefresh,
  encerrarSessao,
  NOME_DO_COOKIE_DE_REFRESH,
  renovarSessao,
} from './sessoes.ts';
import {
  confirmarRecuperacaoCliente,
  confirmarRecuperacaoFuncionario,
  MENSAGEM_DE_CODIGO_ENVIADO,
  pedirRecuperacaoCliente,
  pedirRecuperacaoFuncionario,
} from './recuperacao.service.ts';
import { usuarioDoCliente, usuarioDoFuncionario } from './usuario-da-resposta.ts';

type AcoesDeAuth =
  | 'loginCliente'
  | 'loginFuncionario'
  | 'renovar'
  | 'sair'
  | 'eu'
  | 'pedirRecuperacaoCliente'
  | 'pedirRecuperacaoFuncionario'
  | 'confirmarRecuperacaoCliente'
  | 'confirmarRecuperacaoFuncionario';

// Rotas protegidas passam por autenticar(); aqui o usuário já existe.
function usuarioDe(req: Request): UsuarioAutenticado {
  if (!req.usuario) throw naoAutenticado();
  return req.usuario;
}

export function criarControllerAuth(contexto: Contexto): Record<AcoesDeAuth, RequestHandler> {
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
    renovar: async (req, res) => {
      // D19: cabeçalho próprio da aplicação, que um formulário de outro site não consegue enviar.
      const token: unknown = req.cookies?.[NOME_DO_COOKIE_DE_REFRESH];
      if (req.get('X-DentAgenda-Refresh') !== '1' || typeof token !== 'string' || !token) throw naoAutenticado();
      const sessao = await renovarSessao(contexto, token);
      definirCookieDeRefresh(res, sessao.refreshToken, sessao.expiraEm, contexto);
      res.json({ accessToken: sessao.accessToken });
    },
    sair: async (req, res) => {
      await encerrarSessao(contexto, usuarioDe(req));
      apagarCookieDeRefresh(res, contexto);
      res.status(204).end();
    },
    eu: async (req, res) => {
      const usuario = usuarioDe(req);
      if (usuario.tipo === 'CLIENTE') {
        const cliente = await contexto.prisma.cliente.findUnique({ where: { id: usuario.clienteId } });
        if (!cliente) throw naoAutenticado();
        res.json({ usuario: usuarioDoCliente(cliente) });
        return;
      }
      const funcionario = await contexto.prisma.funcionario.findUnique({ where: { id: usuario.funcionarioId } });
      if (!funcionario) throw naoAutenticado();
      res.json({ usuario: usuarioDoFuncionario(funcionario) });
    },
    pedirRecuperacaoCliente: async (req, res) => {
      const { cpf } = validar(esquemaPedidoDeRecuperacaoCliente, req.body);
      await pedirRecuperacaoCliente(contexto, cpf);
      res.status(202).json({ mensagem: MENSAGEM_DE_CODIGO_ENVIADO });
    },
    pedirRecuperacaoFuncionario: async (req, res) => {
      const { email } = validar(esquemaPedidoDeRecuperacaoFuncionario, req.body);
      await pedirRecuperacaoFuncionario(contexto, email);
      res.status(202).json({ mensagem: MENSAGEM_DE_CODIGO_ENVIADO });
    },
    confirmarRecuperacaoCliente: async (req, res) => {
      const entrada = validar(esquemaConfirmacaoDeRecuperacaoCliente, req.body);
      await confirmarRecuperacaoCliente(contexto, { ...entrada, ip: ipDe(req) });
      res.status(204).end();
    },
    confirmarRecuperacaoFuncionario: async (req, res) => {
      const entrada = validar(esquemaConfirmacaoDeRecuperacaoFuncionario, req.body);
      await confirmarRecuperacaoFuncionario(contexto, { ...entrada, ip: ipDe(req) });
      res.status(204).end();
    },
  };
}
