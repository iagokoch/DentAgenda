import * as z from 'zod';

const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: 'Hora no formato HH:mm.' });

// D12 e api.md: diaSemana 0 = domingo … 6 = sábado; horários no fuso da clínica.
export const esquemaFaixa = z.object({
  diaSemana: z.int().min(0).max(6),
  inicio: hora,
  fim: hora,
});

export const esquemaGrade = z.array(esquemaFaixa);

// Instante com fuso ("2026-12-24T00:00:00-03:00"): sem fuso a data seria ambígua.
const instante = z.iso.datetime({ offset: true });

// D12, D18: um bloqueio por dentista, criados juntos (feriado em lote).
export const esquemaNovoBloqueio = z
  .object({ dentistaIds: z.array(z.uuid()).min(1), inicio: instante, fim: instante })
  .refine((bloqueio) => new Date(bloqueio.inicio) < new Date(bloqueio.fim), {
    error: 'O início precisa ser anterior ao fim.',
    path: ['fim'],
  });

// ?de=&ate=: dia (AAAA-MM-DD, no fuso da clínica, o dia todo) ou instante com fuso.
export const diaOuInstante = z.union([z.iso.date(), instante]);
export const esquemaPeriodo = z.object({ de: diaOuInstante.optional(), ate: diaOuInstante.optional() });

export type NovoBloqueio = z.infer<typeof esquemaNovoBloqueio>;

// Query de /api/horarios-livres e /api/dias-disponiveis (D22). Id malformado na query é erro de entrada (400);
// id que não existe é 404.
export const esquemaHorariosLivres = z.object({
  procedimentoId: z.uuid(),
  data: z.iso.date(),
  dentistaId: z.uuid().optional(),
});

export const esquemaDiasDisponiveis = z.object({
  procedimentoId: z.uuid(),
  mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, { error: 'Mês no formato AAAA-MM.' }),
  dentistaId: z.uuid().optional(),
});
