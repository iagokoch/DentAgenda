// D25.1: 11 dígitos com dígitos verificadores corretos; sequência repetida passa no cálculo, mas não é CPF.
export function cpfValido(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digitos = [...cpf].map(Number);
  const digitoVerificador = (quantidade: number) => {
    const soma = digitos
      .slice(0, quantidade)
      .reduce((total, digito, indice) => total + digito * (quantidade + 1 - indice), 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digitoVerificador(9) === digitos[9] && digitoVerificador(10) === digitos[10];
}
