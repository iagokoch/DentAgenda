import type { Contexto } from '../../compartilhado/contexto.ts';
import { formatarEmSaoPaulo } from '../../compartilhado/datas.ts';
import type { ConsultaComRelacoes } from './formato.ts';

// "2026-10-05T09:00:00-03:00" → "05/10 às 09:00"
function diaEHora(instante: Date): string {
  const [, mes, dia, hora, minuto] = /^\d{4}-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(formatarEmSaoPaulo(instante)) ?? [];
  return `${dia}/${mes} às ${hora}:${minuto}`;
}

async function enviarAoPaciente(
  contexto: Contexto,
  consulta: ConsultaComRelacoes,
  operacao: 'CANCELAMENTO' | 'REMARCACAO',
  texto: string,
): Promise<void> {
  // A consulta já foi salva: falhas nesta leitura ou no transporte não devem transformar sucesso em HTTP 500.
  try {
    const { telefone } = await contexto.prisma.cliente.findUniqueOrThrow({ where: { id: consulta.cliente.id }, select: { telefone: true } });
    await contexto.enviador.enviar(telefone, texto);
  } catch {
    contexto.logger.warn({ evento: 'FALHA_NOTIFICACAO_CONSULTA', operacao, consultaId: consulta.id }, 'Notificação da consulta não enviada após gravação.');
  }
}

// D14.5: o SMS sai depois do commit, para uma falha no envio nunca desfazer o cancelamento.
export function avisarCancelamentoDaClinica(contexto: Contexto, consulta: ConsultaComRelacoes): Promise<void> {
  return enviarAoPaciente(
    contexto,
    consulta,
    'CANCELAMENTO',
    `A clínica cancelou sua consulta de ${consulta.procedimento.nome} de ${diaEHora(consulta.inicio)}. Ligue para reagendar.`,
  );
}

// D25.11: na remarcação o paciente recebe um SMS só, com o horário novo.
export function avisarRemarcacaoDaClinica(contexto: Contexto, nova: ConsultaComRelacoes): Promise<void> {
  return enviarAoPaciente(
    contexto,
    nova,
    'REMARCACAO',
    `Sua consulta de ${nova.procedimento.nome} foi remarcada para ${diaEHora(nova.inicio)}.`,
  );
}
