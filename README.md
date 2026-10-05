# DentAgenda — Web

Sistema para organização de agendas e consultas odontológicas, desenvolvido em
parceria com a Colzani Odontologia (PAC VI — Engenharia de Software).

## Estado atual

- **Front-end** (`src/`): login, cadastro, recuperação de senha e sessão já usam a API (fatia F1,
  D30). Início, Agenda e Perfil do Paciente ainda mostram dados fictícios e serão ligados à API
  nas fatias F2 (pacientes) e F3 (agenda e consultas).
- **Backend** (`backend/`): em construção, tarefa por tarefa, seguindo
  `docs/plano-implementacao.md`. Prontas: as 11 rotas de autenticação e as de procedimentos.
  Próximo: funcionários, dentistas e seeds (Tarefa 11).

## Stack

- **Front:** React 19 + Vite, React Router, CSS puro com tokens de design em `src/index.css`.
- **Backend:** Node 24 + TypeScript, Express 5, Zod 4, Prisma 7 e PostgreSQL 17 (Docker Compose).
- **Testes:** Vitest (front e backend) + Supertest contra um Postgres real.

## Como rodar

### Backend (API)

Precisa do Docker Desktop aberto e de `backend/.env`, criado a partir de `backend/.env.example`.
O Postgres do Docker fica na porta 5433 do host (D26). No PowerShell:

```powershell
cd backend
docker compose up -d     # Postgres 17 com os bancos dentagenda e dentagenda_test
npm install              # dependências + client do Prisma
npm run db:migrate       # cria as tabelas no banco de desenvolvimento
npm run dev              # API em http://localhost:<PORTA>/api
```

Os SMS e e-mails são simulados (D16): os códigos de verificação aparecem no log da API.

### Front

Em outro terminal, na raiz do projeto:

```bash
npm install
npm run dev      # http://localhost:5173
```

O Vite encaminha `/api` para `http://localhost:3000`. Se a `PORTA` do `backend/.env` for
outra, ajuste `vite.config.js`. Sem esse proxy, o cookie de refresh não chega à API (D19).

### Verificação

```bash
npm run lint; npm test; npm run build                     # raiz (front)
cd backend; npm run lint; npm run typecheck; npm test     # backend
```

Os testes do backend aplicam as migrations no banco `dentagenda_test`.

## Estrutura do projeto

```
src/
  api/          Cliente HTTP (token em memória, refresh no 401, erros da API)
  sessao/       Sessão do usuário e rotas protegidas por tipo de usuário
  components/   AppShell, AuthLayout, Brand, Icon
  pages/        Uma página por rota
  assets/       Imagens
  index.css     Tokens de design
  styles.css    Estilos das páginas
  App.jsx       Definição das rotas
backend/
  prisma/       Schema e migrations
  src/          App Express, utilitários compartilhados e módulos por domínio
  testes/       Apoio aos testes (banco de teste, fábricas, contexto)
docs/           Decisões, spec, plano e contrato da API
```

## Rotas do front

| Rota                     | Quem acessa             | Situação          |
|--------------------------|-------------------------|-------------------|
| `/login`                 | Público                 | Ligada à API      |
| `/cadastro`              | Público                 | Ligada à API      |
| `/recuperar-senha`       | Público                 | Ligada à API      |
| `/inicio`                | Funcionário da clínica  | Dados fictícios   |
| `/pacientes`             | Funcionário da clínica  | Dados fictícios   |
| `/pacientes/:pacienteId` | Funcionário da clínica  | Dados fictícios   |
| `/agenda`                | Funcionário da clínica  | Dados fictícios   |
| `/minha-conta`           | Paciente                | Página provisória |

## Status

- [x] Protótipo navegável das 8 telas do Figma, responsivo
- [x] Backend: ambiente, banco com as restrições de horário, autenticação e procedimentos
- [x] Front ligado à API: autenticação (F1)
- [x] Testes automatizados (backend e cliente HTTP do front)
- [ ] Backend: funcionários, pacientes, grade, bloqueios e consultas (Tarefas 11–23)
- [ ] Front ligado à API: pacientes (F2) e agenda/consultas (F3)

## Próximos passos sugeridos

Escopo do MVP, combinado pelo grupo:

1. Definir e criar o backend (API de autenticação, agenda e consultas).
   *Autenticação pronta; agenda e consultas em andamento.*
2. Implementar as rotas protegidas por perfil (dentista/recepção vs. cliente).
   *Middleware de papéis pronto (D10); aplicado em cada rota nova.*
3. Construir a tela de Agenda com visualização por dia/semana/mês.
   *Fatia F3 do front.*
4. Construir o CRUD de consultas (criar, ver, editar, cancelar).
   *Tarefas 18–21 do plano.*

## Documentação

- `docs/documentacao.md`: decisões de arquitetura e modelagem (D1, D2, ...). Em conflito com o
  código, vale este documento.
- `docs/api.md`: contrato da API (rotas, entrada, saída, erros).
- `docs/spec-backend-mvp.md`: visão geral do backend do MVP.
- `docs/plano-implementacao.md`: plano tarefa por tarefa, com o progresso nos checkboxes.
- `docs/pendencias-colzani.md`: perguntas que só a clínica responde.
