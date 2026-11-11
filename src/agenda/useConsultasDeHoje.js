import { useEffect, useState } from 'react'
import { api } from '../api/api.js'
import { mensagemDoErro } from '../api/mensagens.js'

export function useConsultasDeHoje(hoje) {
  const [tentativa, setTentativa] = useState(0)
  const [resposta, setResposta] = useState({ chave: null })
  const chave = `${hoje}|${tentativa}`

  useEffect(() => {
    let atual = true

    async function carregar() {
      const itens = []
      let pagina = 1
      try {
        while (atual) {
          const parametros = new URLSearchParams({ de: hoje, ate: hoje, porPagina: '100', pagina: String(pagina) })
          const dados = await api.pedir(`/api/consultas?${parametros}`)
          if (!atual) return
          itens.push(...dados.itens)
          if (itens.length >= dados.total || dados.itens.length === 0) {
            setResposta({ chave, dados: { itens, total: dados.total } })
            return
          }
          pagina += 1
        }
      } catch (falha) {
        if (atual) setResposta({ chave, erro: mensagemDoErro(falha) })
      }
    }

    carregar()
    return () => { atual = false }
  }, [hoje, chave])

  const estado = resposta.chave !== chave ? 'carregando' : resposta.erro ? 'erro' : 'pronto'
  return {
    estado,
    dados: estado === 'pronto' ? resposta.dados : undefined,
    erro: estado === 'erro' ? resposta.erro : '',
    recarregar: () => setTentativa((anterior) => anterior + 1),
  }
}
