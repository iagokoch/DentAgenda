import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Login from './pages/Login';
import Cadastro from './pages/Cadastro';
import RecuperarSenha from './pages/RecuperarSenha';
import Inicio from './pages/Inicio';
import PerfilPaciente from './pages/PerfilPaciente';
import Agenda from './pages/Agenda';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/cadastro" element={<Cadastro />} />
        <Route path="/recuperar-senha" element={<RecuperarSenha />} />
        <Route path="/inicio" element={<Inicio />} />
        <Route path="/pacientes" element={<PerfilPaciente />} />
        <Route path="/pacientes/:pacienteId" element={<PerfilPaciente />} />
        <Route path="/agenda" element={<Agenda />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
