import type { Intervalo } from '../../compartilhado/datas.ts';

// Funções puras (sem banco, sem relógio): quem chama passa "agora" e os intervalos já em instantes (D12, D22).
type Entrada = {
  faixas: Intervalo[]; // faixas da grade do dia, como instantes
  ocupados: Intervalo[]; // consultas não canceladas e bloqueios
  duracaoMinutos: number;
  agora: Date;
};

const MINUTO = 60_000;
const CINCO_MINUTOS = 5 * MINUTO;

// Intervalos encostados (fim de um = início do outro) não se sobrepõem.
export function sobrepoe(a: Intervalo, b: Intervalo): boolean {
  return a.inicio < b.fim && b.inicio < a.fim;
}

function somarMinutos(instante: Date, minutos: number): Date {
  return new Date(instante.getTime() + minutos * MINUTO);
}

// D12: os inícios andam no passo da duração, contados a partir do início da faixa, e a consulta cabe inteira nela.
export function horariosNoPasso(faixa: Intervalo, duracaoMinutos: number): Date[] {
  if (duracaoMinutos <= 0) return [];
  const horarios: Date[] = [];
  for (
    let inicio = faixa.inicio;
    somarMinutos(inicio, duracaoMinutos) <= faixa.fim;
    inicio = somarMinutos(inicio, duracaoMinutos)
  ) {
    horarios.push(inicio);
  }
  return horarios;
}

// O que o paciente vê: horários no passo, ainda no futuro e sem tocar em nada ocupado.
export function horariosLivresNoPasso({ faixas, ocupados, duracaoMinutos, agora }: Entrada): Date[] {
  return faixas
    .flatMap((faixa) => horariosNoPasso(faixa, duracaoMinutos))
    .filter((inicio) => inicio >= agora)
    .filter((inicio) => {
      const candidato = { inicio, fim: somarMinutos(inicio, duracaoMinutos) };
      return !ocupados.some((ocupado) => sobrepoe(candidato, ocupado));
    });
}

function subtrair(faixa: Intervalo, ocupados: Intervalo[]): Intervalo[] {
  return ocupados.reduce<Intervalo[]>(
    (pedacos, ocupado) =>
      pedacos.flatMap((pedaco) => {
        if (!sobrepoe(pedaco, ocupado)) return [pedaco];
        const restos: Intervalo[] = [];
        if (pedaco.inicio < ocupado.inicio) restos.push({ inicio: pedaco.inicio, fim: ocupado.inicio });
        if (ocupado.fim < pedaco.fim) restos.push({ inicio: ocupado.fim, fim: pedaco.fim });
        return restos;
      }),
    [faixa],
  );
}

// O fuso de São Paulo tem deslocamento em horas inteiras, então múltiplo de 5 min em UTC
// é múltiplo de 5 min no horário local.
function arredondarPara5MinutosAcima(instante: Date): Date {
  return new Date(Math.ceil(instante.getTime() / CINCO_MINUTOS) * CINCO_MINUTOS);
}

// O que a clínica vê: trechos livres onde a consulta cabe, encaixando em qualquer múltiplo de 5 min (D12.3, D22).
export function janelasLivres({ faixas, ocupados, duracaoMinutos, agora }: Entrada): Intervalo[] {
  return faixas
    .flatMap((faixa) => subtrair(faixa, ocupados))
    .map((janela) => {
      const maisCedo = janela.inicio < agora ? agora : janela.inicio;
      return { inicio: arredondarPara5MinutosAcima(maisCedo), fim: janela.fim };
    })
    .filter((janela) => somarMinutos(janela.inicio, duracaoMinutos) <= janela.fim);
}

export function multiploDe5Minutos(instante: Date): boolean {
  return instante.getTime() % CINCO_MINUTOS === 0;
}
