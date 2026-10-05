// Todo "agora" do sistema vem daqui, para os testes controlarem o tempo (D23).
export interface Relogio {
  agora(): Date;
}

export const relogioDoSistema: Relogio = { agora: () => new Date() };
