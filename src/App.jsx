import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Login from './pages/Login';
import Cadastro from './pages/Cadastro';
import RecuperarSenha from './pages/RecuperarSenha';
import Inicio from './pages/Inicio';
import PerfilPaciente from './pages/PerfilPaciente';
import Agenda from './pages/Agenda';
import AreaDoPaciente from './pages/AreaDoPaciente';
import SessaoProvider from './sessao/SessaoProvider';
import { RotaProtegida, RotaPublica } from './sessao/rotas';

const publica = (pagina) => <RotaPublica>{pagina}</RotaPublica>;
const daClinica = (pagina) => <RotaProtegida tipo="FUNCIONARIO">{pagina}</RotaProtegida>;
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
          <Route path="/pacientes" element={daClinica(<PerfilPaciente />)} />
          <Route path="/pacientes/:pacienteId" element={daClinica(<PerfilPaciente />)} />
          <Route path="/agenda" element={daClinica(<Agenda />)} />
          <Route path="/minha-conta" element={doPaciente(<AreaDoPaciente />)} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </SessaoProvider>
  );
}

export default App;
