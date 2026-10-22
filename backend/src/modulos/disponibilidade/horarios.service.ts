import type { UsuarioAutenticado } from '../../compartilhado/autenticacao.ts';
import type { Contexto } from '../../compartilhado/contexto.ts';
import { diaSeguinte, formatarEmSaoPaulo, instanteEmSaoPaulo, type Intervalo } from '../../compartilhado/datas.ts';
import { naoEncontrado } from '../../compartilhado/erros.ts';
import type { Procedimento } from '../../generated/prisma/client.ts';
import { faixasDoDia, lerGrade, type Faixa } from './grade.service.ts';
import { horariosLivresNoPasso, janelasLivres } from './horarios.ts';

// 'passo' = o que o paciente vê; 'encaixe' = o que a clínica vê (horários no passo + janelas livres, D12.3 e D22).
export type Modo = 'passo' | 'encaixe';

const modoDe = (usuario: UsuarioAutenticado): Modo => (usuario.tipo === 'CLIENTE' ? 'passo' : 'encaixe');

// D25.9: procedimento inexistente ou inativo responde 404 para todos os papéis.
async function procedimentoAtivo(contexto: Contexto, id: string): Promise<Procedimento> {
  const procedimento = await contexto.prisma.procedimento.findFirst({ where: { id, ativo: true } });
  if (!procedimento) throw naoEncontrado();
  return procedimento;
}

