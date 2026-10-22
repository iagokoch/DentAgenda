import type { Contexto } from '../../compartilhado/contexto.ts';
import { ErroDeNegocio, naoEncontrado } from '../../compartilhado/erros.ts';
import { violacaoDoBanco } from '../../compartilhado/erros-do-banco.ts';
import { gerarHashDeSenha, gerarSenhaAleatoria } from '../../compartilhado/senhas.ts';
import type { Funcionario } from '../../generated/prisma/client.ts';
import { revogarTodasAsSessoes } from '../auth/sessoes.ts';
import type { EdicaoDeFuncionario, NovoFuncionario } from './funcionarios.schemas.ts';

// Nunca devolve senhaHash.
const CAMPOS_DA_RESPOSTA = {
  id: true,
  nome: true,
  cpf: true,
  email: true,
  categoria: true,
  cro: true,
  dataInicio: true,
  isAdmin: true,
  ativo: true,
} as const;

type FuncionarioDaResposta = Pick<Funcionario, keyof typeof CAMPOS_DA_RESPOSTA>;

// dataInicio é DATE no banco; a resposta é AAAA-MM-DD (api.md).
const paraResposta = (funcionario: FuncionarioDaResposta) => ({
  ...funcionario,
  dataInicio: funcionario.dataInicio.toISOString().slice(0, 10),
});

const dataDoBanco = (data: string) => new Date(`${data}T00:00:00Z`);

const croObrigatorio = () => new ErroDeNegocio(422, 'CRO_OBRIGATORIO', 'Dentista precisa ter o CRO informado.');

const ultimoAdmin = () =>
  new ErroDeNegocio(422, 'ULTIMO_ADMIN', 'Precisa existir pelo menos um administrador ativo.');

const REPETIDOS = {
  email: new ErroDeNegocio(409, 'EMAIL_JA_CADASTRADO', 'Já existe um funcionário com esse e-mail.'),
  cpf: new ErroDeNegocio(409, 'CPF_JA_CADASTRADO', 'Já existe um funcionário com esse CPF.'),
  cro: new ErroDeNegocio(409, 'CRO_JA_CADASTRADO', 'Já existe um funcionário com esse CRO.'),
} as const;

export async function listarFuncionarios(contexto: Contexto) {
  const funcionarios = await contexto.prisma.funcionario.findMany({
    select: CAMPOS_DA_RESPOSTA,
    orderBy: { nome: 'asc' },
  });
  return funcionarios.map(paraResposta);
}

// D21.1: a conta nasce com uma senha que ninguém conhece; o funcionário define a dele por "Recuperar senha".
export async function criarFuncionario(contexto: Contexto, entrada: NovoFuncionario) {
  if (entrada.categoria === 'DENTISTA' && !entrada.cro) throw croObrigatorio();
  const senhaHash = await gerarHashDeSenha(gerarSenhaAleatoria());
  const funcionario = await recusandoRepetido(
    contexto.prisma.funcionario.create({
      data: { ...entrada, dataInicio: dataDoBanco(entrada.dataInicio), senhaHash },
      select: CAMPOS_DA_RESPOSTA,
    }),
  );
  return paraResposta(funcionario);
}

// D10: nunca deixa a clínica sem admin ativo. A transação trava as linhas dos admins ativos
// (FOR UPDATE), então dois admins não removem um ao outro ao mesmo tempo.
export async function editarFuncionario(contexto: Contexto, id: string, entrada: EdicaoDeFuncionario) {
  const funcionario = await recusandoRepetido(
    contexto.prisma.$transaction(async (tx) => {
      const admins = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Funcionario" WHERE "isAdmin" = true AND ativo = true FOR UPDATE`;
      const atual = await tx.funcionario.findUnique({ where: { id } });
      if (!atual) throw naoEncontrado();

      const categoria = entrada.categoria ?? atual.categoria;
      if (categoria === 'DENTISTA' && !(entrada.cro ?? atual.cro)) throw croObrigatorio();

      const eraAdminAtivo = atual.isAdmin && atual.ativo;
      const seraAdminAtivo = (entrada.isAdmin ?? atual.isAdmin) && (entrada.ativo ?? atual.ativo);
      if (eraAdminAtivo && !seraAdminAtivo && admins.length <= 1) throw ultimoAdmin();

      const { dataInicio, ...resto } = entrada;
      const editado = await tx.funcionario.update({
        where: { id },
        data: { ...resto, ...(dataInicio ? { dataInicio: dataDoBanco(dataInicio) } : {}) },
        select: CAMPOS_DA_RESPOSTA,
      });
      // D21.5: quem saiu da clínica não pode continuar com sessão aberta.
      if (atual.ativo && entrada.ativo === false) {
        await revogarTodasAsSessoes(tx, { funcionarioId: id }, contexto);
      }
      return editado;
    }),
  );
  return paraResposta(funcionario);
}

// Para o paciente escolher: só id e nome dos dentistas ativos.
export function listarDentistas(contexto: Contexto) {
  return contexto.prisma.funcionario.findMany({
    where: { categoria: 'DENTISTA', ativo: true },
    select: { id: true, nome: true },
    orderBy: { nome: 'asc' },
  });
}

async function recusandoRepetido<T>(escrita: Promise<T>): Promise<T> {
  try {
    return await escrita;
  } catch (erro) {
    const violacao = violacaoDoBanco(erro);
    if (violacao?.codigoSql === '23505') {
      for (const campo of ['email', 'cpf', 'cro'] as const) {
        if (violacao.campos.includes(campo)) throw REPETIDOS[campo];
      }
    }
    throw erro;
  }
}
