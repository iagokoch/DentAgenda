import type { Logger } from 'pino';

export interface EnviadorMensagem {
  enviar(destino: string, texto: string): Promise<void>;
}

// D16: SMS e e-mail simulados no log. carregarConfig recusa este enviador em produção,
// porque o texto (com o código) vai para o log sem ser ocultado.
export class EnviadorLog implements EnviadorMensagem {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async enviar(destino: string, texto: string): Promise<void> {
    this.logger.info({ mensagemSimulada: { destino, texto } }, 'mensagem simulada (D16)');
  }
}
