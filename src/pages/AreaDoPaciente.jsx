import AuthLayout from '../components/AuthLayout'
import Brand from '../components/Brand'
import { useSessao } from '../sessao/sessao-contexto.js'

// D30, em aberto: o Figma não tem tela do paciente logado; a F3 decide o que entra aqui.
export default function AreaDoPaciente() {
  const { usuario, sair } = useSessao()
  return (
    <AuthLayout mode="center">
      <div className="recovery">
        <Brand />
        <h1>Olá, {usuario.nome}</h1>
        <p>Em breve você poderá ver e marcar suas consultas por aqui.</p>
        <button className="primary-btn" onClick={sair}>Sair</button>
      </div>
    </AuthLayout>
  )
}
