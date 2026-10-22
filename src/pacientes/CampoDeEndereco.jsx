// Campos do endereço, nos formulários de cadastro e de edição.
export default function CampoDeEndereco({ valor, aoMudar, prefixo }) {
  const campo = (nome, rotulo, extra = {}) => (
    <div className={`field ${extra.className ?? ''}`}>
      <label htmlFor={`${prefixo}-${nome}`}>{rotulo}</label>
      <div className="input-wrap">
        <input id={`${prefixo}-${nome}`} value={valor[nome]} onChange={(e) => aoMudar({ ...valor, [nome]: e.target.value })} {...extra.input} />
      </div>
    </div>
  )
  return (
    <div className="form-grid">
      {campo('cep', 'CEP', { input: { inputMode: 'numeric', maxLength: 9, autoComplete: 'postal-code' } })}
      {campo('logradouro', 'Logradouro', { className: 'form-grid__wide', input: { autoComplete: 'address-line1' } })}
      {campo('numero', 'Número')}
      {campo('complemento', 'Complemento', { input: { placeholder: 'Apto, sala…' } })}
      {campo('bairro', 'Bairro')}
      {campo('cidade', 'Cidade', { input: { autoComplete: 'address-level2' } })}
      {campo('uf', 'UF', { input: { maxLength: 2, autoComplete: 'address-level1' } })}
    </div>
  )
}
