import { Router } from 'express';
import { autenticar, exigirPapel } from '../../compartilhado/autenticacao.ts';
import type { Contexto } from '../../compartilhado/contexto.ts';
import { criarControllerPacientes } from './pacientes.controller.ts';

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
