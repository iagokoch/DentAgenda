import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { cpfValido } from '../compartilhado/cpf.ts';
import { esquemaEmail, esquemaSenha } from '../compartilhado/validacao.ts';
import { dataEmSaoPaulo, instanteEmSaoPaulo } from '../compartilhado/datas.ts';
import { paginar } from '../compartilhado/paginacao.ts';
import { horariosLivresNoPasso, horariosNoPasso, janelasLivres, sobrepoe } from '../modulos/disponibilidade/horarios.ts';

const parametros = { seed: 20261112, numRuns: 300 };
const instante = (minuto: number) => new Date(Date.UTC(2026, 9, 5) + minuto * 60000);
const intervalo = (inicio: number, duracao: number) => ({ inicio: instante(inicio), fim: instante(inicio + duracao) });
const ocupado = fc.tuple(fc.integer({ min: 0, max: 1440 }), fc.integer({ min: 1, max: 180 }))
  .map(([inicio, duracao]) => intervalo(inicio, duracao));

describe('Break-It: propriedades sem persistência', () => {
  it('CPF gerado por módulo 11 independente aceita verificadores e recusa alteração final', () => {
    fc.assert(fc.property(fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 9, maxLength: 9 }), (base) => {
      fc.pre(new Set(base).size > 1);
      const digito = (numeros: number[]) => {
        const resto = numeros.reduce((soma, numero, indice) => soma + numero * (numeros.length + 1 - indice), 0) % 11;
        return resto < 2 ? 0 : 11 - resto;
      };
      const dez = [...base, digito(base)];
      const completo = [...dez, digito(dez)];
      expect(cpfValido(completo.join(''))).toBe(true);
      expect(cpfValido([...dez, (completo[10]! + 1) % 10].join(''))).toBe(false);
    }), parametros);
  });

  it('e-mail normaliza caixa sem mudar identidade e é idempotente', () => {
    fc.assert(fc.property(fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,30}$/), (nome) => {
      const resultado = esquemaEmail.parse(`${nome}@EXEMPLO.INVALID`);
      expect(resultado).toBe(`${nome.toLowerCase()}@exemplo.invalid`);
      expect(esquemaEmail.parse(resultado)).toBe(resultado);
    }), parametros);
  });

  it('limite bcrypt considera bytes UTF-8 também com Unicode', () => {
    fc.assert(fc.property(fc.array(fc.constantFrom('a', 'é', '中', '😀'), { minLength: 0, maxLength: 80 }), (partes) => {
      const valor = partes.join('');
      expect(esquemaSenha.safeParse(valor).success).toBe([...valor].length >= 8 && Buffer.byteLength(valor, 'utf8') <= 72);
    }), parametros);
  });

  it('sobreposição coincide com interseção positiva e permite contato [início,fim)', () => {
    fc.assert(fc.property(ocupado, ocupado, (a, b) => {
      const intersecao = Math.max(a.inicio.getTime(), b.inicio.getTime()) < Math.min(a.fim.getTime(), b.fim.getTime());
      expect(sobrepoe(a, b)).toBe(intersecao);
      expect(sobrepoe(b, a)).toBe(intersecao);
      expect(sobrepoe(a, { inicio: a.fim, fim: new Date(a.fim.getTime() + 60000) })).toBe(false);
    }), parametros);
  });

  it('passos preservam cardinalidade, duração e limites', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 240 }), fc.integer({ min: 1, max: 180 }), fc.integer({ min: 1, max: 60 }), (tamanho, duracao, passo) => {
      const faixa = intervalo(480, tamanho);
      const resultados = horariosNoPasso(faixa, duracao, passo);
      expect(resultados).toHaveLength(tamanho < duracao ? 0 : Math.floor((tamanho - duracao) / passo) + 1);
      resultados.forEach((inicio, indice) => expect(inicio.getTime()).toBe(faixa.inicio.getTime() + indice * passo * 60000));
    }), parametros);
  });

  it('duração não positiva não oferece reservas mesmo com passo positivo', () => {
    fc.assert(fc.property(fc.integer({ min: -120, max: 0 }), fc.integer({ min: 1, max: 60 }), (duracao, passo) => {
      expect(horariosNoPasso(intervalo(480, 60), duracao, passo)).toEqual([]);
    }), parametros);
  });

  it('janelas e vagas conservam espaço livre, ordem dos bloqueios e monotonicidade', () => {
    fc.assert(fc.property(fc.array(ocupado, { maxLength: 12 }), fc.integer({ min: 1, max: 120 }), (ocupados, duracaoMinutos) => {
      const entrada = { faixas: [intervalo(480, 480)], ocupados, duracaoMinutos, agora: instante(490) };
      const vagas = horariosLivresNoPasso(entrada).map(Number);
      expect(horariosLivresNoPasso({ ...entrada, ocupados: [...ocupados].reverse() }).map(Number)).toEqual(vagas);
      const adicionais = horariosLivresNoPasso({ ...entrada, ocupados: [...ocupados, intervalo(600, 60)] }).map(Number);
      expect(adicionais.every((inicio) => vagas.includes(inicio))).toBe(true);
      const janelas = janelasLivres(entrada);
      for (const janela of janelas) {
        expect(janela.inicio.getTime() % 300000).toBe(0);
        expect(janela.inicio >= entrada.agora).toBe(true);
        expect(janela.fim.getTime() - janela.inicio.getTime()).toBeGreaterThanOrEqual(duracaoMinutos * 60000);
        expect(ocupados.some((item) => sobrepoe(janela, item))).toBe(false);
      }
      for (let minuto = 490; minuto + duracaoMinutos <= 960; minuto += 5) {
        const candidato = intervalo(minuto, duracaoMinutos);
        const cabe = !ocupados.some((item) => sobrepoe(candidato, item));
        expect(janelas.some((janela) => candidato.inicio >= janela.inicio && candidato.fim <= janela.fim)).toBe(cabe);
      }
    }), parametros);
  });

  it('datas modernas voltam ao dia clínico mesmo perto de meia-noite', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 3650 }), fc.integer({ min: 0, max: 23 }), (dias, hora) => {
      const data = new Date(Date.UTC(2025, 0, 1) + dias * 86400000).toISOString().slice(0, 10);
      expect(dataEmSaoPaulo(instanteEmSaoPaulo(data, `${String(hora).padStart(2, '0')}:59`))).toBe(data);
    }), parametros);
  });

  it('paginação moderada cobre blocos contíguos sem repetição', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 10000 }), fc.integer({ min: 1, max: 100 }), (pagina, tamanho) => {
      const atual = paginar(pagina, tamanho);
      expect(paginar(pagina + 1, tamanho).skip).toBe(atual.skip + atual.take);
      expect(Number.isSafeInteger(atual.skip)).toBe(true);
    }), parametros);
  });
});
