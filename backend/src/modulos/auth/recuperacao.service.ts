import type { Transacao } from '../../compartilhado/banco.ts';
import type { Contexto } from '../../compartilhado/contexto.ts';
import { gerarHashDeSenha } from '../../compartilhado/senhas.ts';
import { codigoInvalido, consumirCodigo, emitirCodigo, VALIDADE_CODIGO_MINUTOS } from './codigos.ts';
import { revogarTodasAsSessoes, type ContaDaSessao } from './sessoes.ts';

// D19: a resposta não revela se a conta existe.
export const MENSAGEM_DE_CODIGO_ENVIADO = 'Se os dados estiverem corretos, enviamos um código.';

export const textoDoCodigo = (codigo: string) =>
  `DentAgenda: seu código é ${codigo}. Vale por ${VALIDADE_CODIGO_MINUTOS} minutos.`;

type ConfirmacaoDeRecuperacao = { codigo: string; novaSenha: string; ip: string };

// D25.4: CPF sem Login grava o código sem enviar nada.
export async function pedirRecuperacaoCliente(contexto: Contexto, cpf: string): Promise<void> {
  const cliente = await contexto.prisma.cliente.findUnique({ where: { cpf }, include: { login: true } });
  const destino = cliente?.login ? cliente.telefone : null;
  const codigo = await emitirCodigo(contexto.prisma, contexto, {
    identificador: cpf,
    tipo: 'CLIENTE',
    finalidade: 'RECUPERACAO',
    destino,
  });
  if (destino) await contexto.enviador.enviar(destino, textoDoCodigo(codigo));
}

// D25.4: e-mail inexistente ou funcionário inativo grava o código sem enviar nada.
export async function pedirRecuperacaoFuncionario(contexto: Contexto, email: string): Promise<void> {
  const funcionario = await contexto.prisma.funcionario.findUnique({ where: { email } });
  const destino = funcionario?.ativo ? funcionario.email : null;
  const codigo = await emitirCodigo(contexto.prisma, contexto, {
    identificador: email,
    tipo: 'FUNCIONARIO',
    finalidade: 'RECUPERACAO',
    destino,
  });
  if (destino) await contexto.enviador.enviar(destino, textoDoCodigo(codigo));
}

export async function confirmarRecuperacaoCliente(
  contexto: Contexto,
  entrada: ConfirmacaoDeRecuperacao & { cpf: string },
): Promise<void> {
  await consumirCodigo(contexto, {
    identificador: entrada.cpf,
    tipo: 'CLIENTE',
    finalidades: ['RECUPERACAO'],
    codigo: entrada.codigo,
  });
  const login = await contexto.prisma.login.findFirst({ where: { cliente: { cpf: entrada.cpf } } });
  if (!login) throw codigoInvalido();
  const senhaHash = await gerarHashDeSenha(entrada.novaSenha);
  await contexto.prisma.$transaction(async (tx) => {
    await tx.login.update({ where: { id: login.id }, data: { senhaHash } });
    await registrarRedefinicao(contexto, tx, entrada.cpf, 'CLIENTE', entrada.ip, { loginId: login.id });
  });
}

export async function confirmarRecuperacaoFuncionario(
  contexto: Contexto,
  entrada: ConfirmacaoDeRecuperacao & { email: string },
): Promise<void> {
  await consumirCodigo(contexto, {
    identificador: entrada.email,
    tipo: 'FUNCIONARIO',
    finalidades: ['RECUPERACAO'],
    codigo: entrada.codigo,
  });
  const funcionario = await contexto.prisma.funcionario.findUnique({ where: { email: entrada.email } });
  if (!funcionario?.ativo) throw codigoInvalido();
  const senhaHash = await gerarHashDeSenha(entrada.novaSenha);
  await contexto.prisma.$transaction(async (tx) => {
    await tx.funcionario.update({ where: { id: funcionario.id }, data: { senhaHash } });
    await registrarRedefinicao(contexto, tx, entrada.email, 'FUNCIONARIO', entrada.ip, {
      funcionarioId: funcionario.id,
    });
  });
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
