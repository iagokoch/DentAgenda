# DentAgenda — Web

Sistema para organização de agendas e consultas odontológicas, desenvolvido em
parceria com a Colzani Odontologia (PAC VI — Engenharia de Software).

## Estado atual (2026-10-22)

O fluxo principal da clínica funciona de ponta a ponta, do login à consulta realizada.
**O que falta está na seção "O que falta para finalizar" mais abaixo.**

- **Backend** (`backend/`): todas as 43 rotas de `docs/api.md` estão prontas e testadas contra
  Postgres real (381 testes, um deles o ponta a ponta da clínica): autenticação (11 rotas), pacientes, funcionários e dentistas,
  procedimentos, grade semanal, bloqueios, horários livres e consultas (9 rotas). Defesas de borda
  (D31, D32) e Swagger gerado dos schemas Zod, só fora de produção (D34).
- **Front-end** (`src/`): ligado à API (D30, D33). Login, cadastro, recuperação de senha, busca e cadastro de
  pacientes, Perfil do Paciente (com Histórico de consultas), Início, Novo Agendamento, remarcação e Detalhes da
  Consulta (cancelar, remarcar, realizar, observação com histórico). 57 testes.
- **Não conferido no navegador:** a fatia F3 (agenda e consultas) passou em testes, lint e build, mas ninguém percorreu o
  fluxo real com a clínica de teste montada. Faça isso primeiro (veja o passo 1 abaixo).

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
npm run db:seed          # admin inicial (variáveis no .env.example)
npm run db:seed:dev      # dados fictícios: 4 procedimentos, a dentista Ana Costa e a recepcionista Carla Souza (sem pacientes: cadastre pela tela)
npm run dev              # API em http://localhost:<PORTA>/api
```

Se o Postgres subir com credenciais diferentes das do `.env`, o erro é `P1000` e o volume do Docker precisa ser
recriado.

Os SMS e e-mails são simulados (D16): os códigos de verificação aparecem no log da API.

**Swagger** (só fora de produção): `http://localhost:<PORTA>/api/docs` e `/api/docs.json`.

### Front

Em outro terminal, na raiz do projeto:

```bash
npm install
npm run dev      # http://localhost:5173
```

O Vite encaminha `/api` para `http://localhost:3000`. Se a `PORTA` do `backend/.env` for
outra, ajuste `vite.config.js`. Sem esse proxy, o cookie de refresh não chega à API (D19).

### Contas para experimentar

As contas fictícias vêm do `db:seed:dev` (ex.: `carla.souza@exemplo.dev`, recepção). A senha não fica no repositório:
use "Esqueci minha senha" na tela de login e pegue o código de 6 dígitos no log da API.
O `db:seed:dev` já dá à Dra. Ana Costa uma grade de seg–sex (08:00–12:00 e 14:00–18:00). Outra dentista **precisa de
grade semanal** para ter horários livres, e a grade só se define pela API (`PUT /api/dentistas/{id}/grade`, só
admin; veja o Swagger). Roteiro completo para conferir no navegador: `docs/ponta-a-ponta.md`.

### Verificação

```bash
npm run lint; npm test; npm run build                                  # raiz (front)
cd backend; npm run lint; npm run typecheck; npm test; npm run conferir:codigos; npm run build   # backend
```

Os testes do backend aplicam as migrations no banco `dentagenda_test`.

## Estrutura do projeto

```
src/
  api/          Cliente HTTP (token em memória, refresh no 401, erros da API) e useDadosDaApi (estados da tela)
  sessao/       Sessão do usuário e rotas protegidas por tipo de usuário
  components/   AppShell, AuthLayout, Brand, Icon
  pages/        Uma página por rota
  agenda/       Calendário, horários, busca de paciente, cancelamento e observação das consultas
  pacientes/    Formatação, endereço, alertas, edição e histórico do paciente
  assets/       Imagens
  index.css     Tokens de design (importa styles.css, pacientes.css e agenda.css)
  App.jsx       Definição das rotas
backend/
  prisma/       Schema e migrations
  src/          App Express, utilitários compartilhados e módulos por domínio
  testes/       Apoio aos testes (banco de teste, fábricas, contexto)
docs/           Decisões, spec, plano, contrato da API e pendências com a clínica
```

## Rotas do front

