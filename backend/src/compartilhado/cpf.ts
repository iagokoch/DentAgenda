/**
 * @fileoverview Utilitários para sanitização, formatação e validação de CPF.
 * Em conformidade com o algoritmo de módulo 11 da Receita Federal do Brasil.
 */

const TAMANHO_CPF = 11;

/**
 * Remove qualquer caractere não numérico da string informada.
 *
 * @param valor - Sequência de caracteres a ser limpa.
 * @returns Apenas os dígitos numéricos.
 *
 * @example
 * sanitizarCpf("123.456.789-01"); // "12345678901"
 */
export function sanitizarCpf(valor: string): string {
  return valor.replace(/\D/g, "");
}

/**
 * Valida se uma string é um CPF matematicamente válido.
 * 
 * Regras estritas aplicadas:
 * 1. Deve ser string e possuir exatamente 11 dígitos numéricos (sem pontuação).
 * 2. Não pode ser sequência com todos os dígitos idênticos (ex.: "11111111111").
 * 3. Validação dos dois dígitos verificadores via módulo 11.
 *
 * @param valor - Sequência com exatamente 11 dígitos numéricos.
 * @returns `true` se for válido; caso contrário, `false`.
 */
export function cpfValido(valor: string): boolean {
  if (typeof valor !== "string") {
    return false;
  }

  // Rejeita qualquer entrada que não tenha exatamente 11 dígitos numéricos puros
  if (!/^\d{11}$/.test(valor)) {
    return false;
  }

  // Rejeita sequências de números repetidos
  if (/^(\d)\1{10}$/.test(valor)) {
    return false;
  }

  const calcularDigito = (limite: number): number => {
    let soma = 0;
    for (let i = 0; i < limite - 1; i++) {
      soma += Number(valor[i]) * (limite - i);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  const digito1 = calcularDigito(10);
  const digito2 = calcularDigito(11);

  return digito1 === Number(valor[9]) && digito2 === Number(valor[10]);
}

/**
 * Alias de compatibilidade para cpfValido.
 */
export const validarCpf = cpfValido;

/**
 * Formata uma sequência de 11 dígitos no padrão clássico de CPF (000.000.000-00).
 *
 * @
