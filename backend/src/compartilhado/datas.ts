export const FUSO_DA_CLINICA = 'America/Sao_Paulo';

export type Intervalo = { inicio: Date; fim: Date };

const MINUTO = 60_000;

const formatoDeslocamento = new Intl.DateTimeFormat('en-US', {
  timeZone: FUSO_DA_CLINICA,
  timeZoneName: 'longOffset',
});

export function deslocamentoEmMinutos(instante: Date): number {
  const nome =
    formatoDeslocamento.formatToParts(instante).find((parte) => parte.type === 'timeZoneName')?.value ?? 'GMT';
  const partes = /GMT([+-])(\d{2}):(\d{2})/.exec(nome);
  if (!partes) return 0;
  const sinal = partes[1] === '-' ? -1 : 1;
  return sinal * (Number(partes[2]) * 60 + Number(partes[3]));
}

export function instanteEmSaoPaulo(data: string, hora: string): Date {
  const comoSeFosseUtc = new Date(`${data}T${hora}:00Z`);
  return new Date(comoSeFosseUtc.getTime() - deslocamentoEmMinutos(comoSeFosseUtc) * MINUTO);
}

// Hora de parede em São Paulo como ISO sem fuso ('2026-10-05T08:00:00').
function relogioLocal(instante: Date): { iso: string; deslocamento: number } {
  const deslocamento = deslocamentoEmMinutos(instante);
  const iso = new Date(instante.getTime() + deslocamento * MINUTO).toISOString().slice(0, 19);
  return { iso, deslocamento };
}

export function formatarEmSaoPaulo(instante: Date): string {
  const { iso, deslocamento } = relogioLocal(instante);
  const sinal = deslocamento < 0 ? '-' : '+';
  const absoluto = Math.abs(deslocamento);
  const horas = String(Math.floor(absoluto / 60)).padStart(2, '0');
  const minutos = String(absoluto % 60).padStart(2, '0');
  return `${iso}${sinal}${horas}:${minutos}`;
}

export function dataEmSaoPaulo(instante: Date): string {
  return relogioLocal(instante).iso.slice(0, 10);
}

export function minutosDoDiaEmSaoPaulo(instante: Date): number {
  const iso = relogioLocal(instante).iso;
  return Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));
}

export function diaDaSemana(data: string): number {
  return new Date(`${data}T00:00:00Z`).getUTCDay();
}