| Rota                     | Quem acessa             | Situação                                  |
|--------------------------|-------------------------|-------------------------------------------|
| `/login`                 | Público                 | Ligada à API                              |
| `/cadastro`              | Público                 | Ligada à API                              |
| `/recuperar-senha`       | Público                 | Ligada à API                              |
| `/inicio`                | Funcionário da clínica  | Ligada à API                              |
| `/pacientes`             | Funcionário da clínica  | Ligada à API                              |
| `/pacientes/novo`        | Recepção                | Ligada à API                              |
| `/pacientes/:pacienteId` | Funcionário da clínica  | Ligada à API                              |
| `/agenda`                | Funcionário da clínica  | Ligada à API (`?pacienteId=` e `?remarcar=`) |
| `/consultas/:consultaId` | Funcionário da clínica  | Ligada à API                              |
| `/minha-conta`           | Paciente                | **Página provisória** (D30, em aberto)    |

## O que falta para finalizar

Ordem sugerida. Os números entre parênteses são as issues do GitHub (`iagokoch/DentAgenda`).

**Para fechar o MVP**

1. **Conferir a F3 no navegador** (15 min), seguindo `docs/ponta-a-ponta.md`. A API já passou pelo mesmo fluxo no
   teste `backend/src/e2e/ponta-a-ponta.test.ts`; falta ver as telas.
2. ~~Fechamento da Tarefa 23~~: feito. `npm run conferir:codigos` confere que todo código de erro do `api.md` tem teste (D23).
3. **Decidir a área do paciente** (`/minha-conta`, D30). Hoje é provisória. Ou se fazem as telas do paciente (ver as
   próprias consultas, cancelar com justificativa quando faltar menos de 24 h, marcar), ou se registra na D30 que ficou
   fora do MVP. A API já está pronta para o papel de paciente (C).
4. **Telas de administração** (3 a 4 h): funcionários, procedimentos, grade semanal e bloqueios existem só na API.
   Sem elas, qualquer demonstração depende de chamar a API na mão.
5. **README e apresentação**: manter este arquivo e o `CLAUDE.md` em dia a cada entrega.

**Para colocar em produção** (não trava a entrega acadêmica)

- **Enviador real de SMS e e-mail** (#1). Sem ele a API recusa subir com `NODE_ENV=production` (D16, D32). Depende de
  escolher o provedor com a Colzani.
- **`trust proxy`** no deploy, para o limite por IP funcionar atrás de proxy (D32).
- **Índices e retenção de dados** (#4): migration com os índices que faltam e rotina de limpeza (prazo a decidir).
- **Perguntas à clínica**: `docs/pendencias-colzani.md`.

**Qualidade**

- Acessibilidade (#2), botões sem ação no `AppShell` e no Início (#3), matriz de papéis por rota (#5), concorrência de
  login, refresh e cadastro (#6), relógio e mais testes do front (#7).
- Layout em celular (400px) nunca foi validado de verdade.

**Fora do escopo por decisão**: abas Documentos e Financeiro do Perfil do Paciente (continuam "em breve") e o encaixe
fora do passo para a recepção (`janelasLivres`, sem tela; D33).

## Regras do grupo

- **Design antes de código:** decisão de modelagem ou de contrato entra em `docs/documentacao.md` (próxima é a **D35**)
  antes de virar código.
- **Backend em TDD**, com nomes em português (D23). Biblioteca nova: conferir versão e API no context7 antes de usar.
- **Se o front precisar de algo que a API não dá**, vira decisão e mudança no `docs/api.md`, não gambiarra no front.
- Nunca commitar `backend/.env` nem segredos; o `.gitignore` já cobre.

## Documentação

- `docs/documentacao.md`: decisões de arquitetura e modelagem (D1 a D34). Em conflito com o
  código, vale este documento.
- `docs/api.md`: contrato da API (rotas, entrada, saída, erros).
- `docs/spec-backend-mvp.md`: visão geral do backend do MVP.
- `docs/plano-implementacao.md`: plano tarefa por tarefa, com o progresso nos checkboxes (só a Tarefa 23 tem passos abertos).
- `docs/pendencias-colzani.md`: perguntas que só a clínica responde.
- `CLAUDE.md`: contexto para o Claude Code (estado real, comandos, armadilhas).
