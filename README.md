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

## Status — Protótipo funcional (PAC VI)

- [x] Repositório criado e estruturado
- [x] Base da aplicação (Vite + React + rotas)
- [x] Login e cadastro
- [x] Recuperação de senha em etapas
- [x] Dashboard inicial
- [x] Perfil do paciente com abas e histórico
- [x] Novo agendamento com data, horário e procedimento
- [x] Layout responsivo para desktop, tablet e celular
- [ ] Integração com API e banco de dados
- [ ] Testes automatizados

As ações estão simuladas no frontend para apresentação do protótipo. A
confirmação do agendamento, o acesso e a recuperação de senha já demonstram o
fluxo completo, mas ainda precisam ser conectados aos endpoints do backend.

## Rotas disponíveis

- `/login`
- `/cadastro`
- `/recuperar-senha`
- `/inicio`
- `/pacientes/marcos-oliveira`
- `/agenda`

## Próximos passos sugeridos

1. Definir e criar o backend (API de autenticação, agenda e consultas).
2. Implementar as rotas protegidas por perfil (dentista/recepção vs. cliente).
3. Construir a tela de Agenda com visualização por dia/semana/mês.
4. Construir o CRUD de consultas (criar, ver, editar, cancelar).
