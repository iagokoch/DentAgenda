import { describe, expect, it } from 'vitest';
import { formatarEmSaoPaulo, instanteEmSaoPaulo, type Intervalo } from '../../compartilhado/datas.ts';
import {
  horariosLivresNoPasso,
  horariosNoPasso,
  janelasLivres,
  multiploDe5Minutos,
  sobrepoe,
} from './horarios.ts';

const DIA = '2026-10-05'; // segunda
const em = (hora: string) => instanteEmSaoPaulo(DIA, hora);
const intervalo = (inicio: string, fim: string): Intervalo => ({ inicio: em(inicio), fim: em(fim) });
const horas = (instantes: Date[]) => instantes.map((instante) => formatarEmSaoPaulo(instante).slice(11, 16));
const janelas = (lista: Intervalo[]) =>
  lista.map((janela) => `${formatarEmSaoPaulo(janela.inicio).slice(11, 16)}–${formatarEmSaoPaulo(janela.fim).slice(11, 16)}`);

const MANHA = [intervalo('08:00', '12:00')];
const MADRUGADA = em('00:00'); // "agora" bem antes de qualquer horário do dia

describe('horariosNoPasso', () => {
  it('limpeza de 60 min em 08:00–12:00 → 08:00, 09:00, 10:00, 11:00', () => {
    expect(horas(horariosNoPasso(intervalo('08:00', '12:00'), 60))).toEqual(['08:00', '09:00', '10:00', '11:00']);
  });

  it('consulta que não cabe inteira no fim da faixa não aparece (90 min em 08:00–12:00 → 08:00, 09:30)', () => {
    expect(horas(horariosNoPasso(intervalo('08:00', '12:00'), 90))).toEqual(['08:00', '09:30']);
  });

  it('o passo conta a partir do início de cada faixa', () => {
    expect(horas(horariosNoPasso(intervalo('14:30', '16:30'), 60))).toEqual(['14:30', '15:30']);
  });

  it('duração zero ou negativa não gera horários (e não trava)', () => {
    expect(horariosNoPasso(intervalo('08:00', '12:00'), 0)).toEqual([]);
    expect(horariosNoPasso(intervalo('08:00', '12:00'), -30)).toEqual([]);
  });
});

describe('horariosLivresNoPasso', () => {
  it('avaliação 30 min ocupando 08:30–09:00 tira 08:00 da limpeza de 60', () => {
    const livres = horariosLivresNoPasso({
      faixas: MANHA,
      ocupados: [intervalo('08:30', '09:00')],
      duracaoMinutos: 60,
      agora: MADRUGADA,
    });

    expect(horas(livres)).toEqual(['09:00', '10:00', '11:00']);
  });

  it('horário que já passou não aparece (agora = 09:10 → 08:00 e 09:00 somem)', () => {
    const livres = horariosLivresNoPasso({ faixas: MANHA, ocupados: [], duracaoMinutos: 60, agora: em('09:10') });

    expect(horas(livres)).toEqual(['10:00', '11:00']);
  });

  it('horário exatamente agora ainda aparece', () => {
    const livres = horariosLivresNoPasso({ faixas: MANHA, ocupados: [], duracaoMinutos: 60, agora: em('09:00') });

    expect(horas(livres)).toEqual(['09:00', '10:00', '11:00']);
  });

  it('consulta encostada na ocupada (termina quando a outra começa) não conflita', () => {
    const livres = horariosLivresNoPasso({
      faixas: MANHA,
      ocupados: [intervalo('09:00', '10:00')],
      duracaoMinutos: 60,
      agora: MADRUGADA,
    });

    expect(horas(livres)).toEqual(['08:00', '10:00', '11:00']);
  });

  it('bloqueio que cobre a faixa inteira zera os horários', () => {
    const livres = horariosLivresNoPasso({
      faixas: MANHA,
      ocupados: [intervalo('07:00', '13:00')],
      duracaoMinutos: 60,
      agora: MADRUGADA,
    });

    expect(livres).toEqual([]);
  });

  it('junta as duas faixas do dia, sem horário no almoço', () => {
    const livres = horariosLivresNoPasso({
      faixas: [intervalo('08:00', '10:00'), intervalo('14:00', '16:00')],
      ocupados: [],
      duracaoMinutos: 60,
      agora: MADRUGADA,
    });

    expect(horas(livres)).toEqual(['08:00', '09:00', '14:00', '15:00']);
  });
});

