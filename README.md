# DentAgenda — Web

Sistema para organização de agendas e consultas odontológicas, desenvolvido em
parceria com a Colzani Odontologia (PAC VI — Engenharia de Software).

## Estado atual (2026-10-22)

**O MVP está completo**: recepção, dentista, admin e paciente usam o sistema só pelas telas, do cadastro à consulta
realizada. O roteiro de demonstração (`docs/roteiro-de-demonstracao.md`) foi percorrido no navegador contra a API real.
O que falta depende da clínica (veja "O que falta").

- **Backend** (`backend/`): as 43 rotas de `docs/api.md`, com 628 testes contra Postgres real, entre eles o ponta a ponta
  da clínica, a matriz rota × papel e os pedidos simultâneos de login, refresh e códigos.
- **Front-end** (`src/`): todas as telas ligadas à API, com 175 testes (funções, telas e acessibilidade com axe).
  Conferido em 400px.

## Stack

- **Front:** React 19 + Vite, React Router, CSS puro com tokens de design em `src/index.css`.
- **Backend:** Node 24 + TypeScript, Express 5, Zod 4, Prisma 7 e PostgreSQL 17 (Docker Compose).
- **Testes:** Vitest no front (Testing Library + jsdom, axe-core) e no backend (Supertest contra um Postgres real).

## Como rodar

### Backend (API)

Precisa do Docker Desktop aberto e de `backend/.env`, criado a partir de `backend/.env.example` (o arquivo explica cada
variável). O Postgres do Docker fica na porta 5433 do host (D26). No PowerShell:

```powershell
cd backend
docker compose up -d     # Postgres 17 com os bancos dentagenda e dentagenda_test
npm install              # dependências + client do Prisma
npm run db:migrate       # cria as tabelas no banco de desenvolvimento
npm run db:seed          # admin inicial (ADMIN_INICIAL_* do .env)
npm run db:seed:dev      # dados fictícios: procedimentos, Dra. Ana Costa, Carla Souza e o paciente de exemplo (D41)
npm run dev              # API em http://localhost:<PORTA>/api
```

Se o Postgres subir com credenciais diferentes das do `.env`, o erro é `P1000` e o volume do Docker precisa ser
recriado. **Swagger** (só fora de produção): `http://localhost:<PORTA>/api/docs`.

Os SMS e e-mails são simulados (D16): os códigos de verificação aparecem no terminal da API.

### Front

Em outro terminal, na raiz do projeto:

```bash
npm install
npm run dev      # http://localhost:5173
```

O Vite encaminha `/api` para `http://localhost:3000`. Se a `PORTA` do `backend/.env` for outra, ajuste
`vite.config.js`. Sem esse proxy, o cookie de refresh não chega à API (D19).

### Contas para experimentar

| Conta | Papel | Como entrar |
|-------|-------|-------------|
| `ADMIN_INICIAL_EMAIL` do `.env` | Admin (e a categoria escolhida no `.env`) | "Esqueci minha senha"; o código sai no terminal da API |
| `carla.souza@exemplo.dev` | Recepção | idem |
| `ana.costa@exemplo.dev` | Dentista (grade seg–sex, 08–12 e 14–18) | idem |
| CPF `123.456.789-09` (Marcos Oliveira, exemplo) | Paciente sem login | "Cadastre-se": o código vai para o celular que a clínica tem (D15) |

Nenhuma senha fica no repositório.

## Papéis

Quem faz o quê; a tabela completa, rota por rota, está em `docs/matriz-de-papeis.md` (D10).

| Papel | Faz |
|-------|-----|
| **Recepção** (R) | Cadastra e edita pacientes, marca, remarca e cancela consultas de qualquer dentista, bloqueia agendas (feriado em lote) |
| **Dentista** (D) | Vê a própria agenda, registra observação, marca consulta como realizada, bloqueia a própria agenda |
| **Admin** (A) | Soma-se à categoria (recepção ou dentista): cadastra funcionários e procedimentos e define a grade semanal |
| **Paciente** (C) | Vê, marca e cancela as próprias consultas (cancelar a menos de 24 h pede justificativa) |

A tela só esconde o que o papel não abre; quem garante é a API.

## Testes e verificação

```bash
npm run lint; npm test; npm run build                                  # raiz (front)
npm run test:embaralhado                                               # mesma suíte em ordem aleatória (raiz e backend)
cd backend; npm run lint; npm run typecheck; npm test; npm run conferir:codigos; npm run build   # backend
```

