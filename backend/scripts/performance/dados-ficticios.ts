import { randomUUID } from 'node:crypto';
import { validarDestinoDoBancoDeTeste } from '../../testes/destino-do-banco.ts';

export function validarBancoDeCarga(url: string | undefined, ambiente: string | undefined): string {
  const validada = validarDestinoDoBancoDeTeste(url);
  if (ambiente === 'production' || !new URL(validada).pathname.endsWith('_performance_test')) {
    throw new Error('Carga exige ambiente não produtivo e banco exclusivo terminado em _performance_test.');
  }
  return validada;
}

type ParametrosDeCarga = { dentistas: number; pacientes: number; consultas: number };
type ConsultaFicticia = { id: string; clienteId: string; dentistaId: string; procedimentoId: string; inicio: Date; fim: Date };

export function gerarDadosDeCarga(parametros: ParametrosDeCarga) {
  const { dentistas, pacientes, consultas } = parametros;
  if (![dentistas, pacientes, consultas].every(Number.isSafeInteger)
    || dentistas < 1 || dentistas > 100 || pacientes < dentistas || pacientes > 100_000
    || consultas < 1 || consultas > 1_000_000) throw new Error('Quantidades de carga inválidas.');
  const dados = {
    dentistas: Array.from({ length: dentistas }, (_, indice) => ({
      id: randomUUID(), nome: `Dentista fictício ${indice + 1}`, cpf: cpfFicticio(100_000_000 + indice),
      email: `carga.dentista.${indice + 1}@exemplo.invalid`, cro: `CARGA-${indice + 1}`,
    })),
    pacientes: Array.from({ length: pacientes }, (_, indice) => ({
      id: randomUUID(), nome: `Paciente fictício ${indice + 1}`, cpf: cpfFicticio(indice + 1),
      telefone: `479${String(indice + 1).padStart(8, '0')}`,
    })),
    consultas: [] as ConsultaFicticia[],
    procedimento: { id: randomUUID(), nome: 'Procedimento fictício de carga', duracaoMinutos: 30, precoCentavos: 10000 },
  };
  for (let indice = 0; indice < consultas; indice += 1) {
    const faixa = Math.floor(indice / dentistas);
    const inicio = new Date('2030-01-07T12:00:00Z');
    const diaUtil = Math.floor(faixa / 16);
    inicio.setUTCDate(inicio.getUTCDate() + diaUtil + Math.floor(diaUtil / 5) * 2);
    inicio.setUTCMinutes((faixa % 16) * 30);
    dados.consultas.push({
      id: randomUUID(), clienteId: dados.pacientes[indice % pacientes]!.id,
      dentistaId: dados.dentistas[indice % dentistas]!.id, procedimentoId: dados.procedimento.id,
      inicio, fim: new Date(inicio.getTime() + 30 * 60_000),
    });
  }
  const livre = new Date(dados.consultas.at(-1)!.fim);
  livre.setUTCDate(livre.getUTCDate() + 1);
  livre.setUTCHours(12, 0, 0, 0);
  while ([0, 6].includes(livre.getUTCDay())) livre.setUTCDate(livre.getUTCDate() + 1);
  return { ...dados, inicioDisputa: livre.toISOString() };
}

export function cpfFicticio(numero: number): string {
  const digitos = String(numero).padStart(9, '0').split('').map(Number);
  for (const tamanho of [9, 10]) {
    const soma = digitos.reduce((total, digito, indice) => total + digito * (tamanho + 1 - indice), 0);
    const resto = (soma * 10) % 11;
    digitos.push(resto === 10 ? 0 : resto);
  }
  return digitos.join('');
}

export type DadosDeCarga = ReturnType<typeof gerarDadosDeCarga>;
