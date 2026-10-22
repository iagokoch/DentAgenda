import * as z from 'zod';
import { esquemaPaginacao } from '../../compartilhado/paginacao.ts';
import { esquemaCpf, esquemaEmail, esquemaTelefone } from '../../compartilhado/validacao.ts';

const texto = z.string().trim().min(1);

// D18: todos os campos obrigatórios, exceto complemento. Reaproveitado pelo PUT de endereço (Tarefa 13).
export const esquemaEndereco = z.object({
  cep: z.string().regex(/^\d{8}$/, { error: 'CEP só com 8 dígitos.' }),
  logradouro: texto,
  numero: texto,
  complemento: z.string().trim().min(1).nullish(),
  bairro: texto,
  cidade: texto,
  uf: z
    .string()
    .regex(/^[A-Za-z]{2}$/, { error: 'UF com 2 letras.' })
    .transform((uf) => uf.toUpperCase()),
});

// api.md: convenio ausente = particular; pacienteDesde ausente = hoje (D4).
export const esquemaNovoPaciente = z.object({
  nome: texto,
  cpf: esquemaCpf,
  telefone: esquemaTelefone,
  email: esquemaEmail.optional(),
  nascimento: z.iso.date().optional(),
  convenio: texto.optional(),
  pacienteDesde: z.iso.date().optional(),
  endereco: esquemaEndereco.optional(),
});

// null limpa o campo (ex.: convenio volta a ser "particular").
const camposDoCliente = {
  email: esquemaEmail.nullable(),
  convenio: texto.nullable(),
  nascimento: z.iso.date().nullable(),
};

// D21.2: o paciente edita só estes; nome e telefone são da recepção.
export const CAMPOS_EDITAVEIS_PELO_CLIENTE = Object.keys(camposDoCliente);

export const esquemaEdicaoPeloCliente = z.object(camposDoCliente).partial();

export const esquemaEdicaoPelaRecepcao = z
  .object({ ...camposDoCliente, nome: texto, telefone: esquemaTelefone, pacienteDesde: z.iso.date() })
  .partial();

export const esquemaBuscaDePacientes = esquemaPaginacao.extend({ busca: z.string().trim().default('') });

export type NovoPaciente = z.infer<typeof esquemaNovoPaciente>;
export type EdicaoDePaciente = z.infer<typeof esquemaEdicaoPelaRecepcao>;
export type Endereco = z.infer<typeof esquemaEndereco>;