- Os testes do backend aplicam as migrations no banco `dentagenda_test` e limpam o banco antes de cada arquivo.
- `npm run conferir:codigos` falha se algum código de erro do `api.md` não aparecer em teste (D23).
- No navegador: `docs/ponta-a-ponta.md` (fluxo da clínica) e `docs/acessibilidade.md` (axe, teclado e 400px).

## Demonstração

`docs/roteiro-de-demonstracao.md`: 10 a 15 minutos, os quatro papéis, só pelas telas (inclusive o conflito de horário
com duas abas e a ativação da conta do paciente). Rode o `db:seed:dev` no dia: ele cria a consulta "de ontem" que a
dentista marca como realizada.

## Estrutura do projeto

```
src/
  api/              Cliente HTTP (token em memória, refresh no 401, erros da API) e useDadosDaApi
  sessao/           Sessão do usuário e rotas protegidas por tipo e papel
  components/       AppShell (menu por papel), AuthLayout, Brand, Gaveta, Icon, useFocoPreso
  pages/            Uma página por rota (admin/ para Equipe e Procedimentos); *.test.jsx = testes de tela
  agenda/           Calendário, horários, cancelamento, observação e a escolha de horário compartilhada
  pacientes/        Formatação, endereço, alertas, edição e histórico do paciente
  minha-conta/      Regras da área do paciente
  admin/            Formatos (preço, fuso, grade) e gavetas de funcionário e procedimento
  disponibilidade/  Grade semanal e bloqueios
  testes/           Apoio aos testes de tela (API simulada, sessão, relógio fixo)
  relogio.js        Relógio injetável das telas
  index.css         Tokens de design; importa os estilos das telas, celular.css e acessibilidade.css
  App.jsx           Rotas
backend/
  prisma/           Schema, migrations e seeds
  scripts/          conferir-codigos-de-erro.ts e limpar-dados-antigos.ts
  src/              App Express, utilitários compartilhados, módulos por domínio e o ponta a ponta (e2e/)
  testes/           Apoio aos testes (banco de teste, fábricas, contexto com relógio fixo)
docs/               Decisões, contrato da API, matriz de papéis, roteiros e pendências com a clínica
```

## Rotas do front

| Rota                     | Quem acessa             | O que faz                                              |
|--------------------------|-------------------------|--------------------------------------------------------|
| `/login`                 | Público                 | Entrar com CPF (paciente) ou e-mail (clínica)          |
| `/cadastro`              | Público                 | Autocadastro e ativação da conta do paciente (D15)     |
| `/recuperar-senha`       | Público                 | Código de 6 dígitos e senha nova                       |
| `/inicio`                | Funcionário             | Consultas de hoje, pendentes de registro, atalhos      |
| `/pacientes`             | Funcionário             | Busca por nome ou CPF                                  |
| `/pacientes/novo`        | Recepção                | Cadastro de paciente                                   |
| `/pacientes/:pacienteId` | Funcionário             | Perfil: dados, endereço, alertas, histórico            |
| `/agenda`                | Funcionário             | Novo agendamento (`?pacienteId=`) e remarcação (`?remarcar=`) |
| `/consultas/:consultaId` | Funcionário             | Cancelar, remarcar, realizar, observação               |
| `/disponibilidade`       | Funcionário             | Grade (só admin edita) e bloqueios (D37)               |
| `/admin/equipe`          | Admin                   | Funcionários (D37)                                     |
| `/admin/procedimentos`   | Admin                   | Procedimentos (D37)                                    |
| `/minha-conta`           | Paciente                | Próximas consultas e histórico, cancelar (D35)         |
| `/minha-conta/agendar`   | Paciente                | Marcar consulta (D35)                                  |

## Decisões

Todas em `docs/documentacao.md` (D1 a D41), com o quê, por quê e a alternativa descartada; em conflito com o código, vale
o documento. As mais recentes:

| # | Decisão |
|---|---------|
| D35 | Área do paciente (ver, cancelar e marcar as próprias consultas) |
| D36 | Testes de tela com Testing Library + jsdom |
| D37 | Telas de administração e disponibilidade |
| D38 | Login, refresh e códigos seguros em pedidos simultâneos (trava por conta; janela de 10 s no refresh) |
| D39 | Acessibilidade (axe, contraste, foco, teclado), botões sem ação, matriz de papéis, relógio injetável, layout em 400px |
| D40 | Produção: `PROXY_CONFIAVEL`, refresh fora do limite por IP, índices, RESTRICT e retenção de dados |
| D41 | Roteiro de demonstração e paciente de exemplo no `db:seed:dev` |

