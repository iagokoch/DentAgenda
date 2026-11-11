import type { Transacao } from '../../compartilhado/banco.ts';
import type { Contexto } from '../../compartilhado/contexto.ts';
import { gerarHashDeSenha } from '../../compartilhado/senhas.ts';
import { codigoInvalido, consumirCodigoNaTransacao, emitirCodigoNaTransacao, VALIDADE_CODIGO_MINUTOS } from './codigos.ts';
import { revogarTodasAsSessoes, type ContaDaSessao } from './sessoes.ts';
import { travarCodigos, travarConta, travarIdentificador } from './travas-de-autenticacao.ts';

// D19: a resposta não revela se a conta existe.
export const MENSAGEM_DE_CODIGO_ENVIADO = 'Se os dados estiverem corretos, enviamos um código.';

export const textoDoCodigo = (codigo: string) =>
  `DentAgenda: seu código é ${codigo}. Vale por ${VALIDADE_CODIGO_MINUTOS} minutos.`;

type ConfirmacaoDeRecuperacao = { codigo: string; novaSenha: string; ip: string };

// D25.4: CPF sem Login grava o código sem enviar nada.
export async function pedirRecuperacaoCliente(contexto: Contexto, cpf: string): Promise<void> {
  const { codigo, destino } = await contexto.prisma.$transaction(async (tx) => {
    await travarCodigos(tx, 'CLIENTE', [cpf]);
    const cliente = await tx.cliente.findUnique({ where: { cpf }, select: { telefone: true, login: { select: { id: true } } } });
    const destino = cliente?.login ? cliente.telefone : null;
    const codigo = await emitirCodigoNaTransacao(tx, contexto, {
      identificador: cpf, tipo: 'CLIENTE', finalidade: 'RECUPERACAO', destino,
    });
    return { codigo, destino };
  });
  if (destino) await contexto.enviador.enviar(destino, textoDoCodigo(codigo));
}

// D25.4: e-mail inexistente ou funcionário inativo grava o código sem enviar nada.
export async function pedirRecuperacaoFuncionario(contexto: Contexto, email: string): Promise<void> {
  const { codigo, destino } = await contexto.prisma.$transaction(async (tx) => {
    await travarCodigos(tx, 'FUNCIONARIO', [email]);
    const funcionario = await tx.funcionario.findUnique({ where: { email }, select: { email: true, ativo: true } });
    const destino = funcionario?.ativo ? funcionario.email : null;
    const codigo = await emitirCodigoNaTransacao(tx, contexto, {
      identificador: email, tipo: 'FUNCIONARIO', finalidade: 'RECUPERACAO', destino,
    });
    return { codigo, destino };
  });
  if (destino) await contexto.enviador.enviar(destino, textoDoCodigo(codigo));
}

export async function confirmarRecuperacaoCliente(
  contexto: Contexto,
  entrada: ConfirmacaoDeRecuperacao & { cpf: string },
): Promise<void> {
  const senhaHash = await gerarHashDeSenha(entrada.novaSenha);
  const redefinida = await contexto.prisma.$transaction(async (tx) => {
    await travarCodigos(tx, 'CLIENTE', [entrada.cpf]);
    await travarIdentificador(tx, 'CLIENTE', entrada.cpf);
    const cliente = await tx.cliente.findUnique({ where: { cpf: entrada.cpf }, select: { telefone: true, login: { select: { id: true } } } });
    const login = cliente?.login;
    if (!login) return false;
    await travarConta(tx, { loginId: login.id });
    const consumido = await consumirCodigoNaTransacao(tx, contexto, {
      identificador: entrada.cpf, tipo: 'CLIENTE', finalidades: ['RECUPERACAO'],
      codigo: entrada.codigo, destino: cliente.telefone,
    });
    if (!consumido) return false;
    await tx.login.update({ where: { id: login.id }, data: { senhaHash } });
    await registrarRedefinicao(contexto, tx, entrada.cpf, 'CLIENTE', entrada.ip, { loginId: login.id });
    return true;
  });
  if (!redefinida) throw codigoInvalido();
}

export async function confirmarRecuperacaoFuncionario(
  contexto: Contexto,
  entrada: ConfirmacaoDeRecuperacao & { email: string },
): Promise<void> {
  const senhaHash = await gerarHashDeSenha(entrada.novaSenha);
  const redefinida = await contexto.prisma.$transaction(async (tx) => {
    await travarCodigos(tx, 'FUNCIONARIO', [entrada.email]);
    await travarIdentificador(tx, 'FUNCIONARIO', entrada.email);
    const funcionario = await tx.funcionario.findUnique({ where: { email: entrada.email }, select: { id: true, email: true, ativo: true } });
    if (!funcionario?.ativo) return false;
    await travarConta(tx, { funcionarioId: funcionario.id });
    const consumido = await consumirCodigoNaTransacao(tx, contexto, {
      identificador: entrada.email, tipo: 'FUNCIONARIO', finalidades: ['RECUPERACAO'],
      codigo: entrada.codigo, destino: funcionario.email,
    });
    if (!consumido) return false;
    await tx.funcionario.update({ where: { id: funcionario.id }, data: { senhaHash } });
    await registrarRedefinicao(contexto, tx, entrada.email, 'FUNCIONARIO', entrada.ip, {
      funcionarioId: funcionario.id,
    });
    return true;
  });
  if (!redefinida) throw codigoInvalido();
}

// D19: REDEFINICAO zera a contagem de falhas (desbloqueia) e a troca de senha derruba todas as sessões.
async function registrarRedefinicao(
  contexto: Contexto,
  tx: Transacao,
  identificador: string,
  tipo: 'CLIENTE' | 'FUNCIONARIO',
  ip: string,
  conta: ContaDaSessao,
): Promise<void> {
  await tx.tentativaLogin.create({
    data: { identificador, tipo, ip, ocorridoEm: contexto.relogio.agora(), resultado: 'REDEFINICAO' },
  });
  await revogarTodasAsSessoes(tx, conta, contexto);
}
