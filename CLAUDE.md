# DentAgenda — contexto para o Claude Code

Sistema de organização de agendas e consultas odontológicas, em parceria com a
Colzani Odontologia (PAC VI — Engenharia de Software). Projeto acadêmico em grupo,
2 pessoas no backend.

## Estado real do projeto

Confira antes de assumir qualquer coisa:

- **Front-end: existe e funciona.** React 19 + Vite + react-router-dom, em `src/`.
  Todas as ações são simuladas — não há chamada de rede em lugar nenhum.
  É um exemplo básico e **será refeito** a partir dos requisitos e do backend; não
  trate o que ele faz hoje (ex.: login por e-mail) como requisito.
- **Backend: em construção** em `backend/`, seguindo `docs/plano-implementacao.md` tarefa por
  tarefa (checkboxes marcam o que está feito). Já existe: ambiente (Docker, TypeScript, Vitest,
  validação de env), `prisma/schema.prisma` com os modelos da D18/D19 e a migration `inicial`
  com exclusion constraints e CHECKs escritos à mão. **Ainda não há rota HTTP** (Express entra
  na Tarefa 4). Em caso de conflito entre código e documento, vale `docs/documentacao.md`.
- **Stack:** PostgreSQL 17 em Docker Compose (D6, D8), TypeScript 7 no Node 24 (D7), Prisma
  7.10 com driver adapter `pg` (client gerado em `backend/src/generated/`, fora do git), Zod 4,
  Vitest 5. A instalar nas próximas tarefas: Express, JWT curto + refresh em cookie httpOnly (D9).
  MySQL foi descartado — ver D6.
- **Framework HTTP:** Express + Zod, código por domínio (rota → controller → service →
  Prisma), testes Vitest + Supertest contra Postgres real (D17).
- **Figma** — usar a cópia com acesso de edição (o MCP do Figma exige edição até para ler):
  `https://www.figma.com/design/XdO0E1on8EG2S9pLl0zEov/dentagendaSistema--Copy-`
  (fileKey `XdO0E1on8EG2S9pLl0zEov`). Uma página (`0:1`) com 12 telas; escopo = as 8 primeiras
  da esquerda para a direita: Tela de Login `1:2156`, cadastro `13:2`, Recuperação de Senha
  `1:2`, Dashboard / Início `1:1549`, Perfil do Paciente `1:897`, Novo Agendamento `1:1704`,
  Detalhes da Consulta `1:1161`, Agenda de Consultas `1:1899`. O `get_metadata` da página
  inteira estoura o limite de tokens — consultar por tela. A cópia não acompanha mudanças no
  arquivo original.

## Comandos

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
npm run lint     # oxlint
```

Backend (PowerShell, na pasta `backend/`; Docker Desktop aberto; `backend/.env` criado a partir
de `.env.example` — o Postgres fica em `localhost:5433`, D26):

```powershell
cd backend
docker compose up -d     # Postgres 17 com os bancos dentagenda e dentagenda_test
npm install              # também gera o client do Prisma (postinstall)
npm run db:migrate       # aplica as migrations no banco de desenvolvimento
npm run lint; npm run typecheck; npm test   # testes aplicam as migrations no banco de teste
```

## Estrutura

```
src/
  components/   AppShell, AuthLayout, Brand, Icon
  pages/        Login, Cadastro, RecuperarSenha, Inicio, PerfilPaciente, Agenda
  index.css     Tokens de design
  styles.css    Estilos das páginas
  App.jsx       Rotas
  main.jsx      Entrada
backend/
  prisma/                schema.prisma e migrations (SQL à mão no fim da "inicial")
  prisma.config.ts       Config do Prisma 7 (lê backend/.env)
  src/config/            env.ts — valida as variáveis de ambiente
  src/compartilhado/     banco, erros-do-banco, relogio, datas (fuso de São Paulo), cpf, paginacao
  src/generated/         Client do Prisma, gerado (fora do git)
  testes/                Apoio aos testes: migrations, limpeza do banco, RelogioFixo
docs/
  plano-implementacao.md Plano do backend do MVP, tarefa por tarefa
  spec-backend-mvp.md    Spec aprovada do backend
  documentacao.md        Registro de decisões de arquitetura e modelagem (D1, D2, ...)
  pendencias-colzani.md  Perguntas que só a clínica responde
  api.md                 Contrato da API (rotas, entrada, saída, erros)
```

## Escopo do MVP do backend

Definido pelo README (seção "Próximos passos sugeridos"), que é o contrato do grupo:

1. API de autenticação
2. Rotas protegidas por perfil (dentista/recepção vs. cliente)
3. CRUD de consultas (criar, ver, editar, cancelar). "Editar" data/hora é cancelar +
   criar nova (D14); não existe update de horário na mesma consulta.

**Fora do MVP:** aba Documentos (upload de arquivo) e aba Financeiro. Continuam como
placeholder no front (`TabPlaceholder` em `PerfilPaciente.jsx`).

## Convenções de trabalho

- **Design antes de código.** Modelagem antes de migration, contrato de API antes de
  rota, camadas antes de detalhe.
- **Toda decisão de modelagem ou de contrato vai para `docs/documentacao.md`** antes
  de virar código — com o quê, por quê e a alternativa descartada. O projeto é em
  grupo; decisão não registrada é decisão que o outro dev não consegue contestar.
- **Backend em TDD, nomes em português** (D23): teste que falha antes do código; todo código de
  erro de `docs/api.md` tem pelo menos um teste.
- **Não invente campo sem justificativa.** Se não dá pra explicar por que a coluna
  existe e o que quebra sem ela, ela não entra no schema.
- **Cuidado com dado do protótipo.** Os valores em `Agenda.jsx` (tabela de preços,
  lista de horários) e em `PerfilPaciente.jsx` (paciente, histórico) são fictícios e
  hardcoded. Não são requisito — mas as **estruturas** que eles implicam são, e
  várias ainda não foram decididas. Veja `docs/documentacao.md`.

## Armadilhas conhecidas no front-end

Coisas que já cravaram decisão de modelagem sem ninguém ter decidido. Entre parênteses,
a decisão que agora vale no lugar:

- `Agenda.jsx` — `procedures` é um objeto com preço em string (`'180,00'`), hardcoded.
  (D11: `precoCentavos` inteiro + `duracaoMinutos`.)
- `Agenda.jsx` — `times` é uma lista fixa 08:00–15:00 com `11:30` e `12:00` `disabled`
  no código; não há noção de disponibilidade real. (D12: grade semanal + bloqueios.)
- `Agenda.jsx` — `confirm()` sempre confirma. Não há conflito, erro nem validação.
  (D6/D13: conflito recusado pelo banco.)
- `PerfilPaciente.jsx` — dentista é string livre (`'Dr. Silva'`, `'Dra. Ana Costa'`).
  (D10: `Funcionario` com categoria DENTISTA.)
- `PerfilPaciente.jsx` — status da consulta só tem `REALIZADA` e `CANCELADA`.
  (D13: falta `CONFIRMADA`.)
- `AppShell.jsx` — o profissional logado é `Dr. Silva` hardcoded; não existe conceito
  de papel/perfil em lugar nenhum do código. (D10.)
- `Cadastro.jsx` — cria conta com e-mail e senha apenas. (D1.1: login por CPF; D15:
  CPF já cadastrado ativa por SMS.)
