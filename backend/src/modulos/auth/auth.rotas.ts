import { Router } from 'express';
import { autenticar } from '../../compartilhado/autenticacao.ts';
import type { Contexto } from '../../compartilhado/contexto.ts';
import type { ModuloDocumentado } from '../../compartilhado/openapi.ts';
import { criarControllerAuth } from './auth.controller.ts';
import {
  esquemaConfirmacaoDeCadastro,
  esquemaConfirmacaoDeRecuperacaoCliente,
  esquemaConfirmacaoDeRecuperacaoFuncionario,
  esquemaLoginCliente,
  esquemaLoginFuncionario,
  esquemaPedidoDeCadastro,
  esquemaPedidoDeRecuperacaoCliente,
  esquemaPedidoDeRecuperacaoFuncionario,
} from './auth.schemas.ts';

export function criarRotasAuth(contexto: Contexto): Router {
  const controller = criarControllerAuth(contexto);
  const rotas = Router();
  rotas.post('/cliente/login', controller.loginCliente);
  rotas.post('/funcionario/login', controller.loginFuncionario);
  rotas.post('/cliente/recuperacao/codigo', controller.pedirRecuperacaoCliente);
  rotas.post('/funcionario/recuperacao/codigo', controller.pedirRecuperacaoFuncionario);
  rotas.post('/cliente/recuperacao/confirmar', controller.confirmarRecuperacaoCliente);
  rotas.post('/funcionario/recuperacao/confirmar', controller.confirmarRecuperacaoFuncionario);
  rotas.post('/cliente/cadastro/codigo', controller.pedirCodigoDeCadastro);
  rotas.post('/cliente/cadastro/confirmar', controller.confirmarCadastro);
  rotas.post('/refresh', controller.renovar);
  rotas.post('/logout', autenticar(contexto), controller.sair);
  rotas.get('/eu', autenticar(contexto), controller.eu);
  return rotas;
}

export const rotasDocumentadasAuth: ModuloDocumentado = {
  prefixo: '/api/auth',
  tag: 'Autenticação',
  rotas: [
    { metodo: 'post', caminho: '/cliente/login', acesso: 'publica', resumo: 'Login do paciente (CPF e senha)', corpo: esquemaLoginCliente },
    { metodo: 'post', caminho: '/funcionario/login', acesso: 'publica', resumo: 'Login do funcionário (e-mail e senha)', corpo: esquemaLoginFuncionario },
    { metodo: 'post', caminho: '/cliente/recuperacao/codigo', acesso: 'publica', resumo: 'Pede o código de recuperação de senha do paciente', corpo: esquemaPedidoDeRecuperacaoCliente },
    { metodo: 'post', caminho: '/funcionario/recuperacao/codigo', acesso: 'publica', resumo: 'Pede o código de recuperação de senha do funcionário', corpo: esquemaPedidoDeRecuperacaoFuncionario },
    { metodo: 'post', caminho: '/cliente/recuperacao/confirmar', acesso: 'publica', resumo: 'Confirma o código e define a nova senha do paciente', corpo: esquemaConfirmacaoDeRecuperacaoCliente },
    { metodo: 'post', caminho: '/funcionario/recuperacao/confirmar', acesso: 'publica', resumo: 'Confirma o código e define a nova senha do funcionário', corpo: esquemaConfirmacaoDeRecuperacaoFuncionario },
    { metodo: 'post', caminho: '/cliente/cadastro/codigo', acesso: 'publica', resumo: 'Pede o código por SMS para o autocadastro do paciente', corpo: esquemaPedidoDeCadastro },
    { metodo: 'post', caminho: '/cliente/cadastro/confirmar', acesso: 'publica', resumo: 'Confirma o código e conclui o autocadastro', corpo: esquemaConfirmacaoDeCadastro },
    { metodo: 'post', caminho: '/refresh', acesso: 'publica', resumo: 'Renova o accessToken pelo cookie de refresh (exige o cabeçalho X-DentAgenda-Refresh)' },
    { metodo: 'post', caminho: '/logout', acesso: 'logado', resumo: 'Encerra a sessão atual' },
    { metodo: 'get', caminho: '/eu', acesso: 'logado', resumo: 'Dados do usuário logado' },
  ],
};
