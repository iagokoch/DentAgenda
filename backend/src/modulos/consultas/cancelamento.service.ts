import type { UsuarioAutenticado } from '../../compartilhado/autenticacao.ts';
import type { Transacao } from '../../compartilhado/banco.ts';
import type { Contexto } from '../../compartilhado/contexto.ts';
import { ErroDeNegocio } from '../../compartilhado/erros.ts';
import { travarDentistas } from '../../compartilhado/travas.ts';
import { buscarConsultaVisivel } from './consulta.service.ts';
import { criarConsultaNaTransacao } from './criacao.service.ts';
import { formatarConsulta, incluirRelacoesDaConsulta, type ConsultaComRelacoes } from './formato.ts';
import { avisarCancelamentoDaClinica, avisarRemarcacaoDaClinica } from './mensagens-de-consulta.ts';

// D14: o paciente cancela sem justificativa até 24 h antes; depois disso precisa explicar.
export const ANTECEDENCIA_SEM_JUSTIFICATIVA_HORAS = 24;
const HORA = 60 * 60_000;

const regraDoCancelamento = (codigo: string, mensagem: string) => new ErroDeNegocio(422, codigo, mensagem);
const naoCancelavel = () => regraDoCancelamento('CONSULTA_NAO_CANCELAVEL', 'Só consultas confirmadas podem ser canceladas.');

// Regras na ordem: visível (404) → CONFIRMADA → paciente: já iniciada → paciente: menos de 24 h sem justificativa.
export async function cancelarConsultaNaTransacao(
  tx: Transacao,
  contexto: Contexto,
  usuario: UsuarioAutenticado,
  consultaId: string,
  justificativa?: string,
): Promise<ConsultaComRelacoes> {
  const consulta = await buscarConsultaVisivel(contexto, usuario, consultaId, tx);
  if (consulta.status !== 'CONFIRMADA') throw naoCancelavel();

  const agora = contexto.relogio.agora();
  if (usuario.tipo === 'CLIENTE') {
    if (agora >= consulta.inicio) {
      throw regraDoCancelamento('CONSULTA_JA_INICIADA', 'A consulta já começou e não pode mais ser cancelada pelo aplicativo.');
    }
    const antecedenciaEmMs = consulta.inicio.getTime() - agora.getTime();
    if (antecedenciaEmMs < ANTECEDENCIA_SEM_JUSTIFICATIVA_HORAS * HORA && !justificativa) {
      throw regraDoCancelamento('JUSTIFICATIVA_OBRIGATORIA', 'Informe o motivo: faltam menos de 24 horas para a consulta.');
    }
  }

  // Só cancela se ninguém cancelou ou realizou entre a leitura e a escrita.
  const atualizadas = await tx.consulta.updateMany({
    where: { id: consultaId, status: 'CONFIRMADA' },
    data: {
      status: 'CANCELADA',
      canceladoEm: agora,
      canceladoPor: usuario.tipo === 'CLIENTE' ? 'PACIENTE' : 'CLINICA',
      canceladoPorFuncionarioId: usuario.tipo === 'FUNCIONARIO' ? usuario.funcionarioId : null,
      justificativa: justificativa ?? null,
    },
  });
  if (atualizadas.count === 0) throw naoCancelavel();
  return tx.consulta.findUniqueOrThrow({ where: { id: consultaId }, include: incluirRelacoesDaConsulta });
}

export async function cancelarConsulta(contexto: Contexto, usuario: UsuarioAutenticado, consultaId: string, justificativa?: string) {
  const cancelada = await contexto.prisma.$transaction((tx) => cancelarConsultaNaTransacao(tx, contexto, usuario, consultaId, justificativa));
  if (usuario.tipo === 'FUNCIONARIO') await avisarCancelamentoDaClinica(contexto, cancelada);
  return formatarConsulta(cancelada);
}

export type Remarcacao = {
  inicio: Date;
  dentistaId?: string | undefined;
  procedimentoId?: string | undefined;
  justificativa?: string | undefined;
};

// D14 e D22.1: numa transação só, cancela a original (com todas as regras do cancelamento) e cria a nova (com todas
// as da criação). Se qualquer parte falhar, nada muda. O cancelamento vem primeiro: remarcar 30 min para frente
// sobrepõe a original, que só deixa de contar para a exclusion constraint depois de cancelada.
export async function remarcarConsulta(contexto: Contexto, usuario: UsuarioAutenticado, consultaId: string, entrada: Remarcacao) {
  const { cancelada, nova } = await contexto.prisma.$transaction(async (tx) => {
    const original = await buscarConsultaVisivel(contexto, usuario, consultaId, tx);
    const dentistaId = entrada.dentistaId ?? original.dentista.id;
    await travarDentistas(tx, [...new Set([original.dentista.id, dentistaId])]);

    const cancelada = await cancelarConsultaNaTransacao(tx, contexto, usuario, consultaId, entrada.justificativa);
    const nova = await criarConsultaNaTransacao(tx, contexto, usuario, {
      pacienteId: original.cliente.id,
      dentistaId,
      procedimentoId: entrada.procedimentoId ?? original.procedimento.id,
      inicio: entrada.inicio,
    });
    return { cancelada, nova };
  });
  if (usuario.tipo === 'FUNCIONARIO') await avisarRemarcacaoDaClinica(contexto, nova);
  return { cancelada: formatarConsulta(cancelada), nova: formatarConsulta(nova) };
}
