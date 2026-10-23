# DentAgenda — contexto para o Claude Code

Sistema de organização de agendas e consultas odontológicas, em parceria com a
Colzani Odontologia (PAC VI — Engenharia de Software). Projeto acadêmico em grupo,
2 pessoas no backend.

## Estado real do projeto

Confira antes de assumir qualquer coisa:

- **MVP completo, front e API ligados em todas as telas (2026-10-22).** Os quatro papéis usam o sistema só pelas telas;
  o roteiro de demonstração (`docs/roteiro-de-demonstracao.md`) foi percorrido no Edge contra a API real. Falta só o
  que depende da clínica (abaixo, "O que falta").
- **Front-end** em `src/` (React 19 + Vite + react-router-dom), visual das 8 telas do Figma:
  - **Autenticação (F1):** login com um campo "CPF ou e-mail" (com `@` vai para o login de funcionário, senão de
    paciente), cadastro e ativação em duas etapas (código por SMS, D15), recuperação de senha (6 dígitos), sessão
    restaurada pelo refresh ao recarregar.
  - **Clínica (F2, F3, D33):** Início, busca e cadastro de pacientes (cadastro só recepção), Perfil com dados, endereço,
    alertas, "Editar dados" e Histórico; Novo Agendamento (`/agenda`, remarca com `?remarcar=<id>`); Detalhes da
    consulta (cancelar, remarcar, realizar, observação com histórico).
  - **Paciente (D35):** `/minha-conta` (próximas e histórico; cancelar, com justificativa já obrigatória a menos de
    24 h) e `/minha-conta/agendar` (marcar), no mesmo `AppShell` com a navegação do paciente.
  - **Administração (D37):** `/admin/equipe` e `/admin/procedimentos` (só admin, `RotaProtegida permitir={ehAdmin}`) e
    `/disponibilidade` (grade: A edita, R e D leem; bloqueios: R de todos, em lote; D os próprios).
  - **Qualidade (D36, D39):** testes de tela com Testing Library + jsdom e API simulada no `fetch`; axe em 14 telas;
    relógio injetado (`useRelogio`); foco visível, foco preso nos modais, contraste de 4,5:1, fonte mínima de 12px;
    layout conferido em 400px (no celular o Sair fica no topo).
- **Backend** em `backend/`: as 43 rotas de `docs/api.md`, com teste contra Postgres real (628 testes). Seeds:
  `db:seed` (admin inicial) e `db:seed:dev` (procedimentos, Ana Costa, Carla Souza e o paciente de exemplo com uma
  consulta pendente de ontem — D41). Defesas: sessão conferida no banco em toda rota autenticada (D31), `helmet`, limite
  por IP em `/api/auth` sem contar o refresh e com `PROXY_CONFIAVEL` atrás de proxy (D32, D40), login/refresh/códigos
  seguros em pedidos simultâneos (D38). Swagger em `/api/docs`, só fora de produção (D34). Retenção:
  `npm run limpar:dados` (D40).
  - **Testes que protegem o contrato:** `npm run conferir:codigos` (todo código de erro do `api.md` em teste, D23);
    `src/e2e/ponta-a-ponta.test.ts` (o fluxo da clínica só com login real); `src/matriz-de-papeis.test.ts` (43 rotas ×
    anônimo, R, R-admin, D, C, conferida contra o `api.md` e `docs/matriz-de-papeis.md`); `auth.concorrencia.test.ts`
    (corridas, D38). O relógio dos testes volta ao instante inicial a cada teste; as suítes passam com
    `npm run test:embaralhado`.
  - Em caso de conflito entre código e documento, vale `docs/documentacao.md` (D1 a D41).
