import type { Router } from 'express';
import type { Contexto } from './compartilhado/contexto.ts';
import type { ModuloDocumentado } from './compartilhado/openapi.ts';
import { criarRotasAuth, rotasDocumentadasAuth } from './modulos/auth/auth.rotas.ts';
import { criarRotasConsultas, rotasDocumentadasConsultas } from './modulos/consultas/consultas.rotas.ts';
import {
  criarRotasBloqueios,
  criarRotasDisponibilidade,
  criarRotasHorarios,
  rotasDocumentadasBloqueios,
  rotasDocumentadasDisponibilidade,
  rotasDocumentadasHorarios,
} from './modulos/disponibilidade/disponibilidade.rotas.ts';
import {
  criarRotasDentistas,
  criarRotasFuncionarios,
  rotasDocumentadasDentistas,
  rotasDocumentadasFuncionarios,
} from './modulos/funcionarios/funcionarios.rotas.ts';
import { criarRotasPacientes, rotasDocumentadasPacientes } from './modulos/pacientes/pacientes.rotas.ts';
import { criarRotasProcedimentos, rotasDocumentadasProcedimentos } from './modulos/procedimentos/procedimentos.rotas.ts';

type ModuloComRotas = { documentado: ModuloDocumentado; criarRotas: (contexto: Contexto) => Router };

// Cada router ao lado do que o Swagger mostra dele; openapi.test.ts exige que os dois batam.
export const MODULOS_DOCUMENTADOS: ModuloComRotas[] = [
  { documentado: rotasDocumentadasAuth, criarRotas: criarRotasAuth },
  { documentado: rotasDocumentadasFuncionarios, criarRotas: criarRotasFuncionarios },
  { documentado: rotasDocumentadasDentistas, criarRotas: criarRotasDentistas },
  { documentado: rotasDocumentadasDisponibilidade, criarRotas: criarRotasDisponibilidade },
  { documentado: rotasDocumentadasBloqueios, criarRotas: criarRotasBloqueios },
  { documentado: rotasDocumentadasHorarios, criarRotas: criarRotasHorarios },
  { documentado: rotasDocumentadasConsultas, criarRotas: criarRotasConsultas },
  { documentado: rotasDocumentadasPacientes, criarRotas: criarRotasPacientes },
  { documentado: rotasDocumentadasProcedimentos, criarRotas: criarRotasProcedimentos },
];
