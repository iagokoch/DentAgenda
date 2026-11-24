import { useEffect, useState } from 'react'
import { useRelogio } from '../relogio.js'

const MINUTO = 60_000

export function useAgoraAtualizado() {
  const relogio = useRelogio()
  const [agora, setAgora] = useState(() => relogio.agora())

  useEffect(() => {
    let temporizador
    function atualizar() {
      clearTimeout(temporizador)
      const instante = relogio.agora()
      setAgora(anterior => anterior.getTime() === instante.getTime() ? anterior : instante)
      temporizador = setTimeout(atualizar, MINUTO - (instante.getTime() % MINUTO))
    }
    atualizar()
    window.addEventListener('focus', atualizar)
    document.addEventListener('visibilitychange', atualizar)
    return () => {
      clearTimeout(temporizador)
      window.removeEventListener('focus', atualizar)
      document.removeEventListener('visibilitychange', atualizar)
    }
  }, [relogio])

  return agora
}