## O que falta

**Depende da Colzani** (`docs/pendencias-colzani.md`):

- **Enviador real de SMS e e-mail** (#1). Sem ele a API recusa subir com `NODE_ENV=production` (D16). Depende de escolher
  o provedor e de quem paga.
- **Prazo de retenção** dos dados de acesso (90 dias provisórios, D40), se o paciente vai mesmo marcar pelo sistema
  (D35), preços e durações reais dos procedimentos, horários dos dentistas e as demais perguntas do arquivo.

**Conferência humana** (o que os testes e o percurso automatizado no navegador não substituem):

- Percorrer `docs/roteiro-de-demonstracao.md` com alguém da clínica e anotar o resultado em `docs/ponta-a-ponta.md`.
- Usar num celular de verdade (não só o modo dispositivo do navegador) e com leitor de tela (NVDA ou TalkBack).
- O teclado foi testado em partes (abas, popup e gaveta); falta uma passada completa só com teclado.

**Fora do escopo por decisão**: abas Documentos e Financeiro do Perfil do Paciente (continuam "em breve") e o encaixe
fora do passo para a recepção (`janelasLivres`, sem tela; D33).

## Produção (D40)

O que configurar no servidor, além do que o `backend/.env.example` lista. A API continua recusando subir com
`NODE_ENV=production` enquanto o enviador real de SMS e e-mail (#1) não existir.

- **Proxy na frente da API** (Nginx, balanceador da hospedagem): defina `PROXY_CONFIAVEL` com o número de proxies na
  frente (`1` no caso comum) ou a lista de IPs/sub-redes deles (`10.0.0.0/8,loopback`). Sem isso, todo pedido chega com o
  IP do proxy e o limite de 200 pedidos por 15 min em `/api/auth` (D32) vale para todos os usuários somados. Nunca use
  `true`: o servidor recusa subir, porque qualquer cliente poderia forjar o próprio IP. O refresh da sessão não conta
  para esse limite (cada carregamento de página faz um).
- **Banco:** no servidor, `npx prisma migrate deploy` aplica as migrations (inclusive os índices da D40).
- **Retenção de dados (LGPD):** `npm run limpar:dados` (pasta `backend`) apaga tentativas de login, códigos de
  verificação e sessões vencidas ou revogadas com mais de `RETENCAO_DIAS` dias (padrão 90, **pendente com a clínica**).
  Agende uma vez por dia:
  - Linux (cron): `15 3 * * * cd /caminho/backend && npm run limpar:dados >> /var/log/dentagenda-limpeza.log 2>&1`
  - Windows (Agendador de Tarefas), no PowerShell:
    `schtasks /Create /SC DAILY /ST 03:15 /TN DentAgendaLimpeza /TR "cmd /c cd /d C:\caminho\backend && npm run limpar:dados"`

## Regras do grupo

- **Design antes de código:** decisão de modelagem ou de contrato entra em `docs/documentacao.md` (próxima é a **D42**)
  antes de virar código.
- **Backend em TDD**, com nomes em português (D23). Biblioteca nova: conferir versão e API no context7 antes de usar.
- **Se o front precisar de algo que a API não dá**, vira decisão e mudança no `docs/api.md`, não gambiarra no front.
- Nunca commitar `backend/.env` nem segredos; o `.gitignore` já cobre.

## Documentação

- `docs/documentacao.md`: decisões de arquitetura e modelagem (D1 a D41). Em conflito com o código, vale este documento.
- `docs/api.md`: contrato da API (rotas, entrada, saída, erros).
- `docs/matriz-de-papeis.md`: quem chama cada rota da API e cada tela do front, com o status esperado.
- `docs/roteiro-de-demonstracao.md`: a apresentação, nos quatro papéis.
- `docs/ponta-a-ponta.md`: roteiro do fluxo da clínica para conferir no navegador.
- `docs/acessibilidade.md`: conferência de acessibilidade e de layout em 400px.
- `docs/spec-backend-mvp.md`: visão geral do backend do MVP.
- `docs/plano-implementacao.md`: plano do backend tarefa por tarefa (todas feitas).
- `docs/pendencias-colzani.md`: perguntas que só a clínica responde.
- `CLAUDE.md`: contexto para o Claude Code (estado real, comandos, armadilhas).
