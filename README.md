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

Login, cadastro e recuperação de senha já falam com a API (D30): suba também o backend (abaixo).
O Vite encaminha `/api` para `http://localhost:3000`; se a `PORTA` do `backend/.env` for outra,
ajuste `vite.config.js`. Os códigos de SMS/e-mail simulados aparecem no log da API.

```bash
npm test   # testes do cliente HTTP (Vitest)
```

Para gerar a build de produção:

```bash
npm run build
```

### Backend (API)

Em construção em `backend/` (plano em `docs/plano-implementacao.md`). Precisa do Docker Desktop
aberto e de `backend/.env` criado a partir de `backend/.env.example` (o Postgres do Docker fica
na porta 5433). No PowerShell:

```powershell
cd backend
docker compose up -d   # Postgres 17
npm install            # dependências + client do Prisma
npm run db:migrate     # cria as tabelas no banco de desenvolvimento
npm run dev            # API em http://localhost:<PORTA>/api
npm test               # testes contra o banco dentagenda_test
```

Contrato das rotas em `docs/api.md`.

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
- [x] Integração com a API: autenticação (F1, D30)
- [ ] Integração com a API: pacientes (F2) e agenda/consultas (F3)
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
- `/minha-conta` (paciente logado, provisória)

## Próximos passos sugeridos

1. Definir e criar o backend (API de autenticação, agenda e consultas).
2. Implementar as rotas protegidas por perfil (dentista/recepção vs. cliente).
3. Construir a tela de Agenda com visualização por dia/semana/mês.
4. Construir o CRUD de consultas (criar, ver, editar, cancelar).
