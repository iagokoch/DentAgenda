import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ehAdmin, useSessao } from '../sessao/sessao-contexto.js';
import Brand from './Brand';
import Icon from './Icon';
import { termoDeBusca } from '../pacientes/formatar.js';

const LINKS_DA_CLINICA = [{to:'/inicio',label:'Início',icon:'home'},{to:'/agenda',label:'Agenda',icon:'calendar'},{to:'/pacientes',label:'Pacientes',icon:'users'},{to:'/disponibilidade',label:'Disponibilidade',icon:'clock'}];
// D37: o menu só mostra o que o papel abre (a API é quem garante).
const LINKS_DO_ADMIN = [{to:'/admin/equipe',label:'Equipe',icon:'id'},{to:'/admin/procedimentos',label:'Procedimentos',icon:'clipboard'}];
// D35: o paciente usa o mesmo layout, com a navegação dele e sem a busca de pacientes.
const LINKS_DO_PACIENTE = [{to:'/minha-conta',label:'Minhas consultas',icon:'calendar',exato:true},{to:'/minha-conta/agendar',label:'Marcar consulta',icon:'plus'}];

const iniciais = (nome) => nome.split(/\s+/).filter(Boolean).map((parte) => parte[0]).slice(0, 2).join('').toUpperCase();
// D10: admin é flag somada à categoria.
const descricaoDoUsuario = ({ tipo, categoria, isAdmin }) => tipo === 'CLIENTE' ? 'Paciente' : `${categoria === 'DENTISTA' ? 'Dentista' : 'Recepção'}${isAdmin ? ' · Admin' : ''}`;

function Profissional({ usuario, className }) {
  return <div className={`professional ${className}`}><div className="avatar avatar--small">{iniciais(usuario.nome)}</div><div><strong>{usuario.nome}</strong><small>{descricaoDoUsuario(usuario)}</small></div></div>;
}

function estaAtivo(link, pathname) {
  return link.exato ? pathname === link.to : pathname === link.to || pathname.startsWith(link.to + '/');
}

export default function AppShell({ children, title, wide = false }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { usuario, sair } = useSessao();
  const [busca, setBusca] = useState('');
  const daClinica = usuario.tipo === 'FUNCIONARIO';
  const links = !daClinica ? LINKS_DO_PACIENTE : ehAdmin(usuario) ? [...LINKS_DA_CLINICA, ...LINKS_DO_ADMIN] : LINKS_DA_CLINICA;
  const buscarPaciente = (evento) => { evento.preventDefault(); navigate('/pacientes?busca=' + encodeURIComponent(termoDeBusca(busca))); setBusca(''); };

  return (
    <div className="app-shell">
      {/* Com nome próprio: a página pode ter outro <aside>, e os dois landmarks precisam se distinguir (#2). */}
      <aside className="sidebar" aria-label="Menu lateral">
        <Brand compact/>
        <Profissional usuario={usuario} className="professional--mobile-hidden"/>
        <nav className="sidebar__nav" aria-label="Navegação principal">
          {links.map((link) => <NavLink key={link.label} to={link.to} end={link.exato} className={() => `nav-link ${estaAtivo(link, pathname) ? 'is-active' : ''}`}><Icon name={link.icon}/><span>{link.label}</span></NavLink>)}
        </nav>
        {daClinica && <button className="primary-btn sidebar__new" onClick={() => navigate('/agenda')}><Icon name="plus"/> Novo Agendamento</button>}
        <Profissional usuario={usuario} className="sidebar__footer"/>
        <button className="text-button sidebar__sair" onClick={sair}><Icon name="arrowLeft"/><span>Sair</span></button>
      </aside>
      <div className="shell-main">
        <header className="topbar">
          <button className="icon-button topbar__back" onClick={() => navigate(-1)} aria-label="Voltar"><Icon name="arrowLeft"/></button>
          <strong className="topbar__title">{title}</strong>
          <button type="button" className="text-button topbar__sair" onClick={sair}>Sair</button>
          {daClinica && (
            <div className="topbar__actions">
              <form className="search-box" role="search" onSubmit={buscarPaciente}><Icon name="search"/><input aria-label="Buscar pacientes" placeholder="Buscar pacientes..." value={busca} onChange={(e)=>setBusca(e.target.value)}/></form>
            </div>
          )}
        </header>
        <main className={`page-content ${wide ? 'page-content--wide' : ''}`}>{children}</main>
      </div>
    </div>
  );
}
