import { Router } from 'express';
import { autenticar, exigirPapel } from '../../compartilhado/autenticacao.ts';
import type { Contexto } from '../../compartilhado/contexto.ts';
import { criarControllerPacientes } from './pacientes.controller.ts';
import type { ModuloDocumentado } from '../../compartilhado/openapi.ts';
import { esquemaBuscaDeAlertas, esquemaBuscaDePacientes, esquemaEdicaoPelaRecepcao, esquemaEndereco, esquemaNovoAlerta, esquemaNovoPaciente } from './pacientes.schemas.ts';

export function criarRotasPacientes(contexto: Contexto): Router {
  const controller = criarControllerPacientes(contexto);
  const rotas = Router();
  rotas.use(autenticar(contexto));
  rotas.get('/', exigirPapel('R', 'D'), controller.buscar);
  rotas.post('/', exigirPapel('R'), controller.cadastrar);
  rotas.get('/:id', exigirPapel('R', 'D', 'C'), controller.ver);
  // O 403 do dentista e a ordem dos erros ficam no service (D25.7).
  rotas.patch('/:id', exigirPapel('R', 'D', 'C'), controller.editar);
  rotas.put('/:id/endereco', exigirPapel('R', 'C'), controller.gravarEndereco);
  rotas.delete('/:id/endereco', exigirPapel('R', 'C'), controller.removerEndereco);
  rotas.get('/:id/alertas', exigirPapel('R', 'D', 'C'), controller.listarAlertas);
  rotas.post('/:id/alertas', exigirPapel('R', 'D', 'C'), controller.criarAlerta);
  rotas.delete('/:id/alertas/:alertaId', exigirPapel('R', 'D'), controller.removerAlerta);
  return rotas;
}

export const rotasDocumentadasPacientes: ModuloDocumentado = {
  prefixo: '/api/pacientes',
  tag: 'Pacientes',
  rotas: [
    { metodo: 'get', caminho: '/', acesso: ['R', 'D'], resumo: 'Busca pacientes por nome ou CPF', consulta: esquemaBuscaDePacientes },
    { metodo: 'post', caminho: '/', acesso: ['R'], resumo: 'Cadastra um paciente', corpo: esquemaNovoPaciente },
    { metodo: 'get', caminho: '/:id', acesso: ['R', 'D', 'C'], resumo: 'Consulta um paciente' },
    { metodo: 'patch', caminho: '/:id', acesso: ['R', 'D', 'C'], resumo: 'Edita um paciente (o paciente edita só alguns campos; dentista não edita)', corpo: esquemaEdicaoPelaRecepcao },
    { metodo: 'put', caminho: '/:id/endereco', acesso: ['R', 'C'], resumo: 'Grava o endereço do paciente', corpo: esquemaEndereco },
    { metodo: 'delete', caminho: '/:id/endereco', acesso: ['R', 'C'], resumo: 'Remove o endereço do paciente' },
    { metodo: 'get', caminho: '/:id/alertas', acesso: ['R', 'D', 'C'], resumo: 'Lista os alertas do paciente', consulta: esquemaBuscaDeAlertas },
    { metodo: 'post', caminho: '/:id/alertas', acesso: ['R', 'D', 'C'], resumo: 'Cria um alerta para o paciente', corpo: esquemaNovoAlerta },
    { metodo: 'delete', caminho: '/:id/alertas/:alertaId', acesso: ['R', 'D'], resumo: 'Remove um alerta do paciente' },
  ],
};
