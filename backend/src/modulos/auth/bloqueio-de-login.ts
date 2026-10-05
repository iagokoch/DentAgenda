export type Tentativa = { ocorridoEm: Date; resultado: 'SUCESSO' | 'FALHA' | 'REDEFINICAO' };

export const MAXIMO_DE_FALHAS = 3;
export const BLOQUEIO_FUNCIONARIO_MINUTOS = 15;

// Acerto ou redefinição de senha zeram a contagem (D19). Usa a posição na lista, não o horário:
// duas tentativas no mesmo instante não podem fazer uma falha sumir da contagem.
function falhasDesdeUltimaLiberacao(tentativas: Tentativa[]): Tentativa[] {
  const ultimaLiberacao = tentativas.findLastIndex((tentativa) => tentativa.resultado !== 'FALHA');
  return tentativas.slice(ultimaLiberacao + 1);
}

// Tentativas em ordem crescente de ocorridoEm.
export function clienteEstaBloqueado(tentativas: Tentativa[]): boolean {
  return falhasDesdeUltimaLiberacao(tentativas).length >= MAXIMO_DE_FALHAS;
}

export function funcionarioBloqueadoAte(tentativas: Tentativa[], agora: Date): Date | null {
  let falhas = falhasDesdeUltimaLiberacao(tentativas);
  for (;;) {
    const falhaQueBloqueia = falhas[MAXIMO_DE_FALHAS - 1];
    if (!falhaQueBloqueia) return null;
    const fim = new Date(falhaQueBloqueia.ocorridoEm.getTime() + BLOQUEIO_FUNCIONARIO_MINUTOS * 60_000);
    if (agora < fim) return fim;
    // D25.2: falhas durante o bloqueio não contam depois dele.
    falhas = falhas.filter((falha) => falha.ocorridoEm >= fim);
  }
}
