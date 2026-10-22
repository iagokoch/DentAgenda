# DentAgenda — contexto para o Claude Code

Sistema de organização de agendas e consultas odontológicas, em parceria com a
Colzani Odontologia (PAC VI — Engenharia de Software). Projeto acadêmico em grupo,
2 pessoas no backend.

## Estado real do projeto

Confira antes de assumir qualquer coisa:

- **Front-end: existe e está sendo ligado à API em fatias (D30).** React 19 + Vite +
  react-router-dom, em `src/`. **Ligado à API (F1):** login (um campo "CPF ou e-mail": com `@` vai
  para o login de funcionário, senão de paciente), cadastro em duas etapas (código por SMS, D15),
  recuperação de senha (6 dígitos, paciente e funcionário), sessão restaurada pelo refresh ao
  recarregar, rotas protegidas (funcionário → telas da clínica; paciente → `/minha-conta`), `AppShell` com o usuário real e Sair. **Ligado à API (F2):** busca e
  cadastro de pacientes (`/pacientes`, `/pacientes/novo`), Perfil do Paciente com dados, endereço e alertas
  reais e painel "Editar dados" (só recepção).
  **Ligado à API (F3, D33):** Início real, Novo Agendamento (`/agenda`, também remarca com `?remarcar=<id>`), Detalhes da
  consulta (`/consultas/:id`: cancelar, remarcar, realizar, observação com histórico) e Histórico no perfil do paciente.
  **Área do paciente (D35):** `/minha-conta` (próximas e histórico, cancelar; justificativa já obrigatória a menos de
  24 h) e `/minha-conta/agendar` (marcar), no mesmo `AppShell` com a navegação do paciente.
  **Administração (D37):** `/admin/equipe` e `/admin/procedimentos` (só admin; `RotaProtegida permitir={ehAdmin}`) e
  `/disponibilidade` (grade: A edita, R e D leem; bloqueios: R de todos, em lote; D os próprios).
