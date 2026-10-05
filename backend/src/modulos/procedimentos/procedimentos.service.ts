import type { UsuarioAutenticado } from '../../compartilhado/autenticacao.ts';
import type { Contexto } from '../../compartilhado/contexto.ts';
import { ErroDeNegocio, naoEncontrado } from '../../compartilhado/erros.ts';
import { violacaoDoBanco } from '../../compartilhado/erros-do-banco.ts';
import type { EdicaoDeProcedimento, NovoProcedimento } from './procedimentos.schemas.ts';

const CAMPOS_DA_RESPOSTA = { id: true, nome: true, duracaoMinutos: true, precoCentavos: true, ativo: true } as const;

const nomeJaCadastrado = () =>
  new ErroDeNegocio(409, 'NOME_JA_CADASTRADO', 'Já existe um procedimento com esse nome.');

// api.md: o cliente não vê procedimento inativo.
export function listarProcedimentos(contexto: Contexto, usuario: UsuarioAutenticado) {
  return contexto.prisma.procedimento.findMany({
    where: usuario.tipo === 'CLIENTE' ? { ativo: true } : {},
    select: CAMPOS_DA_RESPOSTA,
    orderBy: { nome: 'asc' },
  });
}

export function criarProcedimento(contexto: Contexto, entrada: NovoProcedimento) {
  return recusandoNomeRepetido(contexto.prisma.procedimento.create({ data: entrada, select: CAMPOS_DA_RESPOSTA }));
}

// D13: a consulta guarda o próprio fim; mudar a duração aqui não mexe em consulta marcada.
export async function editarProcedimento(contexto: Contexto, id: string, entrada: EdicaoDeProcedimento) {
  const existe = await contexto.prisma.procedimento.findUnique({ where: { id }, select: { id: true } });
  if (!existe) throw naoEncontrado();
  return recusandoNomeRepetido(
    contexto.prisma.procedimento.update({ where: { id }, data: entrada, select: CAMPOS_DA_RESPOSTA }),
  );
}

async function recusandoNomeRepetido<T>(escrita: Promise<T>): Promise<T> {
  try {
    return await escrita;
  } catch (erro) {
    const violacao = violacaoDoBanco(erro);
    if (violacao?.codigoSql === '23505' && violacao.campos.includes('nome')) throw nomeJaCadastrado();
    throw erro;
  }
}
