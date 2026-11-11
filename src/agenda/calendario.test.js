import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { mensagemDoHorario } from '../api/mensagens.js'
import { dataDeHoje, dataEHoraLegiveis, diaDoMes, dataDoDia, deslocarMes, horaDoInstante, mesDaData, nomeDoMes, posicaoDoPrimeiroDia, precoEmReais, quantidadeDeDias } from './calendario.js'

describe('calendário do agendamento', () => {
  it('mesDaData devolve AAAA-MM', () => {
    expect(mesDaData(new Date('2026-10-22T12:00:00Z'))).toBe('2026-10')
  })

  it('deslocarMes passa de dezembro para janeiro e de janeiro para dezembro', () => {
    expect(deslocarMes('2026-12', 1)).toBe('2027-01')
    expect(deslocarMes('2026-01', -1)).toBe('2025-12')
    expect(deslocarMes('2026-10', 1)).toBe('2026-11')
  })

  it('nomeDoMes escreve o mês por extenso', () => {
    expect(nomeDoMes('2026-10')).toBe('Outubro 2026')
  })

  it('quantidadeDeDias respeita mês de 30, 31 e fevereiro bissexto', () => {
    expect(quantidadeDeDias('2026-10')).toBe(31)
    expect(quantidadeDeDias('2026-11')).toBe(30)
    expect(quantidadeDeDias('2028-02')).toBe(29)
  })

  it('posicaoDoPrimeiroDia conta de domingo (0) a sábado (6)', () => {
    expect(posicaoDoPrimeiroDia('2026-10')).toBe(4)
  })

  it('dataDoDia e diaDoMes são inversos', () => {
    expect(dataDoDia('2026-10', 5)).toBe('2026-10-05')
    expect(diaDoMes('2026-10-05')).toBe(5)
  })

  it('horaDoInstante lê a hora escrita no texto, sem converter fuso', () => {
    expect(horaDoInstante('2026-10-05T09:30:00-03:00')).toBe('09:30')
  })

  it('dataDeHoje devolve AAAA-MM-DD com zero à esquerda', () => {
    expect(dataDeHoje(new Date('2026-10-05T12:00:00Z'))).toBe('2026-10-05')
  })

  it.each([
    ['2026-12-01T00:30:00Z', '2026-11-30'],
    ['2026-12-01T02:59:59.999Z', '2026-11-30'],
    ['2026-12-01T03:00:00Z', '2026-12-01'],
    ['2027-01-01T01:00:00Z', '2026-12-31'],
    ['2027-01-01T03:00:00Z', '2027-01-01'],
    ['2028-03-01T02:30:00Z', '2028-02-29'],
    ['2026-06-15T02:00:00Z', '2026-06-14'],
    ['2026-11-30T15:30:00Z', '2026-11-30'],
  ])('dia e mês de %s seguem a clínica, não o navegador', (instante, diaEsperado) => {
    const agora = new Date(instante)
    expect(dataDeHoje(agora)).toBe(diaEsperado)
    expect(mesDaData(agora)).toBe(diaEsperado.slice(0, 7))
  })

  // A suíte padrão fixa TZ em São Paulo; cada processo precisa nascer no fuso que queremos conferir.
  it.each([
    ['America/Sao_Paulo', 180], ['UTC', 0], ['Asia/Tokyo', -540],
  ])('preserva dia e mês da clínica em processo separado com fuso %s', (fuso, deslocamento) => {
    const codigo = `
      import { dataDeHoje, mesDaData, deslocarMes } from ${JSON.stringify(new URL('./calendario.js', import.meta.url).href)};
      const agora = new Date('2026-12-01T00:30:00Z');
      console.log(JSON.stringify({
        fuso: Intl.DateTimeFormat().resolvedOptions().timeZone,
        deslocamento: agora.getTimezoneOffset(),
        hoje: dataDeHoje(agora), mes: mesDaData(agora), proximoMes: deslocarMes('2026-11', 1),
      }));
    `
    const resultado = spawnSync(process.execPath, ['--input-type=module', '-e', codigo], {
      env: { ...process.env, TZ: fuso }, encoding: 'utf8', timeout: 5000,
    })
    expect(resultado.status, resultado.stderr).toBe(0)
    expect(JSON.parse(resultado.stdout)).toEqual({
      fuso, deslocamento, hoje: '2026-11-30', mes: '2026-11', proximoMes: '2026-12',
    })
  })

  it.each([
    ['2026-11', 0, '2026-11'], ['2026-11', 1, '2026-12'],
    ['2026-12', 1, '2027-01'], ['2027-01', -1, '2026-12'],
    ['2028-03', -1, '2028-02'], ['2026-01', 13, '2027-02'],
  ])('desloca o mês civil %s em %i sem aplicar fuso', (mes, deslocamento, esperado) => {
    expect(deslocarMes(mes, deslocamento)).toBe(esperado)
  })

  it('dataEHoraLegiveis escreve dia/mês/ano às hora', () => {
    expect(dataEHoraLegiveis('2026-10-05T09:30:00-03:00')).toBe('05/10/2026 às 09:30')
  })

  it('precoEmReais formata centavos em reais', () => {
    expect(precoEmReais(18000)).toBe('180,00')
    expect(precoEmReais(0)).toBe('0,00')
    expect(precoEmReais(123456)).toBe('1.234,56')
  })
})

describe('mensagemDoHorario', () => {
  it.each([
    'HORARIO_INDISPONIVEL',
    'PACIENTE_COM_CONSULTA_NO_HORARIO',
    'FORA_DA_GRADE',
    'HORARIO_BLOQUEADO',
    'FORA_DO_PASSO',
    'FORA_DOS_5_MINUTOS',
  ])('%s leva a escolher outro horário', (codigo) => {
    expect(mensagemDoHorario({ status: 409, codigo })).toMatch(/horário/i)
  })

  it('devolve null para erro que não é de horário', () => {
    expect(mensagemDoHorario({ status: 422, codigo: 'DENTISTA_INATIVO' })).toBeNull()
    expect(mensagemDoHorario(new Error('x'))).toBeNull()
  })
})
