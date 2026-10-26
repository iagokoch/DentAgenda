import { useEffect, useRef } from 'react'
import Icon from './Icon'
import { useFocoPreso } from './useFocoPreso.js'

// Painel lateral modal (o mesmo visual do "Editar dados" do paciente): foco no primeiro campo do formulário e preso no
// painel (#2), Esc e clique fora fecham, e o foco volta para quem abriu.
export default function Gaveta({ titulo, subtitulo, aoFechar, children }) {
  const painel = useRef(null)
  const aoFecharAtual = useRef(aoFechar)
  useFocoPreso(painel)

  useEffect(() => {
    aoFecharAtual.current = aoFechar
  })

  useEffect(() => {
    const anterior = document.activeElement
    painel.current?.querySelector('form input:not(:disabled), form select, form textarea')?.focus()
    const fecharComEsc = (evento) => evento.key === 'Escape' && aoFecharAtual.current()
    document.addEventListener('keydown', fecharComEsc)
    return () => {
      document.removeEventListener('keydown', fecharComEsc)
      anterior?.focus?.()
    }
  }, [])

  return (
    <div className="drawer-backdrop" onMouseDown={(evento) => evento.target === evento.currentTarget && aoFechar()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="gaveta-titulo" ref={painel}>
        <header className="drawer__header">
          <div>
            <h2 id="gaveta-titulo">{titulo}</h2>
            {subtitulo && <p>{subtitulo}</p>}
          </div>
          <button type="button" className="icon-button" aria-label="Fechar" onClick={aoFechar}><Icon name="close" /></button>
        </header>
        {children}
      </aside>
    </div>
  )
}