- **Backend: pronto para o MVP** em `backend/`, seguindo `docs/plano-implementacao.md` (Tarefas 0 a 23 feitas,
  plano fechado). As 43 rotas de `docs/api.md` existem e têm teste contra Postgres real (627 testes): `auth` (11),
  pacientes (com endereço e alertas), funcionários e `GET /api/dentistas`, procedimentos, grade semanal, bloqueios,
  horários livres e dias disponíveis, e as 9 rotas de `/api/consultas`. Seeds: `db:seed` (admin inicial) e `db:seed:dev`
  (dados fictícios). Defesas de borda (D31, D32): sessão conferida no banco em toda rota autenticada, `helmet` e limite
  por IP em `/api/auth` (sem contar o refresh; IP real atrás de proxy com `PROXY_CONFIAVEL`, D40). Retenção:
  `npm run limpar:dados` apaga o que passou de `RETENCAO_DIAS` (90 provisórios, D40). Swagger (Tarefa 22, D34): `/api/docs` e `/api/docs.json`, só fora de produção; cada
  `*.rotas.ts` exporta `rotasDocumentadas<Dominio>` e `src/modulos-documentados.ts` as liga aos routers.
  `npm run conferir:codigos` falha se algum código de erro do `api.md` não aparecer em teste (D23); o fluxo da clínica
  inteiro, só com login real, está em `src/e2e/ponta-a-ponta.test.ts` (roteiro manual em `docs/ponta-a-ponta.md`).
  `src/matriz-de-papeis.test.ts` chama as 43 rotas com cada papel e confere contra o `api.md` e `docs/matriz-de-papeis.md`
  (#5); `auth.concorrencia.test.ts` fixa as corridas de login, refresh e códigos (D38). O relógio dos testes volta ao
  instante inicial a cada teste; as suítes passam com `npm run test:embaralhado`.
  Em caso de conflito entre código e documento, vale `docs/documentacao.md`.
- **O que falta (ordem sugerida; detalhes no README):** (1) conferir a F3 no navegador (`docs/ponta-a-ponta.md`);
  (2) ~~Tarefa 23~~ feita; (3) ~~área do paciente~~ feita (D35); (4) ~~telas de administração~~ feitas (D37); (5) para produção: só
  o enviador real de SMS e e-mail (issue #1) e o prazo de retenção com a Colzani; `trust proxy`, índices e retenção (#4)
  feitos (D40). Issues #2 a #7 resolvidas nos Blocos 4 e 5 (D38–D40).
- **Stack:** PostgreSQL 17 em Docker Compose (D6, D8), TypeScript 7 no Node 24 (D7), Prisma
  7.10 com driver adapter `pg` (client gerado em `backend/src/generated/`, fora do git), Zod 4,
  Express 5 + cookie-parser, swagger-ui-express (D34), pino 10 + pino-http, bcrypt 6, jsonwebtoken 9, Vitest 5 + Supertest.
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
npm test         # Vitest do front: funções puras, telas (Testing Library + jsdom, D36) e axe (D39)
```

Front + API juntos: suba a API (`backend`, `npm run dev`) e o front (`npm run dev` na raiz); o
Vite encaminha `/api` para `http://localhost:3000` (`PORTA` de `backend/.env`), senão o cookie de
refresh não chega (D19). Os SMS e e-mails simulados (com os códigos) saem no log da API (D16).

Backend (PowerShell, na pasta `backend/`; Docker Desktop aberto; `backend/.env` criado a partir
de `.env.example` — o Postgres fica em `localhost:5433`, D26):

```powershell
cd backend
docker compose up -d     # Postgres 17 com os bancos dentagenda e dentagenda_test
npm install              # também gera o client do Prisma (postinstall)
npm run db:migrate       # aplica as migrations no banco de desenvolvimento
npm run lint; npm run typecheck; npm test   # testes aplicam as migrations no banco de teste
npm run conferir:codigos # todo código de erro do docs/api.md tem teste (D23)
npm run limpar:dados     # retenção (D40): agendar uma vez por dia no servidor
npm run dev              # API em http://localhost:<PORTA do .env>/api
```

## Estrutura

```
src/
  api/          cliente-http (token em memória, refresh no 401, ErroDaApi), api.js (instância
                única), mensagens.js (texto dos erros de entrada)
  sessao/       SessaoProvider (restaura pelo refresh), sessao-contexto.js (useSessao),
                rotas.jsx (RotaProtegida/RotaPublica)
  components/   AppShell (menu por papel), AuthLayout, Brand, Gaveta (painel lateral), Icon
  assets/       consultorio.png (foto do painel do login)
  pages/        Login, Cadastro, RecuperarSenha, Inicio, Pacientes, NovoPaciente, PerfilPaciente, Agenda,
                DetalhesDaConsulta, Disponibilidade, admin/Equipe e admin/Procedimentos (D37), MinhasConsultas e
                MarcarConsulta (paciente, D35); *.test.jsx = testes de tela
  agenda/       calendario (puro, com testes), status, useEscolhaDeHorario (mês/dia/horário e vagas), CalendarioDeDias,
                Horarios, PacienteDaConsulta, DialogoDeCancelamento, ObservacaoDaConsulta
  minha-conta/  consultas-do-paciente (puro: próximas, histórico, regra das 24 h)
  admin/        formatos (puro: preço em reais, fuso da clínica, grade por dia, diff do PATCH), GavetaDeFuncionario,
                GavetaDeProcedimento
  disponibilidade/ GradeSemanal (A edita; R e D leem), Bloqueios (R em lote; D os próprios)
  testes/       tela.jsx: API simulada no fetch, sessão, rotas e relógio fixo para os testes de tela (D36, D39)
  relogio.js    useRelogio(): toda tela lê "agora" daqui; os testes injetam um relógio fixo (#7)
  acessibilidade.test.jsx, botoes.test.js  axe nas telas (#2) e nenhum botão sem ação (#3)
  pacientes/    formatar, endereco (puros, com testes), Alertas, EditarPaciente, CampoDeEndereco, HistoricoDoPaciente
  index.css     Tokens de design; importa styles, pacientes, agenda, admin, celular (400px) e acessibilidade (foco)
  styles.css    Estilos das páginas
  App.jsx       Rotas
  main.jsx      Entrada
backend/
  prisma/                schema.prisma e migrations (SQL à mão no fim da "inicial")
  prisma.config.ts       Config do Prisma 7 (lê backend/.env)
  src/config/            env.ts — valida as variáveis de ambiente
  src/app.ts, server.ts  App Express sem porta (testes) e subida do servidor
  src/compartilhado/     contexto, erros, middleware-de-erro, validacao, logger, mensageria,
                         senhas (bcrypt), tokens (JWT e refresh), autenticacao (papéis R/D/A/C),
                         banco, erros-do-banco, relogio, datas (fuso de São Paulo), cpf, paginacao
  src/modulos/auth/      Login, sessões (refresh em cookie), bloqueio de login, códigos, recuperação e autocadastro
  src/modulos/procedimentos/  Listar (cliente só ativos), criar e editar (admin)
  src/modulos-documentados.ts Liga cada router ao que o Swagger mostra dele (D34)
  src/generated/         Client do Prisma, gerado (fora do git)
  testes/                Apoio aos testes: migrations, limpeza do banco, contexto com relógio
                         fixo e enviador em memória, fábricas (paciente, funcionário, token)
docs/
  plano-implementacao.md Plano do backend do MVP, tarefa por tarefa
  spec-backend-mvp.md    Spec aprovada do backend
  documentacao.md        Registro de decisões de arquitetura e modelagem (D1, D2, ...)
  pendencias-colzani.md  Perguntas que só a clínica responde
  api.md                 Contrato da API (rotas, entrada, saída, erros)
  matriz-de-papeis.md    Rota × papel com o status esperado (testado contra o api.md e o código)
  ponta-a-ponta.md       Roteiro manual do fluxo da clínica (o mesmo do teste e2e)
  acessibilidade.md      Como conferir acessibilidade e 400px no navegador, e a última conferência
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

## Armadilhas conhecidas no front-end

Coisas que já cravaram decisão de modelagem sem ninguém ter decidido. Entre parênteses,
a decisão que agora vale no lugar:

- **Figma × decisões (F1):** as telas de login, cadastro e recuperação do Figma pedem e-mail e
  código de 4 dígitos. Valem as decisões: paciente entra por CPF (D1.1), cadastro pede CPF,
  telefone, código, nome e senha (D15), código tem 6 dígitos (D19). O visual do Figma foi mantido.

Resolvidas na F3 (D33): preço e horários hardcoded da Agenda, `confirm()` que sempre confirmava, dentista e status
fixos do Perfil e números fictícios do Início; tudo vem da API, e as telas não têm mais faixa de protótipo.
Resolvidas na F2: link "Pacientes" fixo em `/pacientes/marcos-oliveira` (agora `/pacientes`, com busca) e Perfil do Paciente sem dado fictício.
Resolvidas na F1: login por e-mail (agora CPF ou e-mail), `Dr. Silva` fixo no `AppShell`
(agora o usuário logado), cadastro só com e-mail e senha (agora D15). Depois da F1: saudação e
data do Início com o usuário e o dia reais; painel do login com "DentAgenda" e a foto do Figma.
