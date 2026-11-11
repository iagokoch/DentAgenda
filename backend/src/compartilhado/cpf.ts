const TAMANHO_CPF = 11;

// Remove qualquer caractere nao numerico da string informada
export function sanitizarCpf(valor: string): string {
  return valor.replace(/\D/g, "");
}

// Valida se a string fornecida e um CPF matematicamente valido
export function cpfValido(valor: string): boolean {
  if (typeof valor !== "string") {
    return false;
  }

  // Rejeita qualquer entrada que nao tenha exatamente 11 digitos numericos
  if (!/^\d{11}$/.test(valor)) {
    return false;
  }

  // Rejeita sequencias de numeros repetidos
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

// Alias de compatibilidade para cpfValido
export const validarCpf = cpfValido;

// Formata uma sequencia de 11 digitos no padrao 000.000.000-00
export function formatarCpf(valor: string): string {
  const digitos = sanitizarCpf(valor);
  if (digitos.length !== TAMANHO_CPF) {
    return valor;
  }
  return digitos.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}
