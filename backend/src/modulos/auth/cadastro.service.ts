import type { Transacao } from '../../compartilhado/banco.ts';
import type { Contexto } from '../../compartilhado/contexto.ts';
import { dataEmSaoPaulo } from '../../compartilhado/datas.ts';
import { violacaoDoBanco } from '../../compartilhado/erros-do-banco.ts';
import { gerarHashDeSenha } from '../../compartilhado/senhas.ts';
import { gerarAccessToken } from '../../compartilhado/tokens.ts';
import type { Cliente } from '../../generated/prisma/client.ts';
import { codigoInvalido, consumirCodigo, emitirCodigo } from './codigos.ts';
import type { ResultadoDoLogin } from './login.service.ts';
import { textoDoCodigo } from './recuperacao.service.ts';
import { criarSessao } from './sessoes.ts';
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
  const cliente = await contexto.prisma.cliente.findUnique({ where: { cpf: pedido.cpf }, include: { login: true } });
  const emitir = (finalidade: 'CADASTRO' | 'ATIVACAO', destino: string | null) =>
    emitirCodigo(contexto.prisma, contexto, { identificador: pedido.cpf, tipo: 'CLIENTE', finalidade, destino });

  if (!cliente) {
    const codigo = await emitir('CADASTRO', pedido.telefone);
    await contexto.enviador.enviar(pedido.telefone, textoDoCodigo(codigo));
    return;
  }
  if (!cliente.login) {
    // D15: o telefone que a clínica tem é o dado que quem só sabe o CPF não controla.
    const codigo = await emitir('ATIVACAO', cliente.telefone);
    await contexto.enviador.enviar(cliente.telefone, textoDoCodigo(codigo));
    return;
  }
  // D25.5: grava linha nunca aceita (conta no limite) e só orienta quem já tem conta.
  await emitir('CADASTRO', null);
  await contexto.enviador.enviar(cliente.telefone, TEXTO_DE_ORIENTACAO);
}

export async function confirmarCadastro(contexto: Contexto, entrada: ConfirmacaoDeCadastro): Promise<ResultadoDoLogin> {
  const cliente = await contexto.prisma.cliente.findUnique({ where: { cpf: entrada.cpf }, include: { login: true } });
  if (cliente?.login) throw codigoInvalido();
  const senhaHash = await gerarHashDeSenha(entrada.senha);

  // Paciente que a recepção cadastrou depois do pedido de CADASTRO não tem código ATIVACAO: cai aqui como inválido.
  if (cliente) {
    await consumirCodigo(contexto, { identificador: entrada.cpf, tipo: 'CLIENTE', finalidades: ['ATIVACAO'], codigo: entrada.codigo });
    return ativarCliente(contexto, cliente, senhaHash);
  }
  await consumirCodigo(contexto, {
    identificador: entrada.cpf,
    tipo: 'CLIENTE',
    finalidades: ['CADASTRO'],
    codigo: entrada.codigo,
    destino: entrada.telefone,
  });
  return criarClienteComLogin(contexto, entrada, senhaHash);
}

// D20.6: ativação só cria a senha; os dados conferidos pela clínica ficam como estão.
function ativarCliente(contexto: Contexto, cliente: Cliente, senhaHash: string): Promise<ResultadoDoLogin> {
  return recusandoCadastroConcorrente(
    contexto.prisma.$transaction((tx) => criarLoginESessao(tx, contexto, cliente, senhaHash)),
  );
}

function criarClienteComLogin(
  contexto: Contexto,
  entrada: ConfirmacaoDeCadastro,
  senhaHash: string,
): Promise<ResultadoDoLogin> {
  const agora = contexto.relogio.agora();
  return recusandoCadastroConcorrente(
    contexto.prisma.$transaction(async (tx) => {
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
    }),
  );
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
