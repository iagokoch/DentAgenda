/**
 * Confere os dois dígitos verificadores pelo módulo 11 (D25.1).
 * @param valor - CPF com exatamente 11 dígitos, sem pontuação.
 * @returns Se os verificadores estão corretos e os dígitos não são todos iguais.
 */
export function cpfValido(valor: string): boolean {
  if (!/^\d{11}$/.test(valor)) {
    return false;
  }

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
