/**
 * @fileoverview Utilitários de sanitização, formatação e validação algorítmica de CPF (Cadastro de Pessoas Físicas).
 * Implementa validação estrita dos dois dígitos verificadores via módulo 11.
 */

/**
 * Remove caracteres de pontuação e formatação, mantendo estritamente dígitos numéricos.
 *
 * @param valor - Cadeia de caracteres contendo o CPF formatado ou desformatado.
 * @returns Apenas os dígitos numéricos presentes na entrada.
 *
 * @example
 * sanitizarCpf("123.456.789-00"); // "12345678900"
 */
export function sanitizarCpf(valor: string): string {
  return valor.replace(/\D/g, "");
}

/**
 * Valida se uma cadeia de caracteres representa um número de CPF válido segundo as regras da Receita Federal.
 *
 * O algoritmo executa:
 * 1. Sanitização para extração exclusiva de dígitos.
 * 2. Checagem de comprimento fixo (11 dígitos).
 * 3. Rejeição de padrões com todos os números repetidos (ex.: "111.111.111-11").
 * 4. Cálculo e validação do primeiro e segundo dígitos verificadores.
 *
 * @param valor - Sequência de caracteres do CPF a ser avaliado.
 * @returns `true` se o CPF for matematicamente válido; caso contrário, `false`.
 */
export function cpfValido(valor: string): boolean {
  const digitos = sanitizarCpf(valor);

  if (digitos.length !== 11) {
    return false;
  }

  // CPFs com todos os números iguais passam no cálculo mod11, mas são inválidos na Receita Federal
  if (/^(\d)\1{10}$/.test(digitos)) {
    return false;
  }

  const calcularDigito = (limite: number): number => {
    let soma = 0;
    for (let i = 0; i < limite - 1; i++) {
      soma += Number(digitos[i]) * (limite - i);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  const d1 = calcularDigito(10);
  const d2 = calcularDigito(11);

  return d1 === Number(digitos[9]) && d2 === Number(digitos[10]);
}

/**
 * Alias de compatibilidade caso alguma parte do código chame por validarCpf.
 */
export const validarCpf = cpfValido;

/**
 * Aplica a máscara padrão de CPF (`000.000.000-00`) sobre uma string contendo dígitos.
 *
 * @param valor - CPF com ou sem máscara prévia.
 * @returns CPF formatado com pontos e hífen ou a string original se não tiver 11 dígitos.
 */
export function formatarCpf(valor: string): string {
  const digitos = sanitizarCpf(valor);
  if (digitos.length !== 11) {
    return valor;
  }
  return digitos.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}
