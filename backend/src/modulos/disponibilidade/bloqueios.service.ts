import type { UsuarioAutenticado } from '../../compartilhado/autenticacao.ts';
import type { Contexto } from '../../compartilhado/contexto.ts';
import { diaSeguinte, formatarEmSaoPaulo, instanteEmSaoPaulo } from '../../compartilhado/datas.ts';
import { ErroDeNegocio, naoEncontrado, semPermissao } from '../../compartilhado/erros.ts';
import { travarDentistas } from '../../compartilhado/travas.ts';
import type { Bloqueio } from '../../generated/prisma/client.ts';
import type { NovoBloqueio } from './disponibilidade.schemas.ts';

const paraResposta = (bloqueio: Bloqueio) => ({
  id: bloqueio.id,
  dentistaId: bloqueio.dentistaId,
  inicio: formatarEmSaoPaulo(bloqueio.inicio),
  fim: formatarEmSaoPaulo(bloqueio.fim),
});

const ehDia = (texto: string) => /^\d{4}-\d{2}-\d{2}$/.test(texto);

// Só data: "de" começa à 00:00 do dia e "ate" vai até o fim dele (00:00 do dia seguinte), no fuso da clínica.
function limiteDoPeriodo(texto: string, limite: 'de' | 'ate'): Date {
  if (!ehDia(texto)) return new Date(texto);
  return instanteEmSaoPaulo(limite === 'de' ? texto : diaSeguinte(texto), '00:00');
}

// Bloqueios que tocam o período (os que só encostam nas pontas ficam de fora).
export async function listarBloqueios(contexto: Contexto, dentistaId: string, periodo: { de?: string; ate?: string }) {
  const bloqueios = await contexto.prisma.bloqueio.findMany({
    where: {
      dentistaId,
      ...(periodo.ate ? { inicio: { lt: limiteDoPeriodo(periodo.ate, 'ate') } } : {}),
      ...(periodo.de ? { fim: { gt: limiteDoPeriodo(periodo.de, 'de') } } : {}),
    },
    orderBy: [{ inicio: 'asc' }, { id: 'asc' }],
  });
  return bloqueios.map(paraResposta);
}

// D21.3: tudo ou nada. D18: consulta CONFIRMADA no período impede; o bloqueio nunca cobre consulta marcada.
export async function criarBloqueios(contexto: Contexto, usuario: UsuarioAutenticado, entrada: NovoBloqueio) {
  const dentistaIds = [...new Set(entrada.dentistaIds)];
  // D10: o dentista só bloqueia a própria agenda.
  if (usuario.tipo === 'FUNCIONARIO' && usuario.categoria === 'DENTISTA' && dentistaIds.some((id) => id !== usuario.funcionarioId)) {
    throw semPermissao();
  }
  const dentistas = await contexto.prisma.funcionario.count({ where: { id: { in: dentistaIds }, categoria: 'DENTISTA' } });
  if (dentistas !== dentistaIds.length) throw naoEncontrado();

  const inicio = new Date(entrada.inicio);
  const fim = new Date(entrada.fim);
  const criados = await contexto.prisma.$transaction(async (tx) => {
    await travarDentistas(tx, dentistaIds);
    const consultas = await tx.consulta.findMany({
      where: { dentistaId: { in: dentistaIds }, status: 'CONFIRMADA', inicio: { lt: fim }, fim: { gt: inicio } },
      include: { cliente: { select: { id: true, nome: true } } },
      orderBy: [{ inicio: 'asc' }, { id: 'asc' }],
    });
    if (consultas.length > 0) {
      throw new ErroDeNegocio(409, 'CONSULTAS_NO_PERIODO', 'Há consultas confirmadas nesse período. Resolva-as antes de bloquear.', {
        consultas: consultas.map((consulta) => ({
          id: consulta.id,
          dentistaId: consulta.dentistaId,
          inicio: formatarEmSaoPaulo(consulta.inicio),
          paciente: consulta.cliente,
        })),
      });
    }
    const bloqueios: Bloqueio[] = [];
    for (const dentistaId of dentistaIds) bloqueios.push(await tx.bloqueio.create({ data: { dentistaId, inicio, fim } }));
    return bloqueios;
  });
  return criados.map(paraResposta);
}

// D21.4: apaga a linha (nada aponta para Bloqueio). Dentista só apaga os próprios; os dos colegas respondem 404.
export async function removerBloqueio(contexto: Contexto, usuario: UsuarioAutenticado, id: string): Promise<void> {
  const bloqueio = await contexto.prisma.bloqueio.findUnique({ where: { id } });
  if (!bloqueio) throw naoEncontrado();
  if (usuario.tipo === 'FUNCIONARIO' && usuario.categoria === 'DENTISTA' && bloqueio.dentistaId !== usuario.funcionarioId) {
    throw naoEncontrado();
  }
  await contexto.prisma.bloqueio.deleteMany({ where: { id } });
}
