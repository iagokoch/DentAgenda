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
