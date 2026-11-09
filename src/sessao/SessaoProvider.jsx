import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, quandoSessaoEncerrar } from '../api/api.js'
import { SessaoContexto } from './sessao-contexto.js'
import { CHAVE_DA_SAIDA, lerSaidaLocal, registrarSaidaLocal } from './saida-pendente.js'

// estado: 'carregando' enquanto tenta recuperar a sessão pelo cookie de refresh (D19).
export default function SessaoProvider({ children }) {
  const [saidaInicial] = useState(lerSaidaLocal)
  const [sessao, setSessao] = useState({ ...saidaInicial, estado: saidaInicial.saida ? 'anonimo' : 'carregando', usuario: null })
  const geracao = useRef(0)
  const saidaEmAndamento = useRef(null)

  useEffect(() => {
    const removerAviso = quandoSessaoEncerrar(() => setSessao((atual) => ({ ...atual, ...lerSaidaLocal(), estado: 'anonimo', usuario: null })))
    let cancelado = false
    const inicio = geracao.current
    async function restaurar() {
      const sessaoRenovada = await api.renovarSessao().catch(() => false)
      const usuario = sessaoRenovada ? await api.pedir('/api/auth/eu').then((r) => r.usuario, () => null) : null
      if (!cancelado && inicio === geracao.current) {
        setSessao((atual) => ({ ...atual, estado: usuario ? 'logado' : 'anonimo', usuario }))
      }
    }
    if (saidaInicial.saida) api.bloquearRestauracao()
    else restaurar()
    function sincronizarSaida(evento) {
      if (evento.key !== CHAVE_DA_SAIDA) return
      const local = lerSaidaLocal()
      if (!local.saida) return // Remover marcador em outra aba não autentica este documento.
      geracao.current += 1
      api.bloquearRestauracao()
      setSessao({ ...local, estado: 'anonimo', usuario: null })
    }
    window.addEventListener('storage', sincronizarSaida)
    return () => {
      cancelado = true
      removerAviso()
      window.removeEventListener('storage', sincronizarSaida)
    }
  }, [saidaInicial])

  const entrar = useCallback(({ accessToken, usuario }) => {
    geracao.current += 1
    const armazenamentoDisponivel = registrarSaidaLocal(null)
    api.definirToken(accessToken)
    setSessao({ estado: 'logado', usuario, saida: null, armazenamentoDisponivel })
  }, [])

  const sair = useCallback(() => {
    if (saidaEmAndamento.current) return saidaEmAndamento.current
    const inicio = ++geracao.current
    const armazenamentoDisponivel = registrarSaidaLocal('pendente')
    setSessao({ estado: 'anonimo', usuario: null, saida: 'encerrando', armazenamentoDisponivel })
    const pedido = api.encerrarSessao().then((confirmada) => {
      if (inicio !== geracao.current) return
      const saida = confirmada ? 'confirmada' : 'pendente'
      const persistiu = registrarSaidaLocal(saida)
      setSessao({ estado: 'anonimo', usuario: null, saida, armazenamentoDisponivel: persistiu })
    }, () => {
      if (inicio === geracao.current) setSessao({ estado: 'anonimo', usuario: null, saida: 'pendente', armazenamentoDisponivel })
    }).finally(() => {
      if (saidaEmAndamento.current === pedido) saidaEmAndamento.current = null
    })
    saidaEmAndamento.current = pedido
    return pedido
  }, [])

  const valor = useMemo(() => ({ ...sessao, entrar, sair }), [sessao, entrar, sair])
  return <SessaoContexto value={valor}>{children}</SessaoContexto>
}