describe('janelasLivres', () => {
  it('janela livre 08:30–10:00 entre duas consultas', () => {
    const resultado = janelasLivres({
      faixas: MANHA,
      ocupados: [intervalo('08:00', '08:30'), intervalo('10:00', '12:00')],
      duracaoMinutos: 30,
      agora: MADRUGADA,
    });

    expect(janelas(resultado)).toEqual(['08:30–10:00']);
  });

  it('janela menor que a duração é descartada', () => {
    const resultado = janelasLivres({
      faixas: MANHA,
      ocupados: [intervalo('08:00', '08:30'), intervalo('09:00', '12:00')],
      duracaoMinutos: 60,
      agora: MADRUGADA,
    });

    expect(resultado).toEqual([]);
  });

  it('janela começa no próximo múltiplo de 5 min depois de agora (09:07 → 09:10)', () => {
    const resultado = janelasLivres({ faixas: MANHA, ocupados: [], duracaoMinutos: 30, agora: instanteEmSaoPaulo(DIA, '09:07') });

    expect(janelas(resultado)).toEqual(['09:10–12:00']);
  });

  it('agora exatamente num múltiplo de 5 min não arredonda', () => {
    const resultado = janelasLivres({ faixas: MANHA, ocupados: [], duracaoMinutos: 30, agora: em('09:05') });

    expect(janelas(resultado)).toEqual(['09:05–12:00']);
  });

  it('agora depois do fim da faixa → nenhuma janela', () => {
    const resultado = janelasLivres({ faixas: MANHA, ocupados: [], duracaoMinutos: 30, agora: em('11:45') });

    expect(resultado).toEqual([]);
  });

  it('bloqueio que cobre a faixa inteira zera as janelas', () => {
    const resultado = janelasLivres({
      faixas: MANHA,
      ocupados: [intervalo('07:00', '13:00')],
      duracaoMinutos: 30,
      agora: MADRUGADA,
    });

    expect(resultado).toEqual([]);
  });

  it('ocupados que se sobrepõem entre si e ocupados fora da faixa não quebram o cálculo', () => {
    const resultado = janelasLivres({
      faixas: MANHA,
      ocupados: [intervalo('09:00', '10:30'), intervalo('10:00', '11:00'), intervalo('13:00', '14:00')],
      duracaoMinutos: 30,
      agora: MADRUGADA,
    });

    expect(janelas(resultado)).toEqual(['08:00–09:00', '11:00–12:00']);
  });

  it('duas faixas do dia geram janelas separadas pelo almoço', () => {
    const resultado = janelasLivres({
      faixas: [intervalo('08:00', '12:00'), intervalo('14:00', '18:00')],
      ocupados: [intervalo('11:00', '15:00')],
      duracaoMinutos: 60,
      agora: MADRUGADA,
    });

    expect(janelas(resultado)).toEqual(['08:00–11:00', '15:00–18:00']);
  });
});

describe('sobrepoe e multiploDe5Minutos', () => {
  it('intervalos encostados não se sobrepõem; invadir 1 minuto sobrepõe', () => {
    expect(sobrepoe(intervalo('08:00', '09:00'), intervalo('09:00', '10:00'))).toBe(false);
    expect(sobrepoe(intervalo('08:00', '09:01'), intervalo('09:00', '10:00'))).toBe(true);
    expect(sobrepoe(intervalo('08:00', '12:00'), intervalo('09:00', '10:00'))).toBe(true);
  });

  it('multiploDe5Minutos: 08:05 sim, 08:07 não, 08:05:30 não', () => {
    expect(multiploDe5Minutos(em('08:05'))).toBe(true);
    expect(multiploDe5Minutos(em('08:07'))).toBe(false);
    expect(multiploDe5Minutos(new Date(em('08:05').getTime() + 30_000))).toBe(false);
  });
});
