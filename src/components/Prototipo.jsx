// Telas ainda simuladas (Início e Agenda, até a F3) avisam que os dados são exemplos e que nada é salvo.
export function FaixaDePrototipo({ children }) {
  return (
    <div className="faixa-prototipo" role="note">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 7v4M8 4.8v.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <div>
        <strong>Tela em protótipo</strong>
        {children}
      </div>
    </div>
  );
}

export function EtiquetaExemplo() {
  return <span className="exemplo">Exemplo</span>;
}
