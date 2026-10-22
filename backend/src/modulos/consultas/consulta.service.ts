import type { UsuarioAutenticado } from '../../compartilhado/autenticacao.ts';
import type { Transacao } from '../../compartilhado/banco.ts';
import type { Contexto } from '../../compartilhado/contexto.ts';
import { limiteDoPeriodo } from '../../compartilhado/datas.ts';
import { naoEncontrado } from '../../compartilhado/erros.ts';
import { paginar } from '../../compartilhado/paginacao.ts';
import type { Prisma } from '../../generated/prisma/client.ts';
import type { FiltroDeConsultas } from './consultas.schemas.ts';
import { formatarConsulta, incluirRelacoesDaConsulta, type ConsultaComRelacoes } from './formato.ts';

// D10: o cliente só vê as próprias consultas, o dentista só as da própria agenda e a recepção vê todas.
// Quem não pode ver uma consulta recebe o mesmo 404 de quem pede uma que não existe (D20.5).
function visibilidadeDe(usuario: UsuarioAutenticado): Prisma.ConsultaWhereInput {
  if (usuario.tipo === 'CLIENTE') return { clienteId: usuario.clienteId };
  if (usuario.categoria === 'DENTISTA') return { dentistaId: usuario.funcionarioId };
  return {};
}

// Reaproveitada por cancelamento, realização e observação. Dentro de uma transação, passe o `tx` em `banco`.
export async function buscarConsultaVisivel(
  contexto: Contexto,
  usuario: UsuarioAutenticado,
  id: string,
  banco: Transacao = contexto.prisma,
): Promise<ConsultaComRelacoes> {
  const consulta = await banco.consulta.findFirst({
    where: { id, ...visibilidadeDe(usuario) },
    include: incluirRelacoesDaConsulta,
  });
  if (!consulta) throw naoEncontrado();
  return consulta;
}

export async function verConsulta(contexto: Contexto, usuario: UsuarioAutenticado, id: string) {
  return formatarConsulta(await buscarConsultaVisivel(contexto, usuario, id));
}

const emOrdemDeInicio = [{ inicio: 'asc' }, { id: 'asc' }] satisfies Prisma.ConsultaOrderByWithRelationInput[];

async function listarComFiltro(contexto: Contexto, where: Prisma.ConsultaWhereInput, pagina: number, porPagina: number) {
  const [consultas, total] = await Promise.all([
    contexto.prisma.consulta.findMany({
      where,
      include: incluirRelacoesDaConsulta,
      orderBy: emOrdemDeInicio,
      ...paginar(pagina, porPagina),
    }),
    contexto.prisma.consulta.count({ where }),
  ]);
  return { itens: consultas.map(formatarConsulta), total };
}

// A consulta pertence ao dia em que começa (no fuso de São Paulo); a visibilidade vem depois dos filtros e vence
// qualquer dentistaId ou pacienteId que o usuário peça fora do que pode ver.
export async function listarConsultas(contexto: Contexto, usuario: UsuarioAutenticado, filtro: FiltroDeConsultas) {
  const periodo: Prisma.DateTimeFilter = {
    ...(filtro.de ? { gte: limiteDoPeriodo(filtro.de, 'de') } : {}),
    ...(filtro.ate ? { lt: limiteDoPeriodo(filtro.ate, 'ate') } : {}),
  };
  const where: Prisma.ConsultaWhereInput = {
    ...(filtro.dentistaId ? { dentistaId: filtro.dentistaId } : {}),
    ...(filtro.pacienteId ? { clienteId: filtro.pacienteId } : {}),
    ...(filtro.status ? { status: filtro.status } : {}),
    ...(filtro.de || filtro.ate ? { inicio: periodo } : {}),
    ...visibilidadeDe(usuario),
  };
  return listarComFiltro(contexto, where, filtro.pagina, filtro.porPagina);
}

// D13.4: CONFIRMADA cujo horário já terminou e que ainda não foi marcada como REALIZADA ou cancelada.
export async function listarPendentes(
  contexto: Contexto,
  usuario: UsuarioAutenticado,
  paginacao: { pagina: number; porPagina: number },
) {
  const where: Prisma.ConsultaWhereInput = {
    status: 'CONFIRMADA',
    fim: { lt: contexto.relogio.agora() },
    ...visibilidadeDe(usuario),
  };
  return listarComFiltro(contexto, where, paginacao.pagina, paginacao.porPagina);
}
