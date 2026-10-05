import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { Transacao } from '../../compartilhado/banco.ts';
import type { Contexto } from '../../compartilhado/contexto.ts';
import { ErroDeNegocio } from '../../compartilhado/erros.ts';
import type { FinalidadeCodigo, TipoConta } from '../../generated/prisma/client.ts';

export const LIMITE_POR_HORA = 3;
export const LIMITE_POR_DIA = 5;
export const VALIDADE_CODIGO_MINUTOS = 10;
export const MAXIMO_TENTATIVAS_CODIGO = 3;

const MINUTO = 60_000;

export const codigoInvalido = () =>
  new ErroDeNegocio(400, 'CODIGO_INVALIDO', 'Código inválido ou vencido. Peça um código novo.');
const limiteDeCodigos = () =>
  new ErroDeNegocio(429, 'LIMITE_DE_CODIGOS', 'Muitos pedidos de código. Tente de novo mais tarde.');

// HMAC com segredo do servidor: banco vazado não entrega códigos válidos (D19).
export function hashDoCodigo(codigo: string, contexto: Contexto): string {
  return createHmac('sha256', contexto.config.codigoHmacSegredo).update(codigo).digest('hex');
}

type PedidoDeCodigo = {
  identificador: string;
  tipo: TipoConta;
  finalidade: FinalidadeCodigo;
  // NULL = nada enviado: conta inexistente também grava linha, para o limite não revelar quem existe (D19).
  destino: string | null;
};

// Devolve o código em texto, só para quem vai enviá-lo.
export async function emitirCodigo(tx: Transacao, contexto: Contexto, pedido: PedidoDeCodigo): Promise<string> {
  const agora = contexto.relogio.agora();
  const { identificador, tipo, finalidade, destino } = pedido;
  // D25.3: janelas móveis, somando todas as finalidades do par (identificador, tipo).
  const pedidosDesde = (minutos: number) =>
    tx.codigoVerificacao.count({
      where: { identificador, tipo, criadoEm: { gt: new Date(agora.getTime() - minutos * MINUTO) } },
    });
  if ((await pedidosDesde(60)) >= LIMITE_POR_HORA || (await pedidosDesde(24 * 60)) >= LIMITE_POR_DIA) {
    throw limiteDeCodigos();
  }

  // Código novo invalida os anteriores ainda válidos da mesma finalidade (D19).
  await tx.codigoVerificacao.updateMany({
    where: { identificador, tipo, finalidade, usadoEm: null, expiraEm: { gt: agora } },
    data: { expiraEm: agora },
  });
  const codigo = String(randomInt(1_000_000)).padStart(6, '0');
  await tx.codigoVerificacao.create({
    data: {
      identificador,
      tipo,
      finalidade,
      destino,
      codigoHash: hashDoCodigo(codigo, contexto),
      criadoEm: agora,
      expiraEm: new Date(agora.getTime() + VALIDADE_CODIGO_MINUTOS * MINUTO),
    },
  });
  return codigo;
}

type ConsumoDeCodigo = {
  identificador: string;
  tipo: TipoConta;
  finalidades: FinalidadeCodigo[];
  codigo: string;
  destino?: string;
};

// Usa o banco fora de transação: a tentativa errada precisa ficar gravada mesmo com a resposta 400.
export async function consumirCodigo(
  contexto: Contexto,
  pedido: ConsumoDeCodigo,
): Promise<{ finalidade: FinalidadeCodigo }> {
  const agora = contexto.relogio.agora();
  const linha = await contexto.prisma.codigoVerificacao.findFirst({
    where: {
      identificador: pedido.identificador,
      tipo: pedido.tipo,
      finalidade: { in: pedido.finalidades },
      destino: { not: null },
      usadoEm: null,
      expiraEm: { gt: agora },
      tentativas: { lt: MAXIMO_TENTATIVAS_CODIGO },
    },
    orderBy: { criadoEm: 'desc' },
  });
  if (!linha) throw codigoInvalido();

  const destinoConfere = pedido.destino === undefined || pedido.destino === linha.destino;
  if (!destinoConfere || !hashesIguais(hashDoCodigo(pedido.codigo, contexto), linha.codigoHash)) {
    await contexto.prisma.codigoVerificacao.update({
      where: { id: linha.id },
      data: { tentativas: { increment: 1 } },
    });
    throw codigoInvalido();
  }

  // Condicional: dois pedidos simultâneos com o mesmo código não passam os dois.
  const usado = await contexto.prisma.codigoVerificacao.updateMany({
    where: { id: linha.id, usadoEm: null },
    data: { usadoEm: agora },
  });
  if (usado.count === 0) throw codigoInvalido();
  return { finalidade: linha.finalidade };
}

function hashesIguais(calculado: string, guardado: string): boolean {
  const a = Buffer.from(calculado, 'hex');
  const b = Buffer.from(guardado, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
