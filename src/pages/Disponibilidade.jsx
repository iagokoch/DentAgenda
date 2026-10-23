import { useState } from 'react'
import { useDadosDaApi } from '../api/useDadosDaApi.js'
import AppShell from '../components/AppShell'
import Bloqueios from '../disponibilidade/Bloqueios.jsx'
import GradeSemanal from '../disponibilidade/GradeSemanal.jsx'
import { ehAdmin, useSessao } from '../sessao/sessao-contexto.js'

// Quando cada dentista atende (D37): grade semanal e bloqueios. Recepção e admin escolhem o dentista; o dentista vê a
// própria agenda (admin dentista escolhe a grade de qualquer um, mas bloqueia só a própria — a API devolve 404 nos dos
// colegas).
export default function Disponibilidade() {
  const { usuario } = useSessao()
  const ehDentista = usuario.categoria === 'DENTISTA'
  const escolheDentista = !ehDentista || ehAdmin(usuario)
  const dentistas = useDadosDaApi('/api/dentistas')
  const [escolhido, setEscolhido] = useState(ehDentista ? usuario.id : '')
  const dentistaId = escolhido || dentistas.dados?.[0]?.id
  const mostraBloqueios = !ehDentista || dentistaId === usuario.id

  return (
    <AppShell title="Disponibilidade" wide>
      <div className="page-heading">
        <div>
          <h1>Disponibilidade</h1>
          <p>{escolheDentista ? 'Grade semanal e bloqueios de cada dentista.' : 'Sua grade semanal e seus bloqueios.'}</p>
        </div>
        {escolheDentista && dentistas.estado === 'pronto' && dentistas.dados.length > 0 && (
          <div className="field disponibilidade-dentista">
            <label htmlFor="disponibilidade-dentista">Dentista</label>
            <select id="disponibilidade-dentista" value={dentistaId} onChange={(e) => setEscolhido(e.target.value)}>
              {dentistas.dados.map((dentista) => <option key={dentista.id} value={dentista.id}>{dentista.nome}</option>)}
            </select>
          </div>
        )}
      </div>

      {escolheDentista && dentistas.estado === 'carregando' && <p className="form-info agenda-estado">Carregando dentistas…</p>}
      {escolheDentista && dentistas.estado === 'erro' && (
        <div className="agenda-estado">
          <p className="form-error" role="alert">{dentistas.erro}</p>
          <button type="button" className="soft-btn" onClick={dentistas.recarregar}>Tentar de novo</button>
        </div>
      )}
      {escolheDentista && dentistas.estado === 'pronto' && dentistas.dados.length === 0 && (
        <p className="form-info agenda-estado">Nenhum dentista ativo. Um administrador cadastra os dentistas em Equipe.</p>
      )}

      {dentistaId && (
        <div className="disponibilidade">
          <GradeSemanal key={`grade-${dentistaId}`} dentistaId={dentistaId} podeEditar={ehAdmin(usuario)} />
          {mostraBloqueios && <Bloqueios key={`bloqueios-${dentistaId}`} dentistaId={dentistaId} dentistas={ehDentista ? [] : (dentistas.dados ?? [])} />}
        </div>
      )}
    </AppShell>
  )
}
