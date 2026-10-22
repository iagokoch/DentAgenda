import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/api.js'
import { mensagemDoErro } from '../api/mensagens.js'
import { useDadosDaApi } from '../api/useDadosDaApi.js'
import { faixasPorDia, gradeParaEnviar } from '../admin/formatos.js'
import { dataEHoraLegiveis } from '../agenda/calendario.js'

// 0 = domingo … 6 = sábado (D12). A semana começa na segunda, como na clínica.
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const ORDEM_DOS_DIAS = [1, 2, 3, 4, 5, 6, 0]
const FAIXA_NOVA = { inicio: '08:00', fim: '12:00' }
const maiuscula = (texto) => texto[0].toUpperCase() + texto.slice(1)

// Grade semanal do dentista (D12, D37): R, D e A leem; só A grava (PUT da semana inteira).
export default function GradeSemanal({ dentistaId, podeEditar }) {
  const leitura = useDadosDaApi(`/api/dentistas/${dentistaId}/grade`)

  return (
    <section className="panel disponibilidade-secao" aria-labelledby="titulo-grade" aria-busy={leitura.estado === 'carregando'}>
      <h2 id="titulo-grade">Grade semanal</h2>
      <p className="form-info">Horários em que o dentista atende, toda semana. Os horários livres da agenda saem daqui.</p>
      {leitura.estado === 'carregando' && <p className="form-info agenda-estado">Carregando grade…</p>}
      {leitura.estado === 'erro' && (
        <div className="agenda-estado">
          <p className="form-error" role="alert">{leitura.erro}</p>
          <button type="button" className="soft-btn" onClick={leitura.recarregar}>Tentar de novo</button>
        </div>
      )}
      {leitura.estado === 'pronto' && (podeEditar
        ? <EditorDeGrade key={dentistaId} dentistaId={dentistaId} gradeInicial={leitura.dados} />
        : <GradeSoLeitura grade={leitura.dados} />)}
    </section>
  )
}

function GradeSoLeitura({ grade }) {
  if (grade.length === 0) return <p className="form-info agenda-estado">Sem grade: este dentista não tem horários livres.</p>
  const dias = faixasPorDia(grade)
  return (
    <dl className="grade-leitura">
      {ORDEM_DOS_DIAS.map((dia) => (
        <div key={dia}>
          <dt>{maiuscula(DIAS[dia])}</dt>
          <dd>{dias[dia].length === 0 ? 'Não atende' : dias[dia].map((faixa) => `${faixa.inicio}–${faixa.fim}`).join(', ')}</dd>
        </div>
      ))}
    </dl>
  )
}

function EditorDeGrade({ dentistaId, gradeInicial }) {
  const [dias, setDias] = useState(() => faixasPorDia(gradeInicial))
  const [envio, setEnvio] = useState({ estado: 'parado' })

  const mudarDia = (dia, faixas) => {
    setDias(dias.map((atuais, indice) => (indice === dia ? faixas : atuais)))
    setEnvio({ estado: 'parado' })
  }
  const alterarFaixa = (dia, posicao, campo, valor) => mudarDia(dia, dias[dia].map((faixa, indice) => (indice === posicao ? { ...faixa, [campo]: valor } : faixa)))

  async function salvar(evento) {
    evento.preventDefault()
    setEnvio({ estado: 'enviando' })
    try {
      const { consultasForaDaGrade } = await api.pedir(`/api/dentistas/${dentistaId}/grade`, { metodo: 'PUT', corpo: gradeParaEnviar(dias) })
      setEnvio({ estado: 'salvo', consultasForaDaGrade })
    } catch (falha) {
      setEnvio({ estado: 'erro', mensagem: mensagemDoErro(falha) })
    }
  }

  return (
    <form className="grade-editor" onSubmit={salvar}>
      {ORDEM_DOS_DIAS.map((dia) => (
        <fieldset key={dia} className="grade-dia">
          <legend>{maiuscula(DIAS[dia])}</legend>
          <div className="grade-dia__faixas">
            {dias[dia].length === 0 && <span className="grade-dia__vazio">Não atende</span>}
            {dias[dia].map((faixa, posicao) => (
              <div className="grade-faixa" key={posicao}>
                <input type="time" step="300" required aria-label={`Início da faixa ${posicao + 1} de ${DIAS[dia]}`} value={faixa.inicio} onChange={(e) => alterarFaixa(dia, posicao, 'inicio', e.target.value)} />
                <span aria-hidden="true">até</span>
                <input type="time" step="300" required aria-label={`Fim da faixa ${posicao + 1} de ${DIAS[dia]}`} value={faixa.fim} onChange={(e) => alterarFaixa(dia, posicao, 'fim', e.target.value)} />
                <button type="button" className="text-button text-button--perigo" aria-label={`Remover faixa ${faixa.inicio}–${faixa.fim} de ${DIAS[dia]}`} onClick={() => mudarDia(dia, dias[dia].filter((_, indice) => indice !== posicao))}>Remover</button>
              </div>
            ))}
          </div>
          <button type="button" className="text-button" aria-label={`Adicionar faixa na ${DIAS[dia]}`} onClick={() => mudarDia(dia, [...dias[dia], { ...FAIXA_NOVA }])}>+ Faixa</button>
        </fieldset>
      ))}
      <div aria-live="polite">
        {envio.estado === 'erro' && <p className="form-error" role="alert">{envio.mensagem}</p>}
        {envio.estado === 'salvo' && <ResultadoDaGrade consultas={envio.consultasForaDaGrade} />}
      </div>
      <div className="grade-editor__acoes">
        <button className="primary-btn primary-btn--solid" disabled={envio.estado === 'enviando'}>{envio.estado === 'enviando' ? 'Salvando…' : 'Salvar grade'}</button>
      </div>
    </form>
  )
}

// D12.5: a grade nova nunca cancela nada sozinha; a recepção resolve as consultas que ficaram de fora.
function ResultadoDaGrade({ consultas }) {
  if (consultas.length === 0) return <p className="form-info form-sucesso">Grade salva.</p>
  return (
    <div className="form-info form-sucesso">
      <p>Grade salva. Estas consultas confirmadas ficaram fora da nova grade; nada foi cancelado. Remarque ou cancele cada uma:</p>
      <ul className="lista-de-consultas">
        {consultas.map((consulta) => (
          <li key={consulta.id}><Link to={`/consultas/${consulta.id}`}>{dataEHoraLegiveis(consulta.inicio)} — {consulta.paciente.nome}</Link></li>
        ))}
      </ul>
    </div>
  )
}
