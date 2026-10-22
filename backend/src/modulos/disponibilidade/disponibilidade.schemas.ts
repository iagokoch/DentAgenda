import * as z from 'zod';

const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: 'Hora no formato HH:mm.' });

// D12 e api.md: diaSemana 0 = domingo … 6 = sábado; horários no fuso da clínica.
export const esquemaFaixa = z.object({
  diaSemana: z.int().min(0).max(6),
  inicio: hora,
  fim: hora,
});

export const esquemaGrade = z.array(esquemaFaixa);
