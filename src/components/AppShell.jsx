import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useSessao } from '../sessao/sessao-contexto.js';
import Brand from './Brand';
import Icon from './Icon';
const links = [{to:'/inicio',label:'Início',icon:'home'},{to:'/agenda',label:'Agenda',icon:'calendar'},{to:'/pacientes/marcos-oliveira',label:'Pacientes',icon:'users'},{to:'/inicio#relatorios',label:'Relatórios',icon:'report'},{to:'/inicio#configuracoes',label:'Configurações',icon:'settings'}];

const iniciais = (nome) => nome.split(/\s+/).filter(Boolean).map((parte) => parte[0]).slice(0, 2).join('').toUpperCase();
// D10: admin é flag somada à categoria.
const descricaoDoFuncionario = ({ categoria, isAdmin }) => `${categoria === 'DENTISTA' ? 'Dentista' : 'Recepção'}${isAdmin ? ' · Admin' : ''}`;

function Profissional({ usuario, className }) {
  return <div className={`professional ${className}`}><div className="avatar avatar--small">{iniciais(usuario.nome)}</div><div><strong>{usuario.nome}</strong><small>{descricaoDoFuncionario(usuario)}</small></div></div>;
}

export default function AppShell({ children, title, wide = false }) {
  const navigate = useNavigate(); const { pathname } = useLocation(); const { usuario, sair } = useSessao();
  return <div className="app-shell"><aside className="sidebar"><Brand compact/><Profissional usuario={usuario} className="professional--mobile-hidden"/><nav className="sidebar__nav" aria-label="Navegação principal">{links.map(link => {const base=link.to.split('#')[0];const active=!link.to.includes('#')&&(pathname===base||(base==='/pacientes/marcos-oliveira'&&pathname.startsWith('/pacientes')));return <NavLink key={link.label} to={link.to} className={() => `nav-link ${active?'is-active':''}`}><Icon name={link.icon}/><span>{link.label}</span></NavLink>;})}</nav><button className="primary-btn sidebar__new" onClick={() => navigate('/agenda')}><Icon name="plus"/> Novo Agendamento</button><Profissional usuario={usuario} className="sidebar__footer"/><button className="text-button sidebar__sair" onClick={sair}><Icon name="arrowLeft"/><span>Sair</span></button></aside><section className="shell-main"><header className="topbar"><button className="icon-button topbar__back" onClick={() => navigate(-1)} aria-label="Voltar"><Icon name="arrowLeft"/></button><strong className="topbar__title">{title}</strong><div className="topbar__actions"><label className="search-box"><Icon name="search"/><input placeholder="Buscar pacientes..."/></label><button className="icon-button" aria-label="Notificações"><Icon name="bell"/></button><button className="icon-button" aria-label="Perfil"><Icon name="user"/></button></div></header><main className={`page-content ${wide ? 'page-content--wide' : ''}`}>{children}</main></section></div>;
}
