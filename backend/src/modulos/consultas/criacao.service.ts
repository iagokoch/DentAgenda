import type { UsuarioAutenticado } from '../../compartilhado/autenticacao.ts';
import type { Transacao } from '../../compartilhado/banco.ts';
import type { Contexto } from '../../compartilhado/contexto.ts';
import { dataEmSaoPaulo } from '../../compartilhado/datas.ts';
import { ErroDeNegocio, naoEncontrado } from '../../compartilhado/erros.ts';
import { travarDentistas } from '../../compartilhado/travas.ts';
import { cabeNaGrade, faixasDoDia, lerGrade } from '../disponibilidade/grade.service.ts';
import { horariosNoPasso, multiploDe5Minutos } from '../disponibilidade/horarios.ts';
import { formatarConsulta, incluirRelacoesDaConsulta, type ConsultaComRelacoes } from './formato.ts';

const MINUTO = 60_000;

export type NovaConsulta = {
  pacienteId: string;
  dentistaId: string;
  procedimentoId: string;
  inicio: Date;
  observacao?: string | undefined;
};

const conflito = (codigo: string, mensagem: string) => new ErroDeNegocio(409, codigo, mensagem);

// D12: o cliente só marca no passo da duração, contado a partir do início da faixa da grade.
function noPasso(grade: Awaited<ReturnType<typeof lerGrade>>, inicio: Date, duracaoMinutos: number): boolean {
  return faixasDoDia(grade, dataEmSaoPaulo(inicio)).some((faixa) =>
    horariosNoPasso(faixa, duracaoMinutos).some((horario) => horario.getTime() === inicio.getTime()),
  );
}

// D25.10, nesta ordem: grade → passo (só C) → bloqueio. A sobreposição fica com a exclusion constraint do banco.
async function conferirAgendaDoDentista(
  tx: Transacao,
  contexto: Contexto,
  usuario: UsuarioAutenticado,
  nova: { dentistaId: string; inicio: Date; fim: Date; duracaoMinutos: number },
): Promise<void> {
  const grade = await lerGrade(contexto, nova.dentistaId);
  if (!cabeNaGrade(grade, nova)) {
    throw conflito('FORA_DA_GRADE', 'O horário não cabe na agenda do dentista.');
  }
  if (usuario.tipo === 'CLIENTE' && !noPasso(grade, nova.inicio, nova.duracaoMinutos)) {
    throw conflito('FORA_DO_PASSO', 'Escolha um dos horários oferecidos.');
  }
  const bloqueio = await tx.bloqueio.findFirst({
    where: { dentistaId: nova.dentistaId, inicio: { lt: nova.fim }, fim: { gt: nova.inicio } },
    select: { id: true },
  });
  if (bloqueio) throw conflito('HORARIO_BLOQUEADO', 'O dentista não atende nesse horário.');
}

// Recebe a transação para a remarcação (Tarefa 20) criar a nova consulta junto com o cancelamento da original.
// Quem chama já travou a linha do dentista (D22.7).
export async function criarConsultaNaTransacao(
  tx: Transacao,
  contexto: Contexto,
  usuario: UsuarioAutenticado,
  entrada: NovaConsulta,
): Promise<ConsultaComRelacoes> {
  const [paciente, dentista, procedimento] = [
    await tx.cliente.findUnique({ where: { id: entrada.pacienteId }, select: { id: true } }),
    await tx.funcionario.findFirst({ where: { id: entrada.dentistaId, categoria: 'DENTISTA' } }),
    await tx.procedimento.findUnique({ where: { id: entrada.procedimentoId } }),
  ];
  // D10: dentista só mexe na própria agenda; a de um colega responde como inexistente.
  const agendaAlheia = usuario.tipo === 'FUNCIONARIO' && usuario.categoria === 'DENTISTA' && usuario.funcionarioId !== entrada.dentistaId;
  if (!paciente || !dentista || !procedimento || agendaAlheia) throw naoEncontrado();
  if (!dentista.ativo) throw new ErroDeNegocio(422, 'DENTISTA_INATIVO', 'O dentista não está ativo.');
  if (!procedimento.ativo) throw new ErroDeNegocio(422, 'PROCEDIMENTO_INATIVO', 'O procedimento não está ativo.');

  const agora = contexto.relogio.agora();
  const retroativa = entrada.inicio < agora;
  const doCliente = usuario.tipo === 'CLIENTE';
  if (doCliente && retroativa) throw new ErroDeNegocio(422, 'HORARIO_NO_PASSADO', 'Escolha um horário futuro.');
  if (!doCliente && !multiploDe5Minutos(entrada.inicio)) {
    throw conflito('FORA_DOS_5_MINUTOS', 'O horário precisa ser múltiplo de 5 minutos.');
  }

  const fim = new Date(entrada.inicio.getTime() + procedimento.duracaoMinutos * MINUTO);
  // D22.4: a clínica registra o que já aconteceu sem passar pela grade e pelo bloqueio; a sobreposição continua valendo.
  if (!retroativa) {
    await conferirAgendaDoDentista(tx, contexto, usuario, {
      dentistaId: entrada.dentistaId,
      inicio: entrada.inicio,
      fim,
      duracaoMinutos: procedimento.duracaoMinutos,
    });
  }

  const consulta = await tx.consulta.create({
    data: {
      clienteId: entrada.pacienteId,
      dentistaId: entrada.dentistaId,
      procedimentoId: entrada.procedimentoId,
      inicio: entrada.inicio,
      fim,
      status: 'CONFIRMADA',
      criadoEm: agora,
      observacao: entrada.observacao ?? null,
    },
    include: incluirRelacoesDaConsulta,
  });
  if (entrada.observacao) {
    await tx.historicoObservacao.create({
      data: {
        consultaId: consulta.id,
        texto: entrada.observacao,
        autor: doCliente ? 'PACIENTE' : 'CLINICA',
        autorFuncionarioId: usuario.tipo === 'FUNCIONARIO' ? usuario.funcionarioId : null,
        editadoEm: agora,
      },
    });
  }
  return consulta;
}

export async function criarConsulta(contexto: Contexto, usuario: UsuarioAutenticado, entrada: NovaConsulta) {
  const consulta = await contexto.prisma.$transaction(async (tx) => {
    await travarDentistas(tx, [entrada.dentistaId]);
    return criarConsultaNaTransacao(tx, contexto, usuario, entrada);
  });
  return formatarConsulta(consulta);
}
