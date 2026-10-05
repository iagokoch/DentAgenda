import { carregarConfig } from '../src/config/env.ts';
import { criarPrisma } from '../src/compartilhado/banco.ts';
import type { Contexto } from '../src/compartilhado/contexto.ts';
import { criarLogger } from '../src/compartilhado/logger.ts';
import type { EnviadorMensagem } from '../src/compartilhado/mensageria.ts';
import type { Relogio } from '../src/compartilhado/relogio.ts';

export class RelogioFixo implements Relogio {
  private instante: Date;

  constructor(instante: Date) {
    this.instante = instante;
  }

  agora(): Date {
    return new Date(this.instante);
  }

  avancarMinutos(minutos: number): void {
    this.instante = new Date(this.instante.getTime() + minutos * 60_000);
  }

  definir(instante: Date): void {
    this.instante = instante;
  }
}

export class EnviadorEmMemoria implements EnviadorMensagem {
  mensagens: { destino: string; texto: string }[] = [];

  async enviar(destino: string, texto: string): Promise<void> {
    this.mensagens.push({ destino, texto });
  }

  ultimoCodigoPara(destino: string): string {
    const ultima = this.mensagens.findLast((mensagem) => mensagem.destino === destino);
    const codigo = ultima && /\b\d{6}\b/.exec(ultima.texto)?.[0];
    if (!codigo) throw new Error(`nenhum código enviado para ${destino}`);
    return codigo;
  }
}

export type ContextoDeTeste = Contexto & { relogio: RelogioFixo; enviador: EnviadorEmMemoria };

// Segunda, 09:00 em São Paulo.
export const INSTANTE_INICIAL_DOS_TESTES = new Date('2026-10-05T12:00:00Z');

export function criarContextoDeTeste(): ContextoDeTeste {
  const config = { ...carregarConfig(process.env), nodeEnv: 'test' as const };
  return {
    prisma: criarPrisma(config.databaseUrl),
    relogio: new RelogioFixo(INSTANTE_INICIAL_DOS_TESTES),
    enviador: new EnviadorEmMemoria(),
    config,
    logger: criarLogger(undefined, 'silent'),
  };
}
