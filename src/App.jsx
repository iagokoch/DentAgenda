import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        {/* Próximas rotas do MVP: /agenda, /consultas, /cadastro, /area-do-cliente */}
      </Routes>
    </BrowserRouter>
  );
}

export default App;
