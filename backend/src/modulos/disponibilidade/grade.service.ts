import type { Contexto } from '../../compartilhado/contexto.ts';
import { dataEmSaoPaulo, diaDaSemana, formatarEmSaoPaulo, instanteEmSaoPaulo, type Intervalo } from '../../compartilhado/datas.ts';
import { ErroDeNegocio, naoEncontrado } from '../../compartilhado/erros.ts';

export type Faixa = { diaSemana: number; inicio: string; fim: string };

// TIME do Prisma chega como Date em 1970-01-01 UTC: a hora de parede é a hora UTC.
const horaDe = (tempo: Date) => tempo.toISOString().slice(11, 16);
const tempoDe = (hora: string) => new Date(`1970-01-01T${hora}:00Z`);

export async function lerGrade(contexto: Contexto, dentistaId: string): Promise<Faixa[]> {
  const faixas = await contexto.prisma.gradeHorario.findMany({
    where: { dentistaId },
    orderBy: [{ diaSemana: 'asc' }, { inicio: 'asc' }],
  });
  return faixas.map((faixa) => ({ diaSemana: faixa.diaSemana, inicio: horaDe(faixa.inicio), fim: horaDe(faixa.fim) }));
}

// Faixas da grade que valem na data (AAAA-MM-DD), como instantes no fuso de São Paulo.
export function faixasDoDia(grade: Faixa[], data: string): Intervalo[] {
  return grade
    .filter((faixa) => faixa.diaSemana === diaDaSemana(data))
    .map((faixa) => ({ inicio: instanteEmSaoPaulo(data, faixa.inicio), fim: instanteEmSaoPaulo(data, faixa.fim) }));
}

// D12: a consulta precisa caber inteira numa faixa do dia (de São Paulo) em que começa.
export function cabeNaGrade(grade: Faixa[], intervalo: Intervalo): boolean {
  return faixasDoDia(grade, dataEmSaoPaulo(intervalo.inicio)).some(
    (faixa) => faixa.inicio <= intervalo.inicio && intervalo.fim <= faixa.fim,
  );
}

// Grade de quem não é dentista não existe: 404, como recurso inexistente.
export async function exigirDentista(contexto: Contexto, id: string): Promise<void> {
  const dentista = await contexto.prisma.funcionario.findFirst({
    where: { id, categoria: 'DENTISTA' },
    select: { id: true },
  });
  if (!dentista) throw naoEncontrado();
}

function conferirFaixas(faixas: Faixa[]): void {
  if (faixas.some((faixa) => faixa.inicio >= faixa.fim)) {
    throw new ErroDeNegocio(422, 'FAIXA_INVALIDA', 'O início da faixa precisa ser anterior ao fim.');
  }
  const ordenadas = [...faixas].sort((a, b) => a.diaSemana - b.diaSemana || a.inicio.localeCompare(b.inicio));
  // Faixas encostadas (fim de uma = início da outra) são aceitas.
  const sobrepoe = ordenadas.some((faixa, i) => {
    const anterior = ordenadas[i - 1];
    return anterior !== undefined && anterior.diaSemana === faixa.diaSemana && faixa.inicio < anterior.fim;
  });
  if (sobrepoe) throw new ErroDeNegocio(422, 'FAIXAS_SOBREPOSTAS', 'Há faixas sobrepostas no mesmo dia.');
}

// D12.5: a grade nova vale mesmo com consultas futuras fora dela; nenhuma é cancelada,
// a resposta lista as que ficaram de fora para a recepção resolver.
export async function substituirGrade(contexto: Contexto, dentistaId: string, faixas: Faixa[]) {
  conferirFaixas(faixas);
  await contexto.prisma.$transaction(async (tx) => {
    await tx.gradeHorario.deleteMany({ where: { dentistaId } });
    await tx.gradeHorario.createMany({
      data: faixas.map((faixa) => ({
        dentistaId,
        diaSemana: faixa.diaSemana,
        inicio: tempoDe(faixa.inicio),
        fim: tempoDe(faixa.fim),
      })),
    });
  });

  const grade = await lerGrade(contexto, dentistaId);
  const futuras = await contexto.prisma.consulta.findMany({
    where: { dentistaId, status: 'CONFIRMADA', inicio: { gte: contexto.relogio.agora() } },
    include: { cliente: { select: { id: true, nome: true } } },
    orderBy: { inicio: 'asc' },
  });
  const consultasForaDaGrade = futuras
    .filter((consulta) => !cabeNaGrade(grade, consulta))
    .map((consulta) => ({
      id: consulta.id,
      inicio: formatarEmSaoPaulo(consulta.inicio),
      fim: formatarEmSaoPaulo(consulta.fim),
      paciente: consulta.cliente,
    }));
  return { grade, consultasForaDaGrade };
}
