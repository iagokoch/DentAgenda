import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// #3: nenhum botão sem ação. Todo <button> das telas tem onClick ou é o envio explícito de um formulário (type="submit").
const PASTA = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

// Atributos de cada <button ...>, até o ">" que fecha a tag (ignora os ">" dentro de {…}, como em "=>" e ">=").
function atributosDosBotoes(texto) {
  const botoes = []
  for (let inicio = texto.indexOf('<button'); inicio !== -1; inicio = texto.indexOf('<button', inicio + 1)) {
    let profundidade = 0
    let fim = inicio + '<button'.length
    for (; fim < texto.length; fim++) {
      if (texto[fim] === '{') profundidade++
      else if (texto[fim] === '}') profundidade--
      else if (texto[fim] === '>' && profundidade === 0) break
    }
    botoes.push(texto.slice(inicio + '<button'.length, fim))
  }
  return botoes
}

const telas = readdirSync(PASTA, { recursive: true, encoding: 'utf8' }).filter((arquivo) => arquivo.endsWith('.jsx') && !arquivo.includes('.test.') && !arquivo.startsWith('testes'))

describe('botões com ação (#3)', () => {
  it('o leitor de atributos não para no ">" de "=>"', () => {
    expect(atributosDosBotoes('<button disabled={a >= b} onClick={() => x()}>Ir</button>')).toEqual([' disabled={a >= b} onClick={() => x()}'])
  })

  it.each(telas)('%s', (arquivo) => {
    const semAcao = atributosDosBotoes(readFileSync(join(PASTA, arquivo), 'utf8')).filter((atributos) => !/\bonClick=/.test(atributos) && !/\btype="submit"/.test(atributos))
    expect(semAcao).toEqual([])
  })
})
