import type { UsuarioAutenticado } from '../../compartilhado/autenticacao.ts';
import type { Contexto } from '../../compartilhado/contexto.ts';
import { dataEmSaoPaulo, formatarEmSaoPaulo } from '../../compartilhado/datas.ts';
import { ErroDeNegocio, naoEncontrado, semPermissao } from '../../compartilhado/erros.ts';
import { violacaoDoBanco } from '../../compartilhado/erros-do-banco.ts';
import { paginar } from '../../compartilhado/paginacao.ts';
import { validar } from '../../compartilhado/validacao.ts';
import type { Cliente, EnderecoCliente } from '../../generated/prisma/client.ts';
import {
  CAMPOS_EDITAVEIS_PELO_CLIENTE,
  esquemaEdicaoPelaRecepcao,
  esquemaEdicaoPeloCliente,
  type NovoPaciente,
} from './pacientes.schemas.ts';

const dataDoBanco = (data: string) => new Date(`${data}T00:00:00Z`);
const apenasData = (data: Date) => data.toISOString().slice(0, 10);

type ClienteCompleto = Cliente & { endereco: EnderecoCliente | null; login: { id: string } | null };

// api.md: todos os campos de Cliente + endereco (ou null) + temLogin.
function paraResposta({ endereco, login, ...cliente }: ClienteCompleto) {
  return {
    ...cliente,
    nascimento: cliente.nascimento ? apenasData(cliente.nascimento) : null,
    pacienteDesde: apenasData(cliente.pacienteDesde),
    criadoEm: formatarEmSaoPaulo(cliente.criadoEm),
    endereco: endereco ? semClienteId(endereco) : null,
    temLogin: login !== null,
  };
}

function semClienteId({ clienteId: _clienteId, ...endereco }: EnderecoCliente) {
  return endereco;
}

const INCLUIR = { endereco: true, login: { select: { id: true } } } as const;

const cpfJaCadastrado = () => new ErroDeNegocio(409, 'CPF_JA_CADASTRADO', 'Já existe um paciente com esse CPF.');

// Nome sem acento/maiúscula, parcial; CPF exato. % e _ da busca valem como texto, não como curinga.
export async function buscarPacientes(contexto: Contexto, busca: string, pagina: number, porPagina: number) {
  const termo = busca.replace(/[\\%_]/g, '\\$&');
  const { skip, take } = paginar(pagina, porPagina);
  const [itens, contagem] = await Promise.all([
    contexto.prisma.$queryRaw<{ id: string; nome: string; cpf: string; telefone: string }[]>`
      SELECT id, nome, cpf, telefone FROM "Cliente"
      WHERE unaccent(lower(nome)) LIKE '%' || unaccent(lower(${termo}::text)) || '%' ESCAPE '\\'
         OR cpf = ${busca}::text
      ORDER BY nome, id
      LIMIT ${take} OFFSET ${skip}`,
    contexto.prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) AS total FROM "Cliente"
      WHERE unaccent(lower(nome)) LIKE '%' || unaccent(lower(${termo}::text)) || '%' ESCAPE '\\'
         OR cpf = ${busca}::text`,
  ]);
  return { itens, total: Number(contagem[0]?.total ?? 0) };
}

// D4: a recepção cadastra só o Cliente; o Login nasce se o paciente se cadastrar depois (D15).
export async function cadastrarPaciente(contexto: Contexto, entrada: NovoPaciente) {
  const agora = contexto.relogio.agora();
  const { endereco, nascimento, pacienteDesde, ...dados } = entrada;
  try {
    const cliente = await contexto.prisma.cliente.create({
      data: {
        ...dados,
        nascimento: nascimento ? dataDoBanco(nascimento) : null,
        criadoEm: agora,
        pacienteDesde: dataDoBanco(pacienteDesde ?? dataEmSaoPaulo(agora)),
        ...(endereco ? { endereco: { create: endereco } } : {}),
      },
      include: INCLUIR,
    });
    return paraResposta(cliente);
  } catch (erro) {
    if (violacaoDoBanco(erro)?.codigoSql === '23505') throw cpfJaCadastrado();
    throw erro;
  }
}

// D20.5: paciente que pede o cadastro de outro recebe 404, como se não existisse.
function conferirAcesso(usuario: UsuarioAutenticado, id: string): void {
  if (usuario.tipo === 'CLIENTE' && usuario.clienteId !== id) throw naoEncontrado();
}

export async function verPaciente(contexto: Contexto, usuario: UsuarioAutenticado, id: string) {
  conferirAcesso(usuario, id);
  const cliente = await contexto.prisma.cliente.findUnique({ where: { id }, include: INCLUIR });
  if (!cliente) throw naoEncontrado();
  return paraResposta(cliente);
}

// Ordem das recusas (D25.7): papel → dono do cadastro (404) → cpf (422) → campo do cliente (403) → formato (400).
export async function editarPaciente(contexto: Contexto, usuario: UsuarioAutenticado, id: string, corpo: unknown) {
  if (usuario.tipo === 'FUNCIONARIO' && usuario.categoria !== 'RECEPCIONISTA') throw semPermissao();
  conferirAcesso(usuario, id);
  const campos = typeof corpo === 'object' && corpo !== null ? corpo : {};
  if ('cpf' in campos) throw new ErroDeNegocio(422, 'CPF_IMUTAVEL', 'O CPF não pode ser alterado.');

  let mudancas;
  if (usuario.tipo === 'CLIENTE') {
    if (Object.keys(campos).some((campo) => !CAMPOS_EDITAVEIS_PELO_CLIENTE.includes(campo))) {
      throw new ErroDeNegocio(403, 'CAMPO_NAO_EDITAVEL', 'Esse campo só pode ser alterado pela clínica.');
    }
    mudancas = validar(esquemaEdicaoPeloCliente, campos);
  } else {
    mudancas = validar(esquemaEdicaoPelaRecepcao, campos);
  }

  const existe = await contexto.prisma.cliente.findUnique({ where: { id }, select: { id: true } });
  if (!existe) throw naoEncontrado();
  const { nascimento, pacienteDesde, ...resto } = mudancas as typeof mudancas & { pacienteDesde?: string };
  const cliente = await contexto.prisma.cliente.update({
    where: { id },
    data: {
      ...resto,
      ...(nascimento !== undefined ? { nascimento: nascimento === null ? null : dataDoBanco(nascimento) } : {}),
      ...(pacienteDesde ? { pacienteDesde: dataDoBanco(pacienteDesde) } : {}),
    },
    include: INCLUIR,
  });
  return paraResposta(cliente);
}
