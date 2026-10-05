import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, quandoSessaoEncerrar } from '../api/api.js'
import { SessaoContexto } from './sessao-contexto.js'

// estado: 'carregando' enquanto tenta recuperar a sessão pelo cookie de refresh (D19).
export default function SessaoProvider({ children }) {
  const [sessao, setSessao] = useState({ estado: 'carregando', usuario: null })

  useEffect(() => {
    quandoSessaoEncerrar(() => setSessao({ estado: 'anonimo', usuario: null }))
    let cancelado = false
    async function restaurar() {
      const usuario = (await api.renovarSessao()) ? await api.pedir('/api/auth/eu').then((r) => r.usuario, () => null) : null
      if (!cancelado) setSessao(usuario ? { estado: 'logado', usuario } : { estado: 'anonimo', usuario: null })
    }
    restaurar()
    return () => {
      cancelado = true
    }
  }, [])

  const entrar = useCallback(({ accessToken, usuario }) => {
    api.definirToken(accessToken)
    setSessao({ estado: 'logado', usuario })
  }, [])

  const sair = useCallback(async () => {
    await api.pedir('/api/auth/logout', { metodo: 'POST' }).catch(() => {})
    api.definirToken(null)
    setSessao({ estado: 'anonimo', usuario: null })
  }, [])

  const valor = useMemo(() => ({ ...sessao, entrar, sair }), [sessao, entrar, sair])
  return <SessaoContexto value={valor}>{children}</SessaoContexto>
}
