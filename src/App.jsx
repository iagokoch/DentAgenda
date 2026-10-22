import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Login from './pages/Login';
import Cadastro from './pages/Cadastro';
import RecuperarSenha from './pages/RecuperarSenha';
import Inicio from './pages/Inicio';
import Pacientes from './pages/Pacientes';
import NovoPaciente from './pages/NovoPaciente';
import PerfilPaciente from './pages/PerfilPaciente';
import Agenda from './pages/Agenda';
import DetalhesDaConsulta from './pages/DetalhesDaConsulta';
import MinhasConsultas from './pages/MinhasConsultas';
import MarcarConsulta from './pages/MarcarConsulta';
import Disponibilidade from './pages/Disponibilidade';
import Equipe from './pages/admin/Equipe';
import Procedimentos from './pages/admin/Procedimentos';
import SessaoProvider from './sessao/SessaoProvider';
import { RotaProtegida, RotaPublica } from './sessao/rotas';
import { ehAdmin } from './sessao/sessao-contexto.js';

const publica = (pagina) => <RotaPublica>{pagina}</RotaPublica>;
const daClinica = (pagina) => <RotaProtegida tipo="FUNCIONARIO">{pagina}</RotaProtegida>;
// D37: só admin (A); quem não é volta para o Início.
const doAdmin = (pagina) => <RotaProtegida tipo="FUNCIONARIO" permitir={ehAdmin}>{pagina}</RotaProtegida>;
const doPaciente = (pagina) => <RotaProtegida tipo="CLIENTE">{pagina}</RotaProtegida>;

function App() {
  return (
    <SessaoProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={publica(<Login />)} />
          <Route path="/cadastro" element={publica(<Cadastro />)} />
          <Route path="/recuperar-senha" element={publica(<RecuperarSenha />)} />
          <Route path="/inicio" element={daClinica(<Inicio />)} />
          <Route path="/pacientes" element={daClinica(<Pacientes />)} />
          <Route path="/pacientes/novo" element={daClinica(<NovoPaciente />)} />
          <Route path="/pacientes/:pacienteId" element={daClinica(<PerfilPaciente />)} />
          <Route path="/agenda" element={daClinica(<Agenda />)} />
          <Route path="/consultas/:consultaId" element={daClinica(<DetalhesDaConsulta />)} />
          <Route path="/disponibilidade" element={daClinica(<Disponibilidade />)} />
          <Route path="/admin/equipe" element={doAdmin(<Equipe />)} />
          <Route path="/admin/procedimentos" element={doAdmin(<Procedimentos />)} />
          <Route path="/minha-conta" element={doPaciente(<MinhasConsultas />)} />
          <Route path="/minha-conta/agendar" element={doPaciente(<MarcarConsulta />)} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </SessaoProvider>
  );
}

export default App;