- **O que falta:** (1) enviador real de SMS e e-mail (issue #1; sem ele a API recusa `NODE_ENV=production`, D16), que
  depende do provedor escolhido com a Colzani; (2) respostas da clínica em `docs/pendencias-colzani.md`, entre elas o
  prazo de retenção (90 dias provisórios, D40) e se o paciente marca pelo sistema (D35); (3) conferência humana no
  navegador e no celular de verdade (README, "O que falta"). Fora do escopo por decisão: abas Documentos e Financeiro
  (continuam "em breve") e encaixe fora do passo (`janelasLivres`, D33).
- **Stack:** PostgreSQL 17 em Docker Compose (D6, D8), TypeScript 7 no Node 24 (D7), Prisma
  7.10 com driver adapter `pg` (client gerado em `backend/src/generated/`, fora do git), Zod 4,
  Express 5 + cookie-parser, swagger-ui-express (D34), pino 10 + pino-http, bcrypt 6, jsonwebtoken 9, Vitest 5 + Supertest.
  Front: Testing Library 16 + jsdom 30 (D36) e axe-core 4.14 (D39), só em devDependencies. MySQL foi descartado — ver D6.
- **Framework HTTP:** Express + Zod, código por domínio (rota → controller → service →
  Prisma), testes Vitest + Supertest contra Postgres real (D17).
- **Figma** — usar a cópia com acesso de edição (o MCP do Figma exige edição até para ler):
  `https://www.figma.com/design/XdO0E1on8EG2S9pLl0zEov/dentagendaSistema--Copy-`
  (fileKey `XdO0E1on8EG2S9pLl0zEov`). Uma página (`0:1`) com 12 telas; escopo = as 8 primeiras
  da esquerda para a direita: Tela de Login `1:2156`, cadastro `13:2`, Recuperação de Senha
  `1:2`, Dashboard / Início `1:1549`, Perfil do Paciente `1:897`, Novo Agendamento `1:1704`,
  Detalhes da Consulta `1:1161`, Agenda de Consultas `1:1899`. O `get_metadata` da página
  inteira estoura o limite de tokens — consultar por tela. A cópia não acompanha mudanças no
  arquivo original. As telas de paciente e de administração não estão no Figma (D35, D37).

## Comandos

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
npm run lint     # oxlint
npm test         # Vitest do front: funções puras, telas (Testing Library + jsdom, D36) e axe (D39)
npm run test:embaralhado   # mesma suíte em ordem aleatória (#7); existe também no backend
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
npm run db:seed; npm run db:seed:dev   # admin inicial; dados fictícios e paciente de exemplo (D41)
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
  src/modulos/…          pacientes, funcionarios, disponibilidade (grade, bloqueios, horários livres), consultas
  src/compartilhado/travas.ts, retencao.ts  Travas (FOR UPDATE, consultiva — D22.7, D38) e limpeza por prazo (D40)
  src/e2e/               Ponta a ponta da clínica; src/matriz-de-papeis.test.ts (#5)
  scripts/               conferir-codigos-de-erro.ts (D23) e limpar-dados-antigos.ts (D40)
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
  roteiro-de-demonstracao.md  A apresentação nos quatro papéis, só pelas telas (D41)
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

- **Figma × D39:** cores de texto escurecidas para 4,5:1 e fonte mínima de 12px; o Figma ainda tem as cores antigas.
- **Hora no front:** use `useRelogio().agora()`, nunca `new Date()` direto numa tela (#7); funções puras recebem o
  instante. Os testes de tela injetam o relógio pelo `renderizarTela` (`src/testes/tela.jsx`).
- **Botão:** todo `<button>` tem `onClick` ou `type="submit"` (`src/botoes.test.js`, #3).

Resolvidas na F3 (D33): preço e horários hardcoded da Agenda, `confirm()` que sempre confirmava, dentista e status
fixos do Perfil e números fictícios do Início; tudo vem da API, e as telas não têm mais faixa de protótipo.
Resolvidas na F2: link "Pacientes" fixo em `/pacientes/marcos-oliveira` (agora `/pacientes`, com busca) e Perfil do Paciente sem dado fictício.
Resolvidas na F1: login por e-mail (agora CPF ou e-mail), `Dr. Silva` fixo no `AppShell`
(agora o usuário logado), cadastro só com e-mail e senha (agora D15). Depois da F1: saudação e
data do Início com o usuário e o dia reais; painel do login com "DentAgenda" e a foto do Figma.