// D10: dentista só enxerga a própria agenda, mesmo pedindo outro id. Sem dentistaId = todos os ativos.
async function dentistasConsultados(contexto: Contexto, usuario: UsuarioAutenticado, dentistaId?: string): Promise<string[]> {
  if (usuario.tipo === 'FUNCIONARIO' && usuario.categoria === 'DENTISTA') return [usuario.funcionarioId];
  if (dentistaId) {
    const dentista = await contexto.prisma.funcionario.findFirst({
      where: { id: dentistaId, categoria: 'DENTISTA', ativo: true },
      select: { id: true },
    });
    if (!dentista) throw naoEncontrado();
    return [dentista.id];
  }
  const dentistas = await contexto.prisma.funcionario.findMany({
    where: { categoria: 'DENTISTA', ativo: true },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  return dentistas.map((dentista) => dentista.id);
}

// Ocupado = bloqueios + consultas não canceladas (CONFIRMADA e REALIZADA, D12 e D18) que tocam o período.
async function carregarOcupados(contexto: Contexto, dentistaIds: string[], periodo: Intervalo): Promise<Map<string, Intervalo[]>> {
  const toca = { inicio: { lt: periodo.fim }, fim: { gt: periodo.inicio } };
  const [bloqueios, consultas] = await Promise.all([
    contexto.prisma.bloqueio.findMany({ where: { dentistaId: { in: dentistaIds }, ...toca } }),
    contexto.prisma.consulta.findMany({ where: { dentistaId: { in: dentistaIds }, status: { not: 'CANCELADA' }, ...toca } }),
  ]);
  const porDentista = new Map<string, Intervalo[]>(dentistaIds.map((id) => [id, []]));
  for (const ocupado of [...bloqueios, ...consultas]) {
    porDentista.get(ocupado.dentistaId)?.push({ inicio: ocupado.inicio, fim: ocupado.fim });
  }
  return porDentista;
}

function calcularNoDia(grade: Faixa[], ocupados: Intervalo[], duracaoMinutos: number, data: string, agora: Date, modo: Modo) {
  const entrada = { faixas: faixasDoDia(grade, data), ocupados, duracaoMinutos, agora };
  return {
    horarios: horariosLivresNoPasso(entrada),
    janelas: modo === 'encaixe' ? janelasLivres(entrada) : [],
  };
}

const periodoDoDia = (data: string): Intervalo => ({
  inicio: instanteEmSaoPaulo(data, '00:00'),
  fim: instanteEmSaoPaulo(diaSeguinte(data), '00:00'),
});

// Um dentista, um dia. Reaproveitado pela criação de consulta (Tarefa 18) para conferir passo e janela.
export async function calcularDia(
  contexto: Contexto,
  entrada: { dentistaId: string; procedimento: Procedimento; data: string },
  modo: Modo,
): Promise<{ horarios: Date[]; janelas: Intervalo[] }> {
  const [grade, ocupados] = await Promise.all([
    lerGrade(contexto, entrada.dentistaId),
    carregarOcupados(contexto, [entrada.dentistaId], periodoDoDia(entrada.data)),
  ]);
  return calcularNoDia(grade, ocupados.get(entrada.dentistaId) ?? [], entrada.procedimento.duracaoMinutos, entrada.data, contexto.relogio.agora(), modo);
}

const porInicio = <T extends { inicio: Date; dentistaId: string }>(a: T, b: T) =>
  a.inicio.getTime() - b.inicio.getTime() || a.dentistaId.localeCompare(b.dentistaId);

export async function horariosLivres(
  contexto: Contexto,
  usuario: UsuarioAutenticado,
  consulta: { procedimentoId: string; data: string; dentistaId?: string | undefined },
) {
  const procedimento = await procedimentoAtivo(contexto, consulta.procedimentoId);
  const modo = modoDe(usuario);
  const horarios: { dentistaId: string; inicio: Date }[] = [];
  const janelas: { dentistaId: string; inicio: Date; fim: Date }[] = [];
  for (const dentistaId of await dentistasConsultados(contexto, usuario, consulta.dentistaId)) {
    const dia = await calcularDia(contexto, { dentistaId, procedimento, data: consulta.data }, modo);
    horarios.push(...dia.horarios.map((inicio) => ({ dentistaId, inicio })));
    janelas.push(...dia.janelas.map((janela) => ({ dentistaId, ...janela })));
  }
  const saida = {
    horarios: horarios.sort(porInicio).map((h) => ({ dentistaId: h.dentistaId, inicio: formatarEmSaoPaulo(h.inicio) })),
  };
  if (modo === 'passo') return saida;
  return {
    ...saida,
    janelasLivres: janelas
      .sort(porInicio)
      .map((j) => ({ dentistaId: j.dentistaId, inicio: formatarEmSaoPaulo(j.inicio), fim: formatarEmSaoPaulo(j.fim) })),
  };
}

// D22.2: dias do mês com pelo menos um horário livre (C: no passo; R/D: também janela de encaixe, D25.8).
export async function diasDisponiveis(
  contexto: Contexto,
  usuario: UsuarioAutenticado,
  consulta: { procedimentoId: string; mes: string; dentistaId?: string | undefined },
) {
  const procedimento = await procedimentoAtivo(contexto, consulta.procedimentoId);
  const modo = modoDe(usuario);
  const dentistaIds = await dentistasConsultados(contexto, usuario, consulta.dentistaId);
  const [ano, numeroDoMes] = consulta.mes.split('-').map(Number) as [number, number];
  const diasDoMes = new Date(Date.UTC(ano, numeroDoMes, 0)).getUTCDate();
  const datas = Array.from({ length: diasDoMes }, (_, i) => `${consulta.mes}-${String(i + 1).padStart(2, '0')}`);
  const ocupados = await carregarOcupados(contexto, dentistaIds, {
    inicio: instanteEmSaoPaulo(datas[0] as string, '00:00'),
    fim: instanteEmSaoPaulo(diaSeguinte(datas[diasDoMes - 1] as string), '00:00'),
  });
  const grades = new Map(await Promise.all(dentistaIds.map(async (id) => [id, await lerGrade(contexto, id)] as const)));
  const agora = contexto.relogio.agora();

  const dias = datas.filter((data) =>
    dentistaIds.some((id) => {
      const dia = calcularNoDia(grades.get(id) ?? [], ocupados.get(id) ?? [], procedimento.duracaoMinutos, data, agora, modo);
      return dia.horarios.length > 0 || dia.janelas.length > 0;
    }),
  );
  return { dias };
}
