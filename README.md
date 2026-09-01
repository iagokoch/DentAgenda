# DentAgenda — Web

Sistema para organização de agendas e consultas odontológicas, desenvolvido em
parceria com a Colzani Odontologia (PAC VI — Engenharia de Software).

## Stack

- React 19 + Vite
- React Router (navegação entre telas)
- CSS puro com tokens de design em `src/index.css`

## Como rodar

```bash
npm install
npm run dev
```

Acesse http://localhost:5173

Para gerar a build de produção:

```bash
npm run build
```

## Estrutura do projeto

```
src/
  components/   Ícones e componentes reutilizáveis
  pages/        Uma página por rota (Login, Agenda, Consultas, ...)
  styles/       CSS por página
  App.jsx       Definição das rotas
  main.jsx      Ponto de entrada
```

## Status — Etapa 1 do MVP (PAC VI)

- [x] Repositório criado e estruturado
- [x] Base da aplicação (Vite + React + rotas)
- [x] Tela de login (fiel ao protótipo Figma)
- [ ] Acesso por perfil (dentista/recepção x cliente)
- [ ] Cadastro/gestão de consultas
- [ ] Agenda (dia/semana/mês)
- [ ] Dados do atendimento (valores, dados do cliente, procedimento)
- [ ] Área do cliente
- [ ] Testes e validação

A tela de login está com autenticação simulada (`src/pages/Login.jsx`) —
o `handleSubmit` tem um `TODO` marcando onde entra a chamada real à API
quando o backend estiver definido.

A imagem do consultório no painel lateral do login está como um
placeholder em gradiente; basta trocar por uma foto real da clínica em
`src/styles/Login.css` (`.login-side__image`).

## Próximos passos sugeridos

1. Definir e criar o backend (API de autenticação, agenda e consultas).
2. Implementar as rotas protegidas por perfil (dentista/recepção vs. cliente).
3. Construir a tela de Agenda com visualização por dia/semana/mês.
4. Construir o CRUD de consultas (criar, ver, editar, cancelar).
