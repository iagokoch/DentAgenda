import type { Transacao } from '../../compartilhado/banco.ts';
import type { Contexto } from '../../compartilhado/contexto.ts';
import { dataEmSaoPaulo } from '../../compartilhado/datas.ts';
import { violacaoDoBanco } from '../../compartilhado/erros-do-banco.ts';
import { gerarHashDeSenha } from '../../compartilhado/senhas.ts';
import { gerarAccessToken } from '../../compartilhado/tokens.ts';
import type { Cliente } from '../../generated/prisma/client.ts';
import { codigoInvalido, consumirCodigoNaTransacao, emitirCodigoNaTransacao } from './codigos.ts';
import type { ResultadoDoLogin } from './login.service.ts';
import { textoDoCodigo } from './recuperacao.service.ts';
import { criarSessao } from './sessoes.ts';
import { travarCodigos, travarIdentificador } from './travas-de-autenticacao.ts';
import { usuarioDoCliente } from './usuario-da-resposta.ts';

const TEXTO_DE_ORIENTACAO =
  'DentAgenda: este CPF já tem conta. Para entrar, use "Recuperar senha" na tela de login.';

type PedidoDeCadastro = { cpf: string; telefone: string };

type ConfirmacaoDeCadastro = PedidoDeCadastro & {
  codigo: string;
  senha: string;
  nome: string;
  email?: string | undefined;
  nascimento?: string | undefined;
};

// D19: os três casos respondem igual; só muda quem recebe o SMS e o que ele diz.
export async function pedirCodigoDeCadastro(contexto: Contexto, pedido: PedidoDeCadastro): Promise<void> {
  const mensagem = await contexto.prisma.$transaction(async (tx) => {
    await travarCodigos(tx, 'CLIENTE', [pedido.cpf]);
    const cliente = await tx.cliente.findUnique({ where: { cpf: pedido.cpf }, include: { login: true } });
    // D15: na ativação, só o telefone que a clínica tem pode receber o código.
    const destino = cliente?.login ? null : cliente?.telefone ?? pedido.telefone;
    const finalidade = cliente && !cliente.login ? 'ATIVACAO' : 'CADASTRO';
    const codigo = await emitirCodigoNaTransacao(tx, contexto, {
      identificador: pedido.cpf, tipo: 'CLIENTE', finalidade, destino,
    });
    return {
      destino: cliente?.telefone ?? pedido.telefone,
      texto: cliente?.login ? TEXTO_DE_ORIENTACAO : textoDoCodigo(codigo),
    };
  });
  await contexto.enviador.enviar(mensagem.destino, mensagem.texto);
}

export async function confirmarCadastro(contexto: Contexto, entrada: ConfirmacaoDeCadastro): Promise<ResultadoDoLogin> {
  // O hash vem antes da recusa: recusar sem pagar o bcrypt revelaria pelo tempo quais CPFs já têm conta (D19, D25.5).
  const senhaHash = await gerarHashDeSenha(entrada.senha);
  const resultado = await recusandoCadastroConcorrente(contexto.prisma.$transaction(async (tx) => {
    await travarCodigos(tx, 'CLIENTE', [entrada.cpf]);
    await travarIdentificador(tx, 'CLIENTE', entrada.cpf);
    const cliente = await tx.cliente.findUnique({ where: { cpf: entrada.cpf }, include: { login: true } });
    if (cliente?.login) return null;
    // D20.6: ativação usa o telefone atual e preserva os dados conferidos pela clínica.
    const consumido = await consumirCodigoNaTransacao(tx, contexto, {
      identificador: entrada.cpf, tipo: 'CLIENTE',
      finalidades: [cliente ? 'ATIVACAO' : 'CADASTRO'],
      codigo: entrada.codigo, destino: cliente?.telefone ?? entrada.telefone,
    });
    if (!consumido) return null;
    if (cliente) return criarLoginESessao(tx, contexto, cliente, senhaHash);
    return criarClienteComLogin(tx, contexto, entrada, senhaHash);
  }));
  if (!resultado) throw codigoInvalido();
  return resultado;
}

async function criarClienteComLogin(
  tx: Transacao,
  contexto: Contexto,
  entrada: ConfirmacaoDeCadastro,
  senhaHash: string,
): Promise<ResultadoDoLogin> {
  const agora = contexto.relogio.agora();
  const cliente = await tx.cliente.create({
    data: {
      nome: entrada.nome,
      cpf: entrada.cpf,
      telefone: entrada.telefone,
      email: entrada.email ?? null,
      nascimento: entrada.nascimento ? new Date(entrada.nascimento) : null,
      criadoEm: agora,
      // D4: paciente novo é paciente desde o dia do cadastro, no fuso da clínica.
      pacienteDesde: new Date(dataEmSaoPaulo(agora)),
    },
  });
  return criarLoginESessao(tx, contexto, cliente, senhaHash);
}

async function criarLoginESessao(
  tx: Transacao,
  contexto: Contexto,
  cliente: Cliente,
  senhaHash: string,
): Promise<ResultadoDoLogin> {
  const login = await tx.login.create({ data: { clienteId: cliente.id, senhaHash } });
  const sessao = await criarSessao(tx, { loginId: login.id }, contexto);
  const accessToken = gerarAccessToken({ tipo: 'CLIENTE', clienteId: cliente.id, sessaoId: sessao.sessaoId }, contexto);
  return { accessToken, refreshToken: sessao.refreshToken, expiraEm: sessao.expiraEm, usuario: usuarioDoCliente(cliente) };
}

// Recepção cadastrou o CPF, ou outra confirmação criou o Login, entre a leitura e a escrita:
// o UNIQUE do banco recusa e a resposta é a mesma de um código inválido (plano, Tarefa 9).
async function recusandoCadastroConcorrente<T>(escrita: Promise<T>): Promise<T> {
  try {
    return await escrita;
  } catch (erro) {
    if (violacaoDoBanco(erro)?.codigoSql === '23505') throw codigoInvalido();
    throw erro;
  }
}
