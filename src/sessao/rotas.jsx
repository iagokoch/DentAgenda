import { Navigate } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'
import { telaInicialDe, useSessao } from './sessao-contexto.js'

function Carregando() {
  return (
    <AuthLayout mode="center">
      <p className="form-info">Carregando…</p>
    </AuthLayout>
  )
}

// Só a interface esconde as telas; quem garante o acesso é a API (D10).
export function RotaProtegida({ tipo, children }) {
  const { estado, usuario } = useSessao()
  if (estado === 'carregando') return <Carregando />
  if (estado === 'anonimo') return <Navigate to="/login" replace />
  if (usuario.tipo !== tipo) return <Navigate to={telaInicialDe(usuario)} replace />
  return children
}

export function RotaPublica({ children }) {
  const { estado, usuario } = useSessao()
  if (estado === 'carregando') return <Carregando />
  if (estado === 'logado') return <Navigate to={telaInicialDe(usuario)} replace />
  return children
}
