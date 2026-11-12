import * as z from 'zod';
import { describe, expect, it, vi } from 'vitest';
import { esquemaPaginacao } from '../src/compartilhado/paginacao.ts';
import { esquemaLoginFuncionario } from '../src/modulos/auth/auth.schemas.ts';
import { esquemaNovaConsultaDoCliente, esquemaCancelamento } from '../src/modulos/consultas/consultas.schemas.ts';
import { esquemaGrade, esquemaNovoBloqueio } from '../src/modulos/disponibilidade/disponibilidade.schemas.ts';
import { esquemaNovoFuncionario } from '../src/modulos/funcionarios/funcionarios.schemas.ts';
import { esquemaEndereco, esquemaNovoPaciente } from '../src/modulos/pacientes/pacientes.schemas.ts';
import { esquemaNovoProcedimento, esquemaEdicaoDeProcedimento } from '../src/modulos/procedimentos/procedimentos.schemas.ts';

const id = '00000000-0000-4000-8000-000000000001';

describe('proteção e compatibilidade do Zod', () => {
  it('recusa array acima do máximo antes de executar validações dos elementos', () => {
    const validarElemento = vi.fn(() => true);
    const esquema = z.array(z.string().refine(validarElemento)).max(2);
    const resultado = esquema.safeParse(['a', 'b', 'c']);
    expect(resultado.success).toBe(false);
    expect(validarElemento).not.toHaveBeenCalled();
    if (!resultado.success) expect(resultado.error.issues).toMatchObject([{ code: 'too_big', path: [] }]);
  });

  it('mantém normalização do login e limite de senha em bytes UTF-8', () => {
    expect(esquemaLoginFuncionario.parse({ email: 'TESTE@EXAMPLE.INVALID', senha: 'é'.repeat(36) }).email).toBe('teste@example.invalid');
    expect(esquemaLoginFuncionario.safeParse({ email: 'teste@example.invalid', senha: 'é'.repeat(37) }).success).toBe(false);
  });

  it('mantém CPF, obrigatoriedade e descarte de privilégios extras no cadastro', () => {
    const dados = { nome: ' Paciente sintético ', cpf: '52998224725', telefone: '47999990000', isAdmin: true };
    expect(esquemaNovoPaciente.parse(dados)).toEqual({ nome: 'Paciente sintético', cpf: dados.cpf, telefone: dados.telefone });
    expect(esquemaNovoPaciente.safeParse({ ...dados, cpf: '11111111111' }).success).toBe(false);
    expect(esquemaNovoPaciente.safeParse({ nome: dados.nome }).success).toBe(false);
  });

  it('preserva transformação de endereço e complemento nulo', () => {
    const dados = { cep: '89000000', logradouro: ' Rua ', numero: '1', complemento: null, bairro: 'Bairro', cidade: 'Cidade', uf: 'sc' };
    expect(esquemaEndereco.parse(dados)).toMatchObject({ logradouro: 'Rua', uf: 'SC', complemento: null });
  });

  it('mantém opcionais do funcionário sem transformar string em booleano', () => {
    const dados = { nome: 'Funcionário sintético', cpf: '52998224725', email: 'TESTE@EXAMPLE.INVALID', categoria: 'RECEPCIONISTA', dataInicio: '2026-11-12' };
    expect(esquemaNovoFuncionario.parse(dados)).toMatchObject({ email: 'teste@example.invalid' });
    expect(esquemaNovoFuncionario.safeParse({ ...dados, isAdmin: 'true' }).success).toBe(false);
  });

  it('mantém inteiros de procedimentos, edição parcial e ausência de coerção', () => {
    const dados = { nome: ' Limpeza ', duracaoMinutos: 30, precoCentavos: 0 };
    expect(esquemaNovoProcedimento.parse(dados)).toEqual({ ...dados, nome: 'Limpeza' });
    expect(esquemaEdicaoDeProcedimento.parse({ ativo: false })).toEqual({ ativo: false });
    expect(esquemaNovoProcedimento.safeParse({ ...dados, duracaoMinutos: '30' }).success).toBe(false);
    expect(esquemaNovoProcedimento.safeParse({ ...dados, precoCentavos: -1 }).success).toBe(false);
  });

  it('mantém agendamento com fuso, opcionais e descarte de pacienteId enviado pelo cliente', () => {
    const dados = { dentistaId: id, procedimentoId: id, inicio: '2026-11-12T09:00:00-03:00' };
    expect(esquemaNovaConsultaDoCliente.parse({ ...dados, pacienteId: id })).toEqual(dados);
    expect(esquemaNovaConsultaDoCliente.safeParse({ ...dados, inicio: '2026-11-12T09:00:00' }).success).toBe(false);
    expect(esquemaCancelamento.parse({})).toEqual({});
  });

  it('preserva refinamento de bloqueio e caminhos de erro', () => {
    const resultado = esquemaNovoBloqueio.safeParse({ dentistaIds: [id], inicio: '2026-11-12T12:00:00Z', fim: '2026-11-12T11:00:00Z' });
    expect(resultado.success).toBe(false);
    if (!resultado.success) expect(resultado.error.issues).toMatchObject([{ path: ['fim'], message: 'O início precisa ser anterior ao fim.' }]);
    expect(esquemaGrade.parse([])).toEqual([]);
    expect(esquemaGrade.safeParse([null, { diaSemana: '1' }]).success).toBe(false);
  });

  it('preserva defaults e coerção exclusivamente onde o schema os declara', () => {
    expect(esquemaPaginacao.parse({})).toEqual({ pagina: 1, porPagina: 20 });
    expect(esquemaPaginacao.parse({ pagina: '2', porPagina: '10' })).toEqual({ pagina: 2, porPagina: 10 });
    expect(esquemaPaginacao.safeParse({ porPagina: '101' }).success).toBe(false);
  });
});
