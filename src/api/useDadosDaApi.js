import { useEffect, useState } from 'react'
import { api } from './api.js'
import { mensagemDoErro } from './mensagens.js'

// Leitura (GET) com os estados da tela: 'ocioso' (caminho nulo), 'carregando', 'erro' e 'pronto'.
// A resposta guarda a que pedido pertence; enquanto não for a do pedido atual, está carregando.
export function useDadosDaApi(caminho) {
  const [tentativa, setTentativa] = useState(0)
  const [resposta, setResposta] = useState({ chave: null })
  const chave = caminho ? `${caminho}|${tentativa}` : null

  useEffect(() => {
    if (!chave) return undefined
    let atual = true
    api.pedir(caminho).then(
      (dados) => atual && setResposta({ chave, dados }),
      (falha) => atual && setResposta({ chave, erro: mensagemDoErro(falha) }),
    )
    return () => {
      atual = false
    }
  }, [caminho, chave])

  const estado = !chave ? 'ocioso' : resposta.chave !== chave ? 'carregando' : resposta.erro ? 'erro' : 'pronto'
  return {
    estado,
    dados: estado === 'pronto' ? resposta.dados : undefined,
    erro: estado === 'erro' ? resposta.erro : '',
    recarregar: () => setTentativa((anterior) => anterior + 1),
  }
}
