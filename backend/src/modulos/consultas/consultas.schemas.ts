import * as z from 'zod';
import { esquemaPaginacao } from '../../compartilhado/paginacao.ts';
import { diaOuInstante } from '../disponibilidade/disponibilidade.schemas.ts';

// Instante com fuso ("2026-10-05T09:00:00-03:00"): sem fuso o horário seria ambíguo.
const instante = z.iso.datetime({ offset: true });

const camposDaConsulta = {
  dentistaId: z.uuid(),
  procedimentoId: z.uuid(),
  inicio: instante,
  observacao: z.string().trim().min(1).max(2000).optional(),
};

// A clínica (R/D) diz de qual paciente é a consulta; o cliente (C) marca para si e o pacienteId, se vier, é ignorado.
export const esquemaNovaConsultaDaClinica = z.object({ pacienteId: z.uuid(), ...camposDaConsulta });
export const esquemaNovaConsultaDoCliente = z.object(camposDaConsulta);

const justificativa = z.string().trim().min(1).max(500);

// texto null apaga a observação.
export const esquemaObservacao = z.object({ texto: z.string().trim().min(1).max(2000).nullable() });

export const esquemaCancelamento = z.object({ justificativa: justificativa.optional() });

// dentistaId e procedimentoId ausentes = os da consulta original.
export const esquemaRemarcacao = z.object({
  inicio: instante,
  dentistaId: z.uuid().optional(),
  procedimentoId: z.uuid().optional(),
  justificativa: justificativa.optional(),
});

export const esquemaFiltroDeConsultas = esquemaPaginacao.extend({
  de: diaOuInstante.optional(),
  ate: diaOuInstante.optional(),
  dentistaId: z.uuid().optional(),
  pacienteId: z.uuid().optional(),
  status: z.enum(['CONFIRMADA', 'REALIZADA', 'CANCELADA']).optional(),
});

export type FiltroDeConsultas = z.infer<typeof esquemaFiltroDeConsultas>;
