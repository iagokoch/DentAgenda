import { formatarEmSaoPaulo } from '../../compartilhado/datas.ts';
import type { Prisma } from '../../generated/prisma/client.ts';

// D24.3: toda rota de consultas devolve paciente, dentista e procedimento com id e nome.
export const incluirRelacoesDaConsulta = {
  cliente: { select: { id: true, nome: true } },
  dentista: { select: { id: true, nome: true } },
  procedimento: { select: { id: true, nome: true } },
} satisfies Prisma.ConsultaInclude;

export type ConsultaComRelacoes = Prisma.ConsultaGetPayload<{ include: typeof incluirRelacoesDaConsulta }>;

const emSaoPauloOuNulo = (instante: Date | null) => (instante ? formatarEmSaoPaulo(instante) : null);

export function formatarConsulta(consulta: ConsultaComRelacoes) {
  return {
    id: consulta.id,
    paciente: consulta.cliente,
    dentista: consulta.dentista,
    procedimento: consulta.procedimento,
    inicio: formatarEmSaoPaulo(consulta.inicio),
    fim: formatarEmSaoPaulo(consulta.fim),
    status: consulta.status,
    observacao: consulta.observacao,
    criadoEm: formatarEmSaoPaulo(consulta.criadoEm),
    canceladoEm: emSaoPauloOuNulo(consulta.canceladoEm),
    canceladoPor: consulta.canceladoPor,
    justificativa: consulta.justificativa,
  };
}
