import type { UsuarioAutenticado } from '../../compartilhado/autenticacao.ts';
import type { Contexto } from '../../compartilhado/contexto.ts';
import { ErroDeNegocio } from '../../compartilhado/erros.ts';
import { buscarConsultaVisivel } from './consulta.service.ts';
import { formatarConsulta } from './formato.ts';

const naoConfirmada = () => new ErroDeNegocio(422, 'CONSULTA_NAO_CONFIRMADA', 'Só consultas confirmadas podem ser marcadas como realizadas.');

// D13: REALIZADA é marcada à mão, pelo dentista da consulta ou pela recepção, depois do horário de início.
export async function realizarConsulta(contexto: Contexto, usuario: UsuarioAutenticado, consultaId: string) {
  const consulta = await buscarConsultaVisivel(contexto, usuario, consultaId);
  if (consulta.status !== 'CONFIRMADA') throw naoConfirmada();
  if (contexto.relogio.agora() < consulta.inicio) {
    throw new ErroDeNegocio(422, 'CONSULTA_NAO_INICIADA', 'A consulta ainda não começou.');
  }

  // Só marca se ninguém cancelou ou realizou entre a leitura e a escrita.
  const atualizadas = await contexto.prisma.consulta.updateMany({
    where: { id: consultaId, status: 'CONFIRMADA' },
    data: { status: 'REALIZADA' },
  });
  if (atualizadas.count === 0) throw naoConfirmada();
  return formatarConsulta(await buscarConsultaVisivel(contexto, usuario, consultaId));
}
