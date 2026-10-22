import { useEffect } from 'react'

const FOCAVEIS = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

// #2: enquanto um painel modal (gaveta, popup) está aberto, Tab e Shift+Tab circulam só dentro dele.
export function useFocoPreso(painel) {
  useEffect(() => {
    function prender(evento) {
      if (evento.key !== 'Tab' || !painel.current) return
      const focaveis = [...painel.current.querySelectorAll(FOCAVEIS)]
      if (focaveis.length === 0) return
      const primeiro = focaveis[0]
      const ultimo = focaveis.at(-1)
      const dentro = painel.current.contains(document.activeElement)
      if (!dentro || (!evento.shiftKey && document.activeElement === ultimo)) {
        evento.preventDefault()
        primeiro.focus()
      } else if (evento.shiftKey && document.activeElement === primeiro) {
        evento.preventDefault()
        ultimo.focus()
      }
    }
    document.addEventListener('keydown', prender)
    return () => document.removeEventListener('keydown', prender)
  }, [painel])
}
