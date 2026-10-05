# Plano de implementação — Backend do MVP do DentAgenda

> **Para quem executa:** use `superpowers:subagent-driven-development` (recomendado) ou
> `superpowers:executing-plans`, tarefa por tarefa. Passos com checkbox (`- [ ]`).
> Toda tarefa segue TDD (`superpowers:test-driven-development`): o teste falha antes do código.

**Objetivo:** implementar em `backend/` todas as rotas de `docs/api.md`, com as regras de
D1–D23 garantidas por teste contra Postgres real.

**Arquitetura:** Express por domínio (rota → controller → service → Prisma), Zod na entrada,
middleware de erro único. Regras de sobreposição e coerência no banco (exclusion constraints e
CHECKs numa migration SQL escrita à mão); o resto no service, com relógio e mensageria injetados.

**Stack:** Node 24, TypeScript, Express, Zod, Prisma, PostgreSQL 17 (Docker Compose), bcrypt,
jsonwebtoken, cookie-parser, pino + pino-http, Vitest + Supertest, tsx, oxlint.

**Spec:** `docs/spec-backend-mvp.md` (aponta para `docs/documentacao.md` e `docs/api.md`).

### Como ler este plano

- **Código que depende da API de uma biblioteca** (Express, Prisma, Zod, jsonwebtoken, pino, lib
  do Swagger) é escrito na Etapa C, **depois** de conferir versão e API atuais pelo context7 —
  regra do grupo. O plano fixa os nomes, assinaturas, casos de teste e comportamento; o código
  completo aparece aqui só onde não depende de biblioteca (SQL, algoritmos, utilitários puros).
- **Casos de teste** vêm como `it('…')` com preparo e resultado esperado. Cada um vira um teste
  real antes do código.
- **Comando de verificação** (PowerShell, na pasta `backend/`), igual em toda tarefa salvo aviso:
  `npm run lint; npm run typecheck; npm test`
- **Commit:** ao fim de cada tarefa, quem executa entrega o bloco abaixo preenchido; o usuário
  roda. Nunca `git add .`.
  ```powershell
  git add <arquivos da tarefa>
  git commit -m "<tipo>: <descrição>"
  git push origin main
  ```

## Restrições globais

Valores copiados de D1–D23 e `docs/api.md`. Toda tarefa obedece a esta lista.

- Prefixo `/api`, sem versão; JSON; IDs UUID (D20).
- Erro sempre `{ "erro": { "codigo", "mensagem" } }`; regra de negócio → 422; conflito de
  horário → 409; "existe mas você não pode ver" → 404 (D20).
- Datas com hora em `timestamptz` (UTC); grade em `America/Sao_Paulo`; resposta em ISO 8601 com
  fuso (`2026-10-05T14:30:00-03:00`); data sem hora `AAAA-MM-DD`; dinheiro em centavos (D18, api.md).
- CPF e telefone só dígitos (api.md). E-mail sempre em minúsculas: usar `esquemaEmail` de
  `compartilhado/validacao.ts` em toda entrada com e-mail; o banco tem CHECK (D28).
- Senha: 8 a 72 caracteres, sem regra de composição; guardada em bcrypt `senhaHash` (D18, D20).
- Access JWT: **15 min**. Refresh: **cliente 30 dias, funcionário 12 h**, rotativo, guardado como
  SHA-256 (D19).
- Cookie de refresh: `httpOnly`, `Secure` fora do desenvolvimento, `SameSite=Strict`, só na rota de
  refresh; refresh exige cabeçalho `X-DentAgenda-Refresh: 1` (D19).
- Código de verificação: 6 dígitos, 10 min, 3 tentativas, HMAC; limite **3 por hora e 5 por dia**
  por (identificador, tipo) (D3, D19).
- Bloqueio de login: 3 falhas desde o último acerto/redefinição; cliente até redefinir, funcionário
  15 min a partir da 3ª falha (D5, D19).
- Paginação: `?pagina=1&porPagina=20`, máximo 100, resposta `{ itens, total }` (api.md).
- Nomes de código em português (D23). Nada apagado se outra tabela aponta (D18).
- Nunca ler, escrever ou commitar `.env`; só `backend/.env.example`, com nomes e sem valores.
- `ENVIADOR_MENSAGEM=log` com `NODE_ENV=production` → servidor recusa subir (D16, D23).
- Swagger só fora de produção (D23).

## Foco de revisão

Situações que a spec implica, nenhuma rota descreve e mais podem morder um usuário real. Cada
linha tem teste na tarefa indicada.

1. **Virada de dia no fuso:** grade de segunda 20:00–23:00 aceita consulta às 22:00 de segunda em
   São Paulo, que já é terça em UTC → **201** (Tarefa 18; algoritmo na Tarefa 15).
2. **Dois pedidos ao mesmo tempo** para o mesmo horário do mesmo dentista → exatamente um **201** e
   um **409** `HORARIO_INDISPONIVEL` (Tarefa 18).
3. **Bloqueio e consulta criados ao mesmo tempo** no mesmo intervalo → nunca os dois (Tarefa 18).
4. **Remarcar 30 min para frente** (o horário novo sobrepõe a própria consulta original) → **201**
   (Tarefa 20).
5. **Cancelamento na fronteira das 24 h:** exatamente 24 h antes sem justificativa → **200**;
   23 h 59 min → **422** `JUSTIFICATIVA_OBRIGATORIA` (Tarefa 20).

## Estrutura de arquivos

```
backend/
  package.json · tsconfig.json · tsconfig.build.json · .oxlintrc.json · vitest.config.ts
  prisma.config.ts (se o Prisma instalado exigir — conferir no context7)
  docker-compose.yml · docker/criar-banco-teste.sql · .env.example
  prisma/schema.prisma · prisma/migrations/ · prisma/seed.ts · prisma/seed-dev.ts
  scripts/conferir-codigos-de-erro.ts
  testes/                      apoio aos testes (não vai para o build)
    configuracao-global.ts     aplica as migrations no banco de teste
    preparar-arquivo.ts        limpa o banco antes de cada arquivo
    contexto-de-teste.ts       contexto com relógio fixo e enviador em memória
    fabricas.ts                cria pacientes, funcionários, tokens
  src/
    app.ts · server.ts
    config/env.ts
    compartilhado/
      contexto.ts · erros.ts · middleware-de-erro.ts · erros-do-banco.ts · logger.ts
      relogio.ts · mensageria.ts · datas.ts · cpf.ts · paginacao.ts · validacao.ts
      senhas.ts · tokens.ts · autenticacao.ts · banco.ts · openapi.ts
    modulos/
      auth/ pacientes/ funcionarios/ procedimentos/ disponibilidade/ consultas/
        <dominio>.rotas.ts · .controller.ts · .service.ts · .schemas.ts · *.test.ts
```

Domínios grandes (`auth`, `consultas`, `disponibilidade`) têm mais de um arquivo de teste e de
service, com o nome do assunto (`auth.login.test.ts`, `horarios.ts`) — refinamento da D23, que
previa um de cada.

### Interfaces compartilhadas (usadas por todas as tarefas)

```ts
// compartilhado/contexto.ts
export type Contexto = {
  prisma: PrismaClient;          // cliente gerado pelo Prisma
  relogio: Relogio;
  enviador: EnviadorMensagem;
  config: Config;                // de config/env.ts
  logger: Logger;                // pino; acrescentado na Tarefa 4 (ver ledger)
};

// compartilhado/relogio.ts
export interface Relogio { agora(): Date }
export const relogioDoSistema: Relogio = { agora: () => new Date() };

// compartilhado/mensageria.ts
export interface EnviadorMensagem { enviar(destino: string, texto: string): Promise<void> }

// compartilhado/erros.ts
export class ErroDeNegocio extends Error {
  constructor(readonly status: number, readonly codigo: string, mensagem: string,
              readonly detalhes?: Record<string, unknown>) { super(mensagem); }
}
export const naoEncontrado = () => new ErroDeNegocio(404, 'NAO_ENCONTRADO', 'Não encontrado.');
export const semPermissao  = () => new ErroDeNegocio(403, 'SEM_PERMISSAO', 'Sem permissão.');
export const naoAutenticado = () => new ErroDeNegocio(401, 'NAO_AUTENTICADO', 'Faça login novamente.');

// compartilhado/autenticacao.ts
export type UsuarioAutenticado =
  | { tipo: 'CLIENTE'; clienteId: string; sessaoId: string }
  | { tipo: 'FUNCIONARIO'; funcionarioId: string; categoria: 'RECEPCIONISTA' | 'DENTISTA';
      isAdmin: boolean; sessaoId: string };
export type Papel = 'R' | 'D' | 'A' | 'C';     // legenda de docs/api.md
export function autenticar(contexto: Contexto): RequestHandler;   // preenche req.usuario
export function exigirPapel(...papeis: Papel[]): RequestHandler;  // 403 SEM_PERMISSAO

// app.ts
export function criarApp(contexto: Contexto): Express;   // sem abrir porta (D23)

// cada módulo
export function criarRotas<Dominio>(contexto: Contexto): Router;
export const rotasDocumentadas<Dominio>: RotaDocumentada[];   // consumido pelo Swagger (Tarefa 22)

// compartilhado/openapi.ts
export type RotaDocumentada = {
  metodo: 'get' | 'post' | 'put' | 'patch' | 'delete';
  caminho: string;                // '/api/consultas/{id}'
  resumo: string;
  papeis: string;                 // 'R, D, C' — igual à tabela do api.md
  corpo?: ZodType; query?: ZodType;
};
```

Services são funções `(contexto, usuario, entrada) => Promise<Saida>`; o controller lê
`req.usuario`, valida com Zod e chama o service. Nenhum service usa `new Date()` — sempre
`contexto.relogio.agora()`. Colunas `criadoEm`/`editadoEm`/`ocorridoEm` recebem o valor do
relógio (sem `DEFAULT now()` no banco), senão os testes de tempo não controlam a data.

---

## Tarefa 0: Registrar D24 e D25 (só documentação)

Só começa depois que o usuário aprovar as duas decisões abaixo. Sem elas, as tarefas seguintes
não têm `codigo` para 401/403/404 nem formato de resposta da consulta.

**Arquivos:** `docs/documentacao.md` (índice, D24, D25, "Próximo"), `docs/api.md` (tabela de
erros, objetos `consulta` e `paciente`, notas por rota).

### D24 — Códigos de erro genéricos e objetos de resposta (proposta)

1. `codigo` dos erros que o `api.md` ainda não nomeia:
   - 401 sem token, token inválido/expirado, refresh ausente/expirado/revogado → `NAO_AUTENTICADO`
     (`CREDENCIAIS_INVALIDAS` continua só no login).
   - 403 papel não permite → `SEM_PERMISSAO` (`CAMPO_NAO_EDITAVEL` continua no `PATCH` de paciente).
   - 404 recurso inexistente, sem permissão de ver, ou rota inexistente → `NAO_ENCONTRADO`.
   - 500 → `ERRO_INTERNO` (já na D23).
2. 400 `ENTRADA_INVALIDA` traz `erro.campos: [{ "caminho": "endereco.cep", "mensagem": "..." }]`
   (a D23 diz "com os campos que falharam", sem formato).
3. Objeto `consulta`, usado em toda rota de consultas:
   `{ id, paciente: { id, nome }, dentista: { id, nome }, procedimento: { id, nome },
   inicio, fim, status, observacao, criadoEm, canceladoEm, canceladoPor, justificativa }`.
4. Onde o `api.md` escreve só `"paciente"` (`consultasForaDaGrade`, `CONSULTAS_NO_PERIODO`), o
   valor é `{ id, nome }`.
5. Toda data com hora na resposta sai no fuso de São Paulo (`…-03:00`), como no exemplo do api.md.

*Por quê:* sem `codigo` fixo o front não distingue "sessão expirou" de "sem permissão"; sem o
formato da consulta, cada rota inventaria o seu. *Alternativa descartada:* resposta da consulta
só com IDs — obrigaria o front a fazer três chamadas a mais por linha da agenda.

### D25 — Regras de implementação que os documentos não fixam (proposta)

1. **CPF válido** = 11 dígitos com dígitos verificadores corretos (rejeita `11111111111`). Erro de
   digitação na recepção criaria um CPF errado UNIQUE que travaria o verdadeiro dono depois.
2. **Bloqueio do funcionário:** conta as falhas a partir do último `SUCESSO`, `REDEFINICAO` ou
   fim do último bloqueio. Tentativas durante o bloqueio → 423, gravadas como `FALHA`, sem
   estender os 15 min. Senha **certa** durante bloqueio (cliente ou funcionário) → 423.
3. **Limite de códigos:** janelas móveis (últimos 60 min e últimas 24 h), somando todas as
   finalidades do par (identificador, tipo).
4. **Recuperação** de CPF sem `Login`, de e-mail inexistente ou de funcionário inativo → 202
   igual, grava linha de código sem envio (`destino` NULL).
5. **Autocadastro de CPF que já tem login:** grava linha de código (conta no limite) com código
   aleatório nunca enviado e `destino` NULL; envia ao telefone cadastrado só o SMS de orientação.
6. **Logout sem o cookie:** o cookie de refresh só vai para `/api/auth/refresh` (D19), então o
   access token carrega o `sessaoId` (id do `RefreshToken`) e o logout revoga essa sessão.
7. **`PATCH` de paciente com `cpf` no corpo** → 422 `CPF_IMUTAVEL` para qualquer papel, conferido
   antes do 403 `CAMPO_NAO_EDITAVEL`.
8. **`dias-disponiveis`:** para C conta só horários no passo; para R/D conta também janelas de encaixe.
9. **Procedimento inexistente ou inativo** em `horarios-livres`/`dias-disponiveis` → 404.
10. **Ordem das checagens em `POST /api/consultas`** (o primeiro erro vence): entrada (400) →
    paciente/dentista/procedimento existem e são visíveis (404) → `DENTISTA_INATIVO`/
    `PROCEDIMENTO_INATIVO` (422) → `HORARIO_NO_PASSADO` (C) → `FORA_DOS_5_MINUTOS` (R/D) →
    `FORA_DA_GRADE` → `FORA_DO_PASSO` (C) → `HORARIO_BLOQUEADO` → sobreposição (banco).
    "No passado" = `inicio` antes de agora.
11. **Remarcação feita pela clínica** manda **um** SMS ao paciente com o horário novo.
12. **Variáveis `ADMIN_INICIAL_*`** são conferidas só pelo seed, não pela subida do servidor.
13. **Banco de desenvolvimento:** `POSTGRES_USER` e `POSTGRES_PASSWORD` em `backend/.env` (o
    Compose lê de lá); a D23 não listava porque não cobria o container.

- [x] **Passo 1:** escrever D24 e D25 em `docs/documentacao.md` no formato do grupo (status, O quê,
  Por quê, Alternativas descartadas, Em aberto); atualizar índice e "Próximo".
- [x] **Passo 2:** em `docs/api.md`: tabela de erros com coluna `codigo` (formato
  `` `codigo: "NAO_AUTENTICADO"` ``, que o script da Tarefa 23 lê), objetos `consulta` e
  `paciente`, notas de D25.6–D25.10 nas rotas.
- [x] **Passo 3:** commit.
  ```powershell
  git add docs/documentacao.md docs/api.md
  git commit -m "docs: registra D24 (códigos de erro e objetos) e D25 (regras de implementação)"
  git push origin main
  ```

**Pronto quando:** índice mostra D24 e D25 fechadas; nenhum `codigo` usado nas tarefas abaixo
falta no `api.md`.

---

## Tarefa 1: Ambiente do backend

**Arquivos:**
- Criar: `backend/package.json`, `backend/tsconfig.json`, `backend/tsconfig.build.json`,
  `backend/.oxlintrc.json`, `backend/docker-compose.yml`, `backend/docker/criar-banco-teste.sql`,
  `backend/.env.example`, `backend/vitest.config.ts`, `backend/src/config/env.ts`,
  `backend/src/config/env.test.ts`
- Modificar: `.gitignore` (raiz) — acrescentar `backend/src/generated/` (cliente gerado do Prisma)

**Interfaces:**
- Produz: `carregarConfig(variaveis: NodeJS.ProcessEnv): Config` — lança `Error` cuja mensagem
  lista os **nomes** das variáveis com problema, nunca os valores.
  `Config = { nodeEnv: 'development' | 'test' | 'production'; porta: number; databaseUrl: string;
  jwtSegredo: string; codigoHmacSegredo: string; enviadorMensagem: 'log' }`

- [x] **Passo 1: conferir no context7** as versões atuais de TypeScript, tsx, Vitest, oxlint, Zod
  e a tag atual da imagem `postgres:17`. Anotar as versões no commit.
- [x] **Passo 2: `package.json`** com `"type": "module"`, `"engines": { "node": ">=24" }` e os
  scripts da D23:
  `dev` (`tsx watch --env-file=.env src/server.ts`), `build` (`tsc -p tsconfig.build.json`),
  `start` (`node --env-file=.env dist/server.js`), `test` (`vitest run`), `lint` (`oxlint`),
  `typecheck` (`tsc --noEmit`), `db:migrate` (`prisma migrate dev`),
  `db:seed` (`tsx --env-file=.env prisma/seed.ts`), `db:seed:dev` (`tsx --env-file=.env prisma/seed-dev.ts`).
- [x] **Passo 3: Docker.**
  ```yaml
  # backend/docker-compose.yml
  services:
    postgres:
      image: postgres:17
      environment:
        POSTGRES_USER: ${POSTGRES_USER}
        POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
        POSTGRES_DB: dentagenda
      ports:
        - "5432:5432"
      volumes:
        - dados:/var/lib/postgresql/data
        - ./docker/criar-banco-teste.sql:/docker-entrypoint-initdb.d/criar-banco-teste.sql:ro
  volumes:
    dados: {}
  ```
  ```sql
  -- backend/docker/criar-banco-teste.sql (roda só na primeira subida do volume)
  CREATE DATABASE dentagenda_test;
  ```
- [x] **Passo 4: `.env.example`** — só nomes:
  ```
  NODE_ENV=
  PORTA=
  DATABASE_URL=
  DATABASE_URL_TESTE=
  JWT_SEGREDO=
  CODIGO_HMAC_SEGREDO=
  ENVIADOR_MENSAGEM=
  POSTGRES_USER=
  POSTGRES_PASSWORD=
  ADMIN_INICIAL_EMAIL=
  ADMIN_INICIAL_NOME=
  ADMIN_INICIAL_CPF=
  ADMIN_INICIAL_CATEGORIA=
  ADMIN_INICIAL_CRO=
  ```
  **O usuário** cria `backend/.env` a partir dele. Para os segredos, sem exibir na tela:
  ```powershell
  node -e "console.log(require('crypto').randomBytes(48).toString('base64'))" | Set-Clipboard
  ```
  (rodar uma vez para cada segredo e colar no `.env`; o valor vai direto para o clipboard, sem
  aparecer na tela).
- [x] **Passo 5: testes que falham** — `src/config/env.test.ts`:
  - `it('recusa subir quando falta JWT_SEGREDO e cita o nome, não o valor')`
  - `it('recusa ENVIADOR_MENSAGEM=log com NODE_ENV=production')` (D16)
  - `it('recusa segredo com menos de 32 caracteres')`
  - `it('converte PORTA para número')`
- [x] **Passo 6:** rodar `npm test` → FAIL (`carregarConfig` não existe).
- [x] **Passo 7:** implementar `env.ts` com um schema Zod e `.refine` para a regra da D16.
- [x] **Passo 8:** `vitest.config.ts` com `fileParallelism: false` (D23), `include: ['src/**/*.test.ts']`,
  carregando `backend/.env` com `process.loadEnvFile` (Node 24) e trocando `DATABASE_URL` por
  `DATABASE_URL_TESTE` antes dos testes.
- [x] **Passo 9:** verificação.
  ```powershell
  docker compose up -d
  docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -l'   # lista dentagenda e dentagenda_test
  npm run lint; npm run typecheck; npm test
  ```

**Pronto quando:** 4 testes passam; os dois bancos existem; `git status` não mostra `.env`.

**Commit:** `chore: cria ambiente do backend (Docker, TypeScript, Vitest, validação de env)` —
arquivos acima + `backend/package-lock.json` + `.gitignore`.

---

## Tarefa 2: Schema Prisma e migration com restrições do banco

**Arquivos:**
- Criar: `backend/prisma/schema.prisma`, `backend/prisma/migrations/<data>_inicial/migration.sql`,
  `backend/src/compartilhado/banco.ts`, `backend/src/compartilhado/erros-do-banco.ts`,
  `backend/src/compartilhado/restricoes-do-banco.test.ts`, `backend/testes/configuracao-global.ts`,
  `backend/testes/preparar-arquivo.ts`
- Modificar: `backend/vitest.config.ts` (`globalSetup`, `setupFiles`)

**Interfaces:**
- Produz: `criarPrisma(url: string): PrismaClient`;
  `violacaoDoBanco(erro: unknown): { codigoSql: string; restricao: string | null; campos: string[] } | null`
  — extrai SQLSTATE (`23P01`, `23505`, `23514`), nome da restrição e campos do UNIQUE, seja qual
  for o formato do erro do Prisma instalado.
- Produz (testes): `limparBanco(prisma)` — `TRUNCATE` de todas as tabelas de `public` exceto
  `_prisma_migrations`, com `CASCADE`.

- [x] **Passo 1: conferir no context7** a versão atual do Prisma: bloco `generator`
  (`prisma-client` + `output`?), necessidade de `prisma.config.ts` e de driver adapter
  (`@prisma/adapter-pg`), e se o Prisma lê `.env` sozinho.
- [x] **Passo 2: `schema.prisma`** — modelos da D18/D19 (nomes de tabela = nomes do modelo):
  ```prisma
  enum Categoria          { RECEPCIONISTA DENTISTA }
  enum StatusConsulta     { CONFIRMADA REALIZADA CANCELADA }
  enum Autor              { PACIENTE CLINICA }
  enum TipoConta          { CLIENTE FUNCIONARIO }
  enum ResultadoTentativa { SUCESSO FALHA REDEFINICAO }
  enum FinalidadeCodigo   { RECUPERACAO ATIVACAO CADASTRO }

  model Cliente {
    id            String    @id @default(uuid()) @db.Uuid
    nome          String
    cpf           String    @unique @db.Char(11)
    telefone      String
    email         String?
    nascimento    DateTime? @db.Date
    convenio      String?
    criadoEm      DateTime  @db.Timestamptz
    pacienteDesde DateTime  @db.Date
    endereco      EnderecoCliente?
    login         Login?
    alertas       AlertaCliente[]
    consultas     Consulta[]
  }

  model EnderecoCliente {
    clienteId   String  @id @db.Uuid
    cliente     Cliente @relation(fields: [clienteId], references: [id])
    cep         String  @db.Char(8)
    logradouro  String
    numero      String
    complemento String?
    bairro      String
    cidade      String
    uf          String  @db.Char(2)
  }

  model AlertaCliente {
    id                       String       @id @default(uuid()) @db.Uuid
    clienteId                String       @db.Uuid
    cliente                  Cliente      @relation(fields: [clienteId], references: [id])
    texto                    String
    autor                    Autor
    autorFuncionarioId       String?      @db.Uuid
    autorFuncionario         Funcionario? @relation("AlertaAutor", fields: [autorFuncionarioId], references: [id])
    criadoEm                 DateTime     @db.Timestamptz
    removidoEm               DateTime?    @db.Timestamptz
    removidoPorFuncionarioId String?      @db.Uuid
    removidoPorFuncionario   Funcionario? @relation("AlertaRemovidoPor", fields: [removidoPorFuncionarioId], references: [id])
  }

  model Login {
    id            String         @id @default(uuid()) @db.Uuid
    clienteId     String         @unique @db.Uuid
    cliente       Cliente        @relation(fields: [clienteId], references: [id])
    senhaHash     String         @db.Char(60)
    refreshTokens RefreshToken[]
  }

  model Funcionario {
    id         String    @id @default(uuid()) @db.Uuid
    nome       String
    cpf        String    @unique @db.Char(11)
    email      String    @unique
    senhaHash  String    @db.Char(60)
    categoria  Categoria
    isAdmin    Boolean   @default(false)
    cro        String?   @unique
    dataInicio DateTime  @db.Date
    ativo      Boolean   @default(true)
    grade      GradeHorario[]
    bloqueios  Bloqueio[]
    consultas  Consulta[]  @relation("ConsultaDentista")
    cancelamentos Consulta[] @relation("ConsultaCanceladaPor")
    alertasCriados   AlertaCliente[] @relation("AlertaAutor")
    alertasRemovidos AlertaCliente[] @relation("AlertaRemovidoPor")
    edicoesObservacao HistoricoObservacao[]
    refreshTokens RefreshToken[]
  }

  model Procedimento {
    id             String     @id @default(uuid()) @db.Uuid
    nome           String     @unique
    duracaoMinutos Int
    precoCentavos  Int
    ativo          Boolean    @default(true)
    consultas      Consulta[]
  }

  model GradeHorario {
    id         String      @id @default(uuid()) @db.Uuid
    dentistaId String      @db.Uuid
    dentista   Funcionario @relation(fields: [dentistaId], references: [id])
    diaSemana  Int         @db.SmallInt
    inicio     DateTime    @db.Time(0)
    fim        DateTime    @db.Time(0)
  }

  model Bloqueio {
    id         String      @id @default(uuid()) @db.Uuid
    dentistaId String      @db.Uuid
    dentista   Funcionario @relation(fields: [dentistaId], references: [id])
    inicio     DateTime    @db.Timestamptz
    fim        DateTime    @db.Timestamptz
  }

  model Consulta {
    id                        String         @id @default(uuid()) @db.Uuid
    clienteId                 String         @db.Uuid
    cliente                   Cliente        @relation(fields: [clienteId], references: [id])
    dentistaId                String         @db.Uuid
    dentista                  Funcionario    @relation("ConsultaDentista", fields: [dentistaId], references: [id])
    procedimentoId            String         @db.Uuid
    procedimento              Procedimento   @relation(fields: [procedimentoId], references: [id])
    inicio                    DateTime       @db.Timestamptz
    fim                       DateTime       @db.Timestamptz
    status                    StatusConsulta
    observacao                String?
    criadoEm                  DateTime       @db.Timestamptz
    canceladoEm               DateTime?      @db.Timestamptz
    canceladoPor              Autor?
    canceladoPorFuncionarioId String?        @db.Uuid
    canceladoPorFuncionario   Funcionario?   @relation("ConsultaCanceladaPor", fields: [canceladoPorFuncionarioId], references: [id])
    justificativa             String?
    historicoObservacao       HistoricoObservacao[]
  }

  model HistoricoObservacao {
    id                 String       @id @default(uuid()) @db.Uuid
    consultaId         String       @db.Uuid
    consulta           Consulta     @relation(fields: [consultaId], references: [id])
    texto              String?
    autor              Autor
    autorFuncionarioId String?      @db.Uuid
    autorFuncionario   Funcionario? @relation(fields: [autorFuncionarioId], references: [id])
    editadoEm          DateTime     @db.Timestamptz
  }

  model TentativaLogin {
    id            String             @id @default(uuid()) @db.Uuid
    identificador String
    tipo          TipoConta
    ip            String
    ocorridoEm    DateTime           @db.Timestamptz
    resultado     ResultadoTentativa
    @@index([identificador, tipo, ocorridoEm])
  }

  model CodigoVerificacao {
    id            String           @id @default(uuid()) @db.Uuid
    identificador String
    tipo          TipoConta
    finalidade    FinalidadeCodigo
    destino       String?
    codigoHash    String
    criadoEm      DateTime         @db.Timestamptz
    expiraEm      DateTime         @db.Timestamptz
    tentativas    Int              @default(0)
    usadoEm       DateTime?        @db.Timestamptz
    @@index([identificador, tipo, criadoEm])
  }

  model RefreshToken {
    id            String       @id @default(uuid()) @db.Uuid
    loginId       String?      @db.Uuid
    login         Login?       @relation(fields: [loginId], references: [id])
    funcionarioId String?      @db.Uuid
    funcionario   Funcionario? @relation(fields: [funcionarioId], references: [id])
    tokenHash     String       @unique
    criadoEm      DateTime     @db.Timestamptz
    expiraEm      DateTime     @db.Timestamptz
    revogadoEm    DateTime?    @db.Timestamptz
  }
  ```
- [x] **Passo 3:** `npx prisma migrate dev --create-only --name inicial` e **acrescentar ao fim**
  do `migration.sql` gerado:
  ```sql
  CREATE EXTENSION IF NOT EXISTS btree_gist;
  CREATE EXTENSION IF NOT EXISTS unaccent;   -- busca de paciente sem acento (Tarefa 11)

  -- D6, D18: sem sobreposição de consultas não canceladas
  ALTER TABLE "Consulta" ADD CONSTRAINT consulta_dentista_sem_sobreposicao
    EXCLUDE USING gist ("dentistaId" WITH =, tstzrange("inicio", "fim", '[)') WITH &&)
    WHERE ("status" <> 'CANCELADA');
  ALTER TABLE "Consulta" ADD CONSTRAINT consulta_paciente_sem_sobreposicao
    EXCLUDE USING gist ("clienteId" WITH =, tstzrange("inicio", "fim", '[)') WITH &&)
    WHERE ("status" <> 'CANCELADA');

  ALTER TABLE "Consulta" ADD CONSTRAINT consulta_inicio_antes_do_fim CHECK ("inicio" < "fim");
  ALTER TABLE "Consulta" ADD CONSTRAINT consulta_cancelamento_coerente CHECK (
    ("status" = 'CANCELADA' AND "canceladoEm" IS NOT NULL AND "canceladoPor" IS NOT NULL)
    OR ("status" <> 'CANCELADA' AND "canceladoEm" IS NULL AND "canceladoPor" IS NULL));
  ALTER TABLE "Consulta" ADD CONSTRAINT consulta_cancelamento_clinica_tem_funcionario CHECK (
    ("canceladoPor" IS NOT DISTINCT FROM 'CLINICA') = ("canceladoPorFuncionarioId" IS NOT NULL));
  ALTER TABLE "Consulta" ADD CONSTRAINT consulta_justificativa_menos_de_24h CHECK (
    "canceladoPor" IS DISTINCT FROM 'PACIENTE'
    OR "inicio" - "canceladoEm" >= interval '24 hours'
    OR "justificativa" IS NOT NULL);

  ALTER TABLE "Funcionario" ADD CONSTRAINT funcionario_dentista_tem_cro
    CHECK ("categoria" <> 'DENTISTA' OR "cro" IS NOT NULL);
  ALTER TABLE "Procedimento" ADD CONSTRAINT procedimento_duracao_positiva CHECK ("duracaoMinutos" > 0);
  ALTER TABLE "Procedimento" ADD CONSTRAINT procedimento_preco_nao_negativo CHECK ("precoCentavos" >= 0);
  ALTER TABLE "GradeHorario" ADD CONSTRAINT grade_inicio_antes_do_fim CHECK ("inicio" < "fim");
  ALTER TABLE "GradeHorario" ADD CONSTRAINT grade_dia_semana_valido CHECK ("diaSemana" BETWEEN 0 AND 6);
  ALTER TABLE "Bloqueio" ADD CONSTRAINT bloqueio_inicio_antes_do_fim CHECK ("inicio" < "fim");

  ALTER TABLE "AlertaCliente" ADD CONSTRAINT alerta_autor_clinica_tem_funcionario CHECK (
    ("autor" = 'CLINICA') = ("autorFuncionarioId" IS NOT NULL));
  ALTER TABLE "AlertaCliente" ADD CONSTRAINT alerta_remocao_coerente CHECK (
    ("removidoEm" IS NULL) = ("removidoPorFuncionarioId" IS NULL));
  ALTER TABLE "HistoricoObservacao" ADD CONSTRAINT historico_autor_clinica_tem_funcionario CHECK (
    ("autor" = 'CLINICA') = ("autorFuncionarioId" IS NOT NULL));

  ALTER TABLE "CodigoVerificacao" ADD CONSTRAINT codigo_tentativas_ate_3 CHECK ("tentativas" BETWEEN 0 AND 3);
  ALTER TABLE "RefreshToken" ADD CONSTRAINT refresh_uma_conta
    CHECK (num_nonnulls("loginId", "funcionarioId") = 1);
  ```
- [x] **Passo 4:** `configuracao-global.ts` roda `prisma migrate deploy` com `DATABASE_URL` =
  `DATABASE_URL_TESTE`; `preparar-arquivo.ts` faz `beforeAll(() => limparBanco(prisma))`.
- [x] **Passo 5: testes que falham** — `restricoes-do-banco.test.ts` (insere direto pelo Prisma,
  sem rota; cada um confere `violacaoDoBanco(erro)`):
  - `it('recusa duas consultas não canceladas sobrepostas do mesmo dentista')` → `23P01`,
    `consulta_dentista_sem_sobreposicao`
  - `it('aceita consultas encostadas: [08:00,09:00) e [09:00,10:00)')`
  - `it('ignora consulta CANCELADA na sobreposição')`
  - `it('recusa o mesmo paciente em dois dentistas no mesmo horário')` → `consulta_paciente_sem_sobreposicao`
  - `it('recusa dentista sem CRO')` → `23514`, `funcionario_dentista_tem_cro`
  - `it('recusa CANCELADA sem canceladoEm')` → `consulta_cancelamento_coerente`
  - `it('recusa cancelamento da CLINICA sem funcionário')`
  - `it('recusa paciente cancelando com 23h sem justificativa e aceita com 24h')`
  - `it('recusa refresh com loginId e funcionarioId ao mesmo tempo')`
  - `it('recusa código com 4 tentativas')`
  - `it('informa os campos do UNIQUE violado')` → `23505`, `campos` contém `cpf`
- [x] **Passo 6:** `npm test` → FAIL; implementar `banco.ts`, `erros-do-banco.ts`, `limparBanco`.
  O formato do erro do Prisma é descoberto pelo próprio teste (imprimir uma vez, ajustar o
  extrator, apagar o print).
- [x] **Passo 7:** conferir que `npx prisma migrate dev` **não** gera migration nova (o Prisma não
  pode tentar apagar as restrições manuais). Se gerar, parar e avisar o usuário.
- [x] **Passo 8:** verificação padrão.

**Pronto quando:** 11 testes passam; `migrate dev` limpo.

**Commit:** `feat: schema Prisma e migration com exclusion constraints e CHECKs (D6, D18, D19)`

---

## Tarefa 3: Utilitários puros (relógio, fuso, CPF, paginação)

**Arquivos:** criar `src/compartilhado/{relogio,datas,cpf,paginacao}.ts` e `.test.ts` de cada;
`testes/contexto-de-teste.ts` (só a parte `RelogioFixo` nesta tarefa).

**Interfaces (produz):**
```ts
// relogio.ts
export interface Relogio { agora(): Date }
export const relogioDoSistema: Relogio;
// testes/contexto-de-teste.ts
export class RelogioFixo implements Relogio {
  constructor(private instante: Date) {}
  agora() { return new Date(this.instante); }
  avancarMinutos(minutos: number) { this.instante = new Date(this.instante.getTime() + minutos * 60_000); }
  definir(instante: Date) { this.instante = instante; }
}

// datas.ts
export const FUSO_DA_CLINICA = 'America/Sao_Paulo';
export type Intervalo = { inicio: Date; fim: Date };   // usado por grade, bloqueios e horários
export function deslocamentoEmMinutos(instante: Date): number;
export function instanteEmSaoPaulo(data: string /* AAAA-MM-DD */, hora: string /* HH:mm */): Date;
export function formatarEmSaoPaulo(instante: Date): string;      // '2026-10-05T08:00:00-03:00'
export function dataEmSaoPaulo(instante: Date): string;          // 'AAAA-MM-DD'
export function diaDaSemana(data: string): number;               // 0 = domingo
export function minutosDoDiaEmSaoPaulo(instante: Date): number;  // 08:30 → 510

// cpf.ts
export function cpfValido(cpf: string): boolean;

// paginacao.ts
export const esquemaPaginacao;   // Zod: pagina ≥ 1 (padrão 1), porPagina 1..100 (padrão 20)
export function paginar(pagina: number, porPagina: number): { skip: number; take: number };
```

- [x] **Passo 1: testes que falham:**
  - `datas.test.ts`
    - `it('08:00 de 2026-10-05 em São Paulo é 11:00Z')`
    - `it('22:00 de segunda em São Paulo é terça em UTC, mas dataEmSaoPaulo devolve segunda')`
    - `it('formata com -03:00')` → `formatarEmSaoPaulo(new Date('2026-10-05T11:00:00Z'))` = `'2026-10-05T08:00:00-03:00'`
    - `it('2026-10-05 é segunda (1)')`
  - `cpf.test.ts`: `it('aceita 52998224725')`, `it('recusa dígito verificador errado 52998224724')`,
    `it('recusa 11111111111')`, `it('recusa com pontuação')`, `it('recusa 10 dígitos')`
  - `paginacao.test.ts`: `it('padrão pagina 1, porPagina 20')`, `it('recusa porPagina 101')`,
    `it('pagina 3 de 20 → skip 40')`
- [x] **Passo 2:** `npm test` → FAIL.
- [x] **Passo 3: implementar** (sem dependência externa):
  ```ts
  // datas.ts
  const MINUTO = 60_000;
  const formatoDeslocamento = new Intl.DateTimeFormat('en-US', {
    timeZone: FUSO_DA_CLINICA, timeZoneName: 'longOffset',
  });

  export function deslocamentoEmMinutos(instante: Date): number {
    const nome = formatoDeslocamento.formatToParts(instante)
      .find((parte) => parte.type === 'timeZoneName')?.value ?? 'GMT';
    const partes = /GMT([+-])(\d{2}):(\d{2})/.exec(nome);
    if (!partes) return 0;
    const sinal = partes[1] === '-' ? -1 : 1;
    return sinal * (Number(partes[2]) * 60 + Number(partes[3]));
  }

  export function instanteEmSaoPaulo(data: string, hora: string): Date {
    const comoSeFosseUtc = new Date(`${data}T${hora}:00Z`);
    return new Date(comoSeFosseUtc.getTime() - deslocamentoEmMinutos(comoSeFosseUtc) * MINUTO);
  }

  function relogioLocal(instante: Date): { iso: string; deslocamento: number } {
    const deslocamento = deslocamentoEmMinutos(instante);
    const iso = new Date(instante.getTime() + deslocamento * MINUTO).toISOString().slice(0, 19);
    return { iso, deslocamento };
  }

  export function formatarEmSaoPaulo(instante: Date): string {
    const { iso, deslocamento } = relogioLocal(instante);
    const sinal = deslocamento < 0 ? '-' : '+';
    const absoluto = Math.abs(deslocamento);
    const horas = String(Math.floor(absoluto / 60)).padStart(2, '0');
    const minutos = String(absoluto % 60).padStart(2, '0');
    return `${iso}${sinal}${horas}:${minutos}`;
  }

  export function dataEmSaoPaulo(instante: Date): string {
    return relogioLocal(instante).iso.slice(0, 10);
  }

  export function minutosDoDiaEmSaoPaulo(instante: Date): number {
    const [horas, minutos] = relogioLocal(instante).iso.slice(11, 16).split(':').map(Number);
    return horas * 60 + minutos;
  }

  export function diaDaSemana(data: string): number {
    const [ano, mes, dia] = data.split('-').map(Number);
    return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
  }
  ```
  ```ts
  // cpf.ts
  export function cpfValido(cpf: string): boolean {
    if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
    const digitos = [...cpf].map(Number);
    const digitoVerificador = (quantidade: number) => {
      const soma = digitos.slice(0, quantidade)
        .reduce((total, digito, indice) => total + digito * (quantidade + 1 - indice), 0);
      const resto = (soma * 10) % 11;
      return resto === 10 ? 0 : resto;
    };
    return digitoVerificador(9) === digitos[9] && digitoVerificador(10) === digitos[10];
  }
  ```
- [x] **Passo 4:** verificação padrão.

**Pronto quando:** todos os testes desta tarefa passam.

**Commit:** `feat: relógio, fuso de São Paulo, CPF e paginação`

---

## Tarefa 4: App, middleware de erro, logger e mensageria

**Arquivos:** criar `src/app.ts`, `src/server.ts`, `src/compartilhado/{contexto,erros,middleware-de-erro,logger,mensageria,validacao}.ts`,
`src/compartilhado/middleware-de-erro.test.ts`, `src/compartilhado/logger.test.ts`;
completar `testes/contexto-de-teste.ts` (`EnviadorEmMemoria`, `criarContextoDeTeste()`).

**Interfaces:**
- Consome: `Config` (T1), `criarPrisma`, `violacaoDoBanco` (T2), `Relogio` (T3).
- Produz: `Contexto`, `ErroDeNegocio`, `naoEncontrado`, `semPermissao`, `naoAutenticado` (ver
  "Interfaces compartilhadas"); `criarApp(contexto)`; `EnviadorLog`;
  `validar<T>(esquema: ZodType<T>, dado: unknown): T` (lança o erro do Zod, que o middleware traduz);
  ```ts
  // testes/contexto-de-teste.ts
  export class EnviadorEmMemoria implements EnviadorMensagem {
    mensagens: { destino: string; texto: string }[] = [];
    async enviar(destino: string, texto: string) { this.mensagens.push({ destino, texto }); }
    ultimoCodigoPara(destino: string): string;   // extrai /\b\d{6}\b/ da última mensagem; lança se não houver
  }
  export function criarContextoDeTeste(): Contexto & { relogio: RelogioFixo; enviador: EnviadorEmMemoria };
  // relógio começa em 2026-10-05T12:00:00Z (segunda, 09:00 em São Paulo)
  ```
- Mapeamento no middleware (D23):
  - `ErroDeNegocio` → `status`, `{ erro: { codigo, mensagem, ...detalhes } }`
  - erro do Zod → 400 `ENTRADA_INVALIDA` + `campos` (D24.2); JSON malformado → o mesmo 400
  - `violacaoDoBanco` `23P01` + `consulta_dentista_sem_sobreposicao` → 409 `HORARIO_INDISPONIVEL`
  - `23P01` + `consulta_paciente_sem_sobreposicao` → 409 `PACIENTE_COM_CONSULTA_NO_HORARIO`
  - qualquer outro → 500 `ERRO_INTERNO`, mensagem genérica, stack só no log
  - rota inexistente → 404 `NAO_ENCONTRADO`

- [x] **Passo 1: conferir no context7** Express (versão atual; se repassa erro de handler `async`
  sozinho), pino e pino-http (opção `redact`), cookie-parser.
- [x] **Passo 2: testes que falham** — `middleware-de-erro.test.ts` monta um app de teste com
  rotas que lançam cada tipo de erro:
  - `it('ErroDeNegocio vira status e codigo')` → 422 `{ erro: { codigo: 'X', mensagem } }`
  - `it('erro do Zod vira 400 ENTRADA_INVALIDA com campos')`
  - `it('JSON malformado vira 400 ENTRADA_INVALIDA')`
  - `it('violação de sobreposição do dentista vira 409 HORARIO_INDISPONIVEL')` (insere duas consultas
    sobrepostas pela rota de teste)
  - `it('violação de sobreposição do paciente vira 409 PACIENTE_COM_CONSULTA_NO_HORARIO')`
  - `it('erro inesperado vira 500 ERRO_INTERNO sem stack na resposta')`
  - `it('rota inexistente vira 404 NAO_ENCONTRADO')` — esta usa `criarApp` de verdade
- [x] **Passo 3: teste que falha** — `logger.test.ts`:
  `it('troca senha, novaSenha, codigo, cpf, authorization e cookie por [OCULTO]')` — logger com
  destino em memória; loga `{ senha: 'x', cpf: '52998224725', req: { headers: { authorization: 'Bearer y', cookie: 'z' } } }`
  e confere que nenhum valor original aparece.
- [x] **Passo 4:** `npm test` → FAIL; implementar.
- [x] **Passo 5:** `server.ts`: `carregarConfig(process.env)`, monta `Contexto` com
  `relogioDoSistema` e `EnviadorLog`, `criarApp(contexto).listen(config.porta)`.
- [x] **Passo 6:** verificação padrão + `npm run dev` e
  `curl.exe -s http://localhost:<PORTA>/api/nada` → 404 com `NAO_ENCONTRADO`.

**Pronto quando:** 8 testes passam; servidor sobe e responde 404 no formato certo.

**Commit:** `feat: app Express, middleware de erro único, logger sem dado sensível e mensageria em log`

---

## Tarefa 5: Senhas, tokens, autenticação e fábricas de teste

**Arquivos:** criar `src/compartilhado/{senhas,tokens,autenticacao}.ts`,
`src/compartilhado/autenticacao.test.ts`, `testes/fabricas.ts`.

**Interfaces (produz):**
```ts
// senhas.ts — bcrypt, custo 12
export function gerarHashDeSenha(senha: string): Promise<string>;
export function conferirSenha(senha: string, hash: string): Promise<boolean>;
export function gerarSenhaAleatoria(): string;   // 32 bytes aleatórios em base64url (D21)

// tokens.ts — HS256; iat/exp calculados com o relógio, não com Date.now()
export const DURACAO_ACCESS_SEGUNDOS = 15 * 60;
export function gerarAccessToken(usuario: UsuarioAutenticado, contexto: Contexto): string;
export function lerAccessToken(token: string, contexto: Contexto): UsuarioAutenticado;  // lança naoAutenticado()
export function gerarRefreshToken(): { token: string; tokenHash: string };  // 32 bytes base64url; SHA-256 hex

// testes/fabricas.ts
export function gerarCpfValido(): string;   // 9 dígitos aleatórios + 2 verificadores
export const SENHA_DE_TESTE = 'senha-de-teste-123';
export function criarFuncionario(contexto, dados?: Partial<{ categoria; isAdmin; ativo; email; nome }>):
  Promise<Funcionario>;                       // DENTISTA ganha CRO único; senha = SENHA_DE_TESTE
export function criarPaciente(contexto, dados?: Partial<Cliente>, opcoes?: { comLogin?: boolean }):
  Promise<Cliente>;
export function tokenDe(contexto, conta: Funcionario | Cliente): string;   // access token com sessaoId aleatório
export function criarProcedimento(contexto, dados?: Partial<Procedimento>): Promise<Procedimento>;
```
Fábricas calculam o hash de `SENHA_DE_TESTE` **uma vez** por arquivo (bcrypt custo 12 leva
~250 ms por hash).

- [x] **Passo 1: conferir no context7** bcrypt (prebuilt para Windows/Node 24) e jsonwebtoken
  (`sign` com `iat`/`exp` no payload; `verify` com `clockTimestamp`).
- [x] **Passo 2: testes que falham** — `autenticacao.test.ts` (app de teste com uma rota
  `exigirPapel('R','C')` e outra `exigirPapel('A')`):
  - `it('sem Authorization → 401 NAO_AUTENTICADO')`
  - `it('token com assinatura de outro segredo → 401')`
  - `it('token vencido (relógio +16 min) → 401')`
  - `it('token ainda válido com 14 min → 200')`
  - `it('dentista em rota de R e C → 403 SEM_PERMISSAO')`
  - `it('recepcionista com isAdmin passa em rota A')`
  - `it('dentista sem isAdmin em rota A → 403')`
  - `it('conferirSenha aceita a senha certa e recusa a errada')`
- [x] **Passo 3:** `npm test` → FAIL; implementar. `exigirPapel`: R = funcionário RECEPCIONISTA,
  D = funcionário DENTISTA, A = funcionário com `isAdmin`, C = cliente.
- [x] **Passo 4:** verificação padrão.

**Pronto quando:** 8 testes passam.

**Commit:** `feat: hash de senha, JWT com relógio injetável e middleware de papéis (D9, D10)`

---

## Tarefa 6: Login de cliente e funcionário, com bloqueio

**Arquivos:** criar `src/modulos/auth/{auth.rotas,auth.controller,auth.schemas,login.service,sessoes,bloqueio-de-login}.ts`,
`bloqueio-de-login.test.ts`, `auth.login.test.ts`; modificar `src/app.ts` (montar `criarRotasAuth`).

**Interfaces:**
- Produz: `criarSessao(tx, conta: { loginId } | { funcionarioId }, contexto): { refreshToken: string; sessaoId: string }`
  (expira em 30 dias para cliente, 12 h para funcionário);
  `revogarTodasAsSessoes(tx, conta, contexto): Promise<void>`;
  `definirCookieDeRefresh(res, token, expiraEm, contexto)` — nome `dentagenda_refresh`,
  `path: '/api/auth/refresh'`, `httpOnly`, `sameSite: 'strict'`, `secure: nodeEnv !== 'development' && nodeEnv !== 'test'`.
- Produz (puro):
  ```ts
  type Tentativa = { ocorridoEm: Date; resultado: 'SUCESSO' | 'FALHA' | 'REDEFINICAO' };
  export const MAXIMO_DE_FALHAS = 3;
  export const BLOQUEIO_FUNCIONARIO_MINUTOS = 15;

  function ultimaLiberacao(tentativas: Tentativa[]): Date {
    const liberacoes = tentativas.filter((t) => t.resultado !== 'FALHA');
    return liberacoes.at(-1)?.ocorridoEm ?? new Date(0);
  }

  // tentativas em ordem crescente de ocorridoEm
  export function clienteEstaBloqueado(tentativas: Tentativa[]): boolean {
    const referencia = ultimaLiberacao(tentativas);
    return tentativas.filter((t) => t.resultado === 'FALHA' && t.ocorridoEm > referencia).length
      >= MAXIMO_DE_FALHAS;
  }

  export function funcionarioBloqueadoAte(tentativas: Tentativa[], agora: Date): Date | null {
    let referencia = ultimaLiberacao(tentativas);
    for (;;) {
      const falhas = tentativas.filter((t) => t.resultado === 'FALHA' && t.ocorridoEm > referencia);
      if (falhas.length < MAXIMO_DE_FALHAS) return null;
      const fim = new Date(falhas[MAXIMO_DE_FALHAS - 1].ocorridoEm.getTime()
        + BLOQUEIO_FUNCIONARIO_MINUTOS * 60_000);
      if (agora < fim) return fim;
      referencia = fim;   // D25.2: falhas durante o bloqueio não contam depois dele
    }
  }
  ```
- Rotas: `POST /api/auth/cliente/login`, `POST /api/auth/funcionario/login`. Resposta 200
  `{ accessToken, usuario }` + cookie. `usuario` no formato do api.md.

- [x] **Passo 1: testes que falham** — `bloqueio-de-login.test.ts` (puro):
  - `it('cliente com 2 falhas não está bloqueado')`, `it('cliente com 3 falhas está bloqueado')`
  - `it('REDEFINICAO zera a contagem do cliente')`
  - `it('funcionário: bloqueado até 3ª falha + 15 min')`
  - `it('funcionário: falhas durante o bloqueio não estendem o prazo')`
  - `it('funcionário: depois do bloqueio, recomeça a contar do zero')`
- [x] **Passo 2: testes que falham** — `auth.login.test.ts`:
  - `it('cliente com CPF e senha certos → 200, accessToken, usuario tipo CLIENTE e cookie httpOnly SameSite=Strict no path /api/auth/refresh')`
  - `it('CPF inexistente e senha errada → mesma resposta 401 CREDENCIAIS_INVALIDAS')` (compara corpo)
  - `it('paciente sem Login → 401 CREDENCIAIS_INVALIDAS')`
  - `it('CPF com formato inválido → 400 ENTRADA_INVALIDA, sem gravar tentativa')` (D3)
  - `it('grava SUCESSO e FALHA em TentativaLogin, inclusive CPF inexistente')` (D5)
  - `it('3ª falha do cliente bloqueia: senha certa depois → 423 CONTA_BLOQUEADA')`
  - `it('3ª falha do cliente revoga as sessões abertas')` (D19)
  - `it('3 falhas em CPF inexistente também respondem 423')` (D5: sem enumeração)
  - `it('funcionário certo → 200 com categoria e isAdmin; refresh expira em 12 h')`
  - `it('funcionário inativo com senha certa → 401 CREDENCIAIS_INVALIDAS')`
  - `it('funcionário bloqueado → 423; 15 min depois loga')`
  - `it('senha com 73 caracteres → 400 ENTRADA_INVALIDA')`
- [x] **Passo 3:** `npm test` → FAIL; implementar. IP vem de `req.ip`.
- [x] **Passo 4:** verificação padrão.

**Pronto quando:** 18 testes passam; códigos `CREDENCIAIS_INVALIDAS` e `CONTA_BLOQUEADA` cobertos.

**Commit:** `feat: login de cliente e funcionário com registro de tentativas e bloqueio (D3, D5, D19)`

---

## Tarefa 7: Refresh, logout e `eu`

**Arquivos:** modificar `src/modulos/auth/{auth.rotas,auth.controller,sessoes}.ts`; criar
`src/modulos/auth/auth.sessao.test.ts`.

**Interfaces:**
- Consome: `criarSessao`, `revogarTodasAsSessoes`, `definirCookieDeRefresh` (T6).
- Produz: `renovarSessao(contexto, tokenDoCookie): { accessToken; refreshToken; expiraEm }`;
  `encerrarSessao(contexto, sessaoId)`.

- [x] **Passo 1: testes que falham:**
  - `it('refresh com cookie e cabeçalho → 200 com accessToken e cookie novo')`
  - `it('refresh sem o cabeçalho X-DentAgenda-Refresh → 401 NAO_AUTENTICADO')` (D19, CSRF)
  - `it('refresh sem cookie → 401')`
  - `it('refresh vencido (cliente +30 dias) → 401')`
  - `it('o cookie anterior não funciona mais depois da rotação')`
  - `it('reapresentar token já revogado derruba todas as sessões da conta')` — duas sessões
    abertas; reusa a 1ª antiga; a 2ª passa a responder 401
  - `it('access token novo carrega o sessaoId da sessão nova')`
  - `it('logout → 204, revoga a sessão do sessaoId e apaga o cookie')`; refresh seguinte → 401
  - `it('logout sem token → 401')`
  - `it('eu → 200 { usuario } de cliente e de funcionário')`
- [x] **Passo 2:** `npm test` → FAIL; implementar.
- [x] **Passo 3:** verificação padrão.

**Pronto quando:** 10 testes passam.

**Commit:** `feat: refresh rotativo, logout e rota eu (D9, D19)`

---

## Tarefa 8: Códigos de verificação e recuperação de senha

**Arquivos:** criar `src/modulos/auth/{codigos,recuperacao.service}.ts`, `codigos.test.ts`,
`auth.recuperacao.test.ts`; modificar `auth.rotas.ts`, `auth.controller.ts`, `auth.schemas.ts`.

**Interfaces (produz):**
```ts
export const LIMITE_POR_HORA = 3;
export const LIMITE_POR_DIA = 5;
export const VALIDADE_CODIGO_MINUTOS = 10;
export const MAXIMO_TENTATIVAS_CODIGO = 3;

export function hashDoCodigo(codigo: string, contexto: Contexto): string;   // HMAC-SHA256 com CODIGO_HMAC_SEGREDO
// Confere o limite (lança 429 LIMITE_DE_CODIGOS), invalida códigos anteriores não usados da mesma
// finalidade, grava a linha e devolve o código em texto (só para quem vai enviar).
export function emitirCodigo(tx, contexto, pedido: {
  identificador: string; tipo: 'CLIENTE' | 'FUNCIONARIO';
  finalidade: 'RECUPERACAO' | 'ATIVACAO' | 'CADASTRO'; destino: string | null;
}): Promise<string>;
// Busca o código válido mais recente; código errado soma tentativa; lança 400 CODIGO_INVALIDO
// em qualquer falha (errado, expirado, usado, 3 tentativas, destino diferente); marca usadoEm.
export function consumirCodigo(tx, contexto, pedido: {
  identificador: string; tipo; finalidades: FinalidadeCodigo[]; codigo: string; destino?: string;
}): Promise<{ finalidade: FinalidadeCodigo }>;
```
Atenção: o incremento de `tentativas` precisa **sobreviver** ao erro 400 — gravar fora da
transação que é desfeita, ou responder sem lançar dentro dela.

- [ ] **Passo 1: testes que falham** — `codigos.test.ts`:
  - `it('4º pedido na mesma hora → 429 LIMITE_DE_CODIGOS')`
  - `it('6º pedido em 24 h, espaçados de 2 h → 429')`
  - `it('o limite soma finalidades diferentes do mesmo identificador')` (D25.3)
  - `it('código novo invalida o anterior da mesma finalidade')`
  - `it('código vencido (+11 min) → CODIGO_INVALIDO')`
  - `it('3 erros esgotam o código; o certo depois → CODIGO_INVALIDO')`
  - `it('código usado não vale de novo')`
  - `it('banco guarda HMAC, não o código')` (`codigoHash` ≠ código e tem 64 hex)
- [ ] **Passo 2: testes que falham** — `auth.recuperacao.test.ts`:
  - `it('cliente: pedido → 202 com a mensagem padrão e SMS no telefone cadastrado')`
  - `it('CPF inexistente → mesma resposta 202, grava linha sem envio')` (D19, D25.4)
  - `it('paciente sem Login → mesma resposta, sem envio')` (D25.4)
  - `it('funcionário: código vai para o e-mail')`; `it('funcionário inativo → 202 sem envio')`
  - `it('confirmar com código certo → 204; login com a senha nova funciona')`
  - `it('confirmar grava REDEFINICAO e desbloqueia cliente bloqueado')` (D5, D19)
  - `it('confirmar revoga todas as sessões')`
  - `it('confirmar com código errado → 400 CODIGO_INVALIDO')`
  - `it('novaSenha com 7 caracteres → 400 ENTRADA_INVALIDA')`
- [ ] **Passo 3:** `npm test` → FAIL; implementar. Mensagem padrão do 202 (api.md):
  *"Se os dados estiverem corretos, enviamos um código."*
- [ ] **Passo 4:** verificação padrão.

**Pronto quando:** 18 testes passam; `LIMITE_DE_CODIGOS` e `CODIGO_INVALIDO` cobertos.

**Commit:** `feat: códigos de verificação e recuperação de senha (D3, D19)`

---

## Tarefa 9: Autocadastro e ativação do paciente

**Arquivos:** criar `src/modulos/auth/{cadastro.service.ts,auth.cadastro.test.ts}`; modificar
`auth.rotas.ts`, `auth.controller.ts`, `auth.schemas.ts`.

**Interfaces:** consome `emitirCodigo`, `consumirCodigo` (T8), `criarSessao` (T6), `cpfValido` (T3).

- [ ] **Passo 1: testes que falham:**
  - `it('CPF novo → 202 e código CADASTRO no telefone informado')`
  - `it('CPF de paciente sem login → 202 e código ATIVACAO no telefone que a clínica tem, não no informado')` (D15)
  - `it('CPF com login → 202 e SMS de orientação ao telefone cadastrado, sem código válido')` (D25.5)
  - `it('as três respostas têm corpo idêntico')` (D19)
  - `it('confirmar CADASTRO → 201 logado; cria Cliente e Login; pacienteDesde = hoje')` (D4)
  - `it('confirmar CADASTRO com telefone diferente do que recebeu o código → 400 CODIGO_INVALIDO')` (D19)
  - `it('confirmar ATIVACAO cria só o Login; nome e telefone digitados não sobrescrevem')` (D20.6)
  - `it('CPF com dígito verificador errado → 400 ENTRADA_INVALIDA')` (D25.1)
  - `it('4º pedido na hora → 429')`
- [ ] **Passo 2:** `npm test` → FAIL; implementar. Código de `CADASTRO` com CPF que ganhou
  cadastro na recepção entre os dois passos → o CPF já existe: tratar como `CODIGO_INVALIDO`
  (o UNIQUE do banco recusa; mapear).
- [ ] **Passo 3:** verificação padrão.

**Pronto quando:** 9 testes passam; todas as 11 rotas de `auth` do api.md respondem.

**Commit:** `feat: autocadastro e ativação de paciente com verificação por SMS (D15, D19, D20)`

---

## Tarefa 10: Procedimentos

**Arquivos:** criar `src/modulos/procedimentos/{procedimentos.rotas,.controller,.service,.schemas,.test}.ts`;
modificar `src/app.ts`.

- [ ] **Passo 1: testes que falham:**
  - `it('GET de cliente traz só os ativos; de funcionário traz todos')`
  - `it('GET sem login → 401')`
  - `it('POST por admin → 201 { id, nome, duracaoMinutos, precoCentavos, ativo: true }')`
  - `it('POST por recepcionista sem isAdmin → 403 SEM_PERMISSAO')`
  - `it('POST com nome repetido → 409 NOME_JA_CADASTRADO')` (via `23505`)
  - `it('POST com duracaoMinutos 0 ou preço negativo → 400 ENTRADA_INVALIDA')`
  - `it('PATCH ativo=false some da lista do cliente')`
  - `it('PATCH duracaoMinutos não altera o fim de consulta já marcada')` (D13) — cria a consulta pelo Prisma
  - `it('PATCH de id inexistente → 404 NAO_ENCONTRADO')`
- [ ] **Passo 2:** `npm test` → FAIL; implementar.
- [ ] **Passo 3:** verificação padrão.

**Pronto quando:** 9 testes passam.

**Commit:** `feat: rotas de procedimentos (D11, D18)`

---

## Tarefa 11: Funcionários, dentistas e seeds

**Arquivos:** criar `src/modulos/funcionarios/{funcionarios.rotas,.controller,.service,.schemas,.test}.ts`,
`prisma/seed.ts`, `prisma/seed-dev.ts`, `src/modulos/funcionarios/seed.test.ts`; modificar `src/app.ts`.

**Interfaces (produz):** `semearAdminInicial(prisma, variaveis: NodeJS.ProcessEnv, hoje: Date): Promise<'criado' | 'ja-existe'>`;
`semearDadosDeDesenvolvimento(prisma, nodeEnv): Promise<void>` (lança se `nodeEnv === 'production'`).

- [ ] **Passo 1: testes que falham** — `funcionarios.test.ts`:
  - `it('GET /api/funcionarios por admin → lista sem senhaHash')`; `it('por não admin → 403')`
  - `it('POST cria com senha aleatória: login com qualquer senha falha')` (D21.1)
  - `it('POST DENTISTA sem cro → 422 CRO_OBRIGATORIO')`
  - `it('POST e-mail repetido → 409 EMAIL_JA_CADASTRADO')`, `it('CPF repetido → 409 CPF_JA_CADASTRADO')`,
    `it('CRO repetido → 409 CRO_JA_CADASTRADO')`
  - `it('POST com CPF inválido → 400')`
  - `it('PATCH ativo=false revoga as sessões; refresh dele → 401')` (D21.5)
  - `it('PATCH tirando isAdmin do último admin ativo → 422 ULTIMO_ADMIN')` (D10)
  - `it('PATCH desativando o último admin ativo → 422 ULTIMO_ADMIN')`
  - `it('PATCH categoria para DENTISTA sem cro → 422 CRO_OBRIGATORIO')`
  - `it('GET /api/dentistas por cliente → só dentistas ativos, [{ id, nome }]')`
- [ ] **Passo 2: testes que falham** — `seed.test.ts`:
  - `it('cria o admin com dataInicio = hoje e senha desconhecida')`
  - `it('não faz nada se já existe admin')`
  - `it('recusa variável ADMIN_INICIAL_* faltando, citando o nome')` (D25.12)
  - `it('DENTISTA sem ADMIN_INICIAL_CRO → recusa')`
  - `it('seed de desenvolvimento recusa NODE_ENV=production')` (spec, seção 10 item 6)
- [ ] **Passo 3:** `npm test` → FAIL; implementar. A checagem do último admin roda numa
  transação que trava as linhas de admin ativas (`SELECT … FOR UPDATE`), para dois admins não se
  removerem ao mesmo tempo.
- [ ] **Passo 4:** `seed-dev.ts` cria, com dados fictícios: 4 procedimentos (Avaliação 30 min
  R$ 120; Limpeza 60 min R$ 180; Restauração 60 min R$ 250; Clareamento 90 min R$ 600), uma
  dentista e uma recepcionista com e-mail `@exemplo.dev`, e grade da dentista seg–sex
  08:00–12:00 e 14:00–18:00. Pula o que já existe.
- [ ] **Passo 5:** verificação padrão + `npm run db:seed` e `npm run db:seed:dev` no banco de dev.

**Pronto quando:** 18 testes passam; seeds rodam duas vezes seguidas sem erro.

**Commit:** `feat: funcionários, lista de dentistas, seed do admin e seed fictício de dev (D10, D21, D23)`

---

## Tarefa 12: Pacientes — busca, cadastro, consulta e edição

**Arquivos:** criar `src/modulos/pacientes/{pacientes.rotas,.controller,.service,.schemas}.ts`,
`pacientes.test.ts`; modificar `src/app.ts`.

**Interfaces:** consome `cpfValido`, `esquemaPaginacao`, `paginar`. A busca sem acento usa
SQL bruto do Prisma:
```sql
SELECT id, nome, cpf, telefone, count(*) OVER() AS total
FROM "Cliente"
WHERE unaccent(lower(nome)) LIKE '%' || unaccent(lower($1)) || '%' OR cpf = $1
ORDER BY nome
LIMIT $2 OFFSET $3;
```

- [ ] **Passo 1: testes que falham:**
  - `it('busca "jose" acha "José da Silva"')`; `it('busca por CPF exato')`;
    `it('busca paginada devolve { itens, total }')`
  - `it('busca por cliente → 403')`
  - `it('POST pela recepção cria só Cliente, sem Login; pacienteDesde ausente = hoje')` (D4)
  - `it('POST com endereco cria EnderecoCliente')`
  - `it('POST com CPF repetido → 409 CPF_JA_CADASTRADO')`
  - `it('POST com endereco sem cidade → 400')`
  - `it('GET por dentista → 200 com endereco e temLogin')`
  - `it('GET de outro paciente pelo cliente → 404 NAO_ENCONTRADO')` (D20.5)
  - `it('PATCH pela recepção muda nome, telefone e pacienteDesde')`
  - `it('PATCH pelo cliente muda email, convenio e nascimento')`
  - `it('PATCH pelo cliente com telefone → 403 CAMPO_NAO_EDITAVEL')` (D21.2)
  - `it('PATCH com cpf → 422 CPF_IMUTAVEL, inclusive para o cliente')` (D25.7)
  - `it('PATCH pelo dentista → 403')`
- [ ] **Passo 2:** `npm test` → FAIL; implementar.
- [ ] **Passo 3:** verificação padrão.

**Pronto quando:** 15 testes passam.

**Commit:** `feat: rotas de pacientes com busca sem acento (D1, D4, D21)`

---

## Tarefa 13: Endereço e alertas do paciente

**Arquivos:** modificar `src/modulos/pacientes/{pacientes.rotas,.controller,.service,.schemas}.ts`;
criar `src/modulos/pacientes/alertas.test.ts`, `endereco.test.ts`.

- [ ] **Passo 1: testes que falham** — `endereco.test.ts`:
  - `it('PUT cria o endereço; segundo PUT substitui inteiro')`
  - `it('PUT sem complemento é aceito; sem cep → 400')`
  - `it('cliente faz PUT no próprio; no de outro → 404')`
  - `it('DELETE → 204 e GET do paciente traz endereco null')`
  - `it('dentista no PUT → 403')`
- [ ] **Passo 2: testes que falham** — `alertas.test.ts`:
  - `it('POST pelo cliente grava autor PACIENTE sem funcionário')`
  - `it('POST pela recepção grava autor CLINICA com o funcionário do token')`
  - `it('corpo com autor é ignorado: autor vem do token')`
  - `it('GET lista só ativos; incluirRemovidos=true traz removidos com quem removeu')`
  - `it('DELETE pelo dentista marca removidoEm, não apaga')`
  - `it('DELETE pelo cliente → 403')` (D18)
  - `it('DELETE de alerta de outro paciente pela URL → 404')`
- [ ] **Passo 3:** `npm test` → FAIL; implementar.
- [ ] **Passo 4:** verificação padrão.

**Pronto quando:** 12 testes passam; as 9 rotas de pacientes do api.md respondem.

**Commit:** `feat: endereço e alertas do paciente (D18)`

---

## Tarefa 14: Grade semanal

**Arquivos:** criar `src/modulos/disponibilidade/{disponibilidade.rotas,.controller,.schemas,grade.service}.ts`,
`grade.test.ts`; modificar `src/app.ts`.

**Interfaces (produz):**
```ts
export type Faixa = { diaSemana: number; inicio: string /* HH:mm */; fim: string };
export function lerGrade(contexto, dentistaId: string): Promise<Faixa[]>;
// faixas de um dia como instantes (usa instanteEmSaoPaulo)
export function faixasDoDia(grade: Faixa[], data: string): Intervalo[];
export function cabeNaGrade(grade: Faixa[], intervalo: Intervalo): boolean;
```
`TIME` do Prisma chega como `Date` em 1970-01-01 UTC: converter com `toISOString().slice(11, 16)`.

- [ ] **Passo 1: testes que falham:**
  - `it('PUT por admin substitui a semana e GET devolve a nova')`
  - `it('PUT com faixas sobrepostas no mesmo dia → 422 FAIXAS_SOBREPOSTAS')`
  - `it('faixas encostadas 08:00–12:00 e 12:00–14:00 são aceitas')`
  - `it('PUT com inicio >= fim → 422 FAIXA_INVALIDA')`
  - `it('PUT lista consultasForaDaGrade futuras e não cancela nenhuma')` (D12.5)
  - `it('PUT em id de recepcionista → 404')`
  - `it('PUT por recepcionista sem isAdmin → 403')`
  - `it('GET pelo próprio dentista → 200; da grade de outro → 404')`
  - `it('cabeNaGrade: consulta 11:30–12:30 numa faixa 08:00–12:00 → false')`
- [ ] **Passo 2:** `npm test` → FAIL; implementar (substituição numa transação: apaga e recria).
- [ ] **Passo 3:** verificação padrão.

**Pronto quando:** 9 testes passam.

**Commit:** `feat: grade semanal dos dentistas (D12)`

---

## Tarefa 15: Algoritmo de horários livres (puro)

**Arquivos:** criar `src/modulos/disponibilidade/horarios.ts`, `horarios.test.ts`.

**Interfaces (produz):**
```ts
// Intervalo vem de compartilhado/datas.ts (Tarefa 3)
export function sobrepoe(a: Intervalo, b: Intervalo): boolean;
export function horariosNoPasso(faixa: Intervalo, duracaoMinutos: number): Date[];
export function horariosLivresNoPasso(entrada: Entrada): Date[];
export function janelasLivres(entrada: Entrada): Intervalo[];
export function multiploDe5Minutos(instante: Date): boolean;
type Entrada = { faixas: Intervalo[]; ocupados: Intervalo[]; duracaoMinutos: number; agora: Date };
```

- [ ] **Passo 1: testes que falham** (exemplos da D12, horários de São Paulo):
  - `it('limpeza de 60 min em 08:00–12:00 → 08:00, 09:00, 10:00, 11:00')`
  - `it('avaliação 30 min ocupando 08:30–09:00 tira 08:00 da limpeza de 60')` (D12)
  - `it('horário que já passou não aparece')` (agora = 09:10 → 08:00 e 09:00 somem)
  - `it('consulta que não cabe inteira no fim da faixa não aparece')` (90 min em 08:00–12:00 → 08:00, 09:30)
  - `it('janela livre 08:30–10:00 entre duas consultas')`
  - `it('janela menor que a duração é descartada')`
  - `it('janela começa no próximo múltiplo de 5 min depois de agora')` (agora 09:07 → 09:10)
  - `it('bloqueio que cobre a faixa inteira zera horários e janelas')`
  - `it('multiploDe5Minutos: 08:05 sim, 08:07 não, 08:05:30 não')`
- [ ] **Passo 2:** `npm test` → FAIL.
- [ ] **Passo 3: implementar:**
  ```ts
  const MINUTO = 60_000;
  const CINCO_MINUTOS = 5 * MINUTO;

  export function sobrepoe(a: Intervalo, b: Intervalo): boolean {
    return a.inicio < b.fim && b.inicio < a.fim;
  }

  function somarMinutos(instante: Date, minutos: number): Date {
    return new Date(instante.getTime() + minutos * MINUTO);
  }

  export function horariosNoPasso(faixa: Intervalo, duracaoMinutos: number): Date[] {
    const horarios: Date[] = [];
    for (let inicio = faixa.inicio; somarMinutos(inicio, duracaoMinutos) <= faixa.fim;
      inicio = somarMinutos(inicio, duracaoMinutos)) {
      horarios.push(inicio);
    }
    return horarios;
  }

  export function horariosLivresNoPasso({ faixas, ocupados, duracaoMinutos, agora }: Entrada): Date[] {
    return faixas
      .flatMap((faixa) => horariosNoPasso(faixa, duracaoMinutos))
      .filter((inicio) => inicio >= agora)
      .filter((inicio) => {
        const candidato = { inicio, fim: somarMinutos(inicio, duracaoMinutos) };
        return !ocupados.some((ocupado) => sobrepoe(candidato, ocupado));
      });
  }

  function subtrair(faixa: Intervalo, ocupados: Intervalo[]): Intervalo[] {
    return ocupados.reduce<Intervalo[]>((pedacos, ocupado) => pedacos.flatMap((pedaco) => {
      if (!sobrepoe(pedaco, ocupado)) return [pedaco];
      const restos: Intervalo[] = [];
      if (pedaco.inicio < ocupado.inicio) restos.push({ inicio: pedaco.inicio, fim: ocupado.inicio });
      if (ocupado.fim < pedaco.fim) restos.push({ inicio: ocupado.fim, fim: pedaco.fim });
      return restos;
    }), [faixa]);
  }

  // O fuso de São Paulo tem deslocamento em horas inteiras, então múltiplo de 5 min em UTC
  // é múltiplo de 5 min no horário local.
  function arredondarPara5MinutosAcima(instante: Date): Date {
    return new Date(Math.ceil(instante.getTime() / CINCO_MINUTOS) * CINCO_MINUTOS);
  }

  export function janelasLivres({ faixas, ocupados, duracaoMinutos, agora }: Entrada): Intervalo[] {
    return faixas
      .flatMap((faixa) => subtrair(faixa, ocupados))
      .map((janela) => {
        const maisCedo = janela.inicio < agora ? agora : janela.inicio;
        return { inicio: arredondarPara5MinutosAcima(maisCedo), fim: janela.fim };
      })
      .filter((janela) => somarMinutos(janela.inicio, duracaoMinutos) <= janela.fim);
  }

  export function multiploDe5Minutos(instante: Date): boolean {
    return instante.getTime() % CINCO_MINUTOS === 0;
  }
  ```
- [ ] **Passo 4:** verificação padrão.

**Pronto quando:** 9 testes passam, sem banco.

**Commit:** `feat: cálculo de horários no passo e janelas de encaixe (D12, D22)`

---

## Tarefa 16: Bloqueios

**Arquivos:** criar `src/modulos/disponibilidade/{bloqueios.service.ts,bloqueios.test.ts}`,
`src/compartilhado/travas.ts`; modificar `disponibilidade.rotas.ts`, `.controller.ts`, `.schemas.ts`.

**Interfaces (produz):**
```ts
// travas.ts — D22.7; ordena os ids para dois pedidos em lote não travarem em ordem inversa
export async function travarDentistas(tx, dentistaIds: string[]): Promise<void>;
// SELECT id FROM "Funcionario" WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE
```

- [ ] **Passo 1: testes que falham:**
  - `it('recepção cria feriado para dois dentistas → 201 com dois bloqueios')`
  - `it('um dentista com consulta CONFIRMADA no período → 409 CONSULTAS_NO_PERIODO e nenhum bloqueio criado')` (D21.3)
  - `it('o 409 lista { id, dentistaId, inicio, paciente: { id, nome } }')` (D24.4)
  - `it('consulta CANCELADA no período não impede')`
  - `it('dentista bloqueando a própria agenda → 201')`
  - `it('dentista enviando id de outro dentista → 403 SEM_PERMISSAO')`
  - `it('cliente → 403')`
  - `it('inicio >= fim → 400')`
  - `it('GET de/ate pelo dentista: os próprios; de outro → 404')`
  - `it('DELETE apaga a linha → 204'); it('DELETE de bloqueio de outro dentista pelo dentista → 404')`
- [ ] **Passo 2:** `npm test` → FAIL; implementar. Dentro da transação: `travarDentistas` →
  busca consultas CONFIRMADAS sobrepostas → se houver, lança 409 com a lista → senão insere.
- [ ] **Passo 3:** verificação padrão.

**Pronto quando:** 11 testes passam; as rotas de bloqueio do api.md respondem.

**Commit:** `feat: bloqueios em lote, tudo ou nada, com trava do dentista (D12, D21, D22)`

---

## Tarefa 17: Horários livres e dias disponíveis (rotas)

**Arquivos:** criar `src/modulos/disponibilidade/{horarios.service.ts,horarios.rotas.test.ts}`;
modificar `disponibilidade.rotas.ts`, `.controller.ts`, `.schemas.ts`.

**Interfaces (produz):**
```ts
// ocupados = bloqueios + consultas não canceladas do dentista que tocam o dia
export function calcularDia(contexto, entrada: { dentistaId: string; procedimento: Procedimento; data: string },
  modo: 'passo' | 'encaixe'): Promise<{ horarios: Date[]; janelas: Intervalo[] }>;
```

- [ ] **Passo 1: testes que falham** — `horarios.rotas.test.ts` (relógio: segunda 2026-10-05 07:00 SP):
  - `it('cliente recebe só horarios no passo, sem janelasLivres')`
  - `it('recepção recebe horarios e janelasLivres')`
  - `it('sem dentistaId junta todos os dentistas ativos; dentista inativo fica de fora')`
  - `it('dentista sempre recebe só a própria agenda, mesmo pedindo outro id')`
  - `it('consulta CONFIRMADA e REALIZADA ocupam; CANCELADA não')` (spec, seção 10 item 5)
  - `it('bloqueio tira os horários')`
  - `it('saídas com fuso -03:00')`
  - `it('procedimento inativo → 404')` (D25.9)
  - `it('dias-disponiveis de outubro: dia todo bloqueado não aparece')`
  - `it('dias-disponiveis: dia só com janela fora do passo aparece para recepção e não para cliente')` (D25.8)
  - `it('mes inválido "2026-13" → 400')`
- [ ] **Passo 2:** `npm test` → FAIL; implementar.
- [ ] **Passo 3:** verificação padrão.

**Pronto quando:** 11 testes passam.

**Commit:** `feat: rotas de horários livres e dias disponíveis (D12, D22)`

---

## Tarefa 18: Criar consulta

**Arquivos:** criar `src/modulos/consultas/{consultas.rotas,.controller,.schemas,criacao.service,formato}.ts`,
`consultas.criacao.test.ts`; modificar `src/app.ts`.

**Interfaces (produz):**
```ts
// formato.ts — D24.3
export function formatarConsulta(consulta: ConsultaComRelacoes): ConsultaResposta;
// criacao.service.ts — recebe a transação para a remarcação reaproveitar (Tarefa 20)
export function criarConsultaNaTransacao(tx, contexto, usuario: UsuarioAutenticado, entrada: {
  pacienteId: string; dentistaId: string; procedimentoId: string; inicio: Date; observacao?: string;
}): Promise<Consulta>;
export function criarConsulta(contexto, usuario, entrada): Promise<ConsultaResposta>;
```
Dentro da transação, na ordem da D25.10: `travarDentistas(tx, [dentistaId])` → checagens →
`insert` com `fim = inicio + duracaoMinutos`, `status = CONFIRMADA`, `criadoEm = agora` → se houver
`observacao`, grava `HistoricoObservacao` na mesma transação (D18). Retroativa (R/D com
`inicio < agora`) pula grade, passo e bloqueio (D22.4).

- [ ] **Passo 1: testes que falham** — `consultas.criacao.test.ts` (relógio: segunda 2026-10-05
  07:00 SP; grade seg 08:00–12:00; limpeza 60 min):
  - `it('cliente marca às 09:00 → 201 CONFIRMADA, fim 10:00, formato D24.3')`
  - `it('cliente não envia pacienteId: vem do token')`
  - `it('cliente às 09:30 → 409 FORA_DO_PASSO')`
  - `it('cliente às 11:30 (passa das 12:00) → 409 FORA_DA_GRADE')`
  - `it('recepção encaixa às 09:35 → 201')`; `it('recepção às 09:37 → 409 FORA_DOS_5_MINUTOS')`
  - `it('dentista encaixa na própria agenda → 201; na de outro → 404')` (D10)
  - `it('horário em bloqueio → 409 HORARIO_BLOQUEADO')`
  - `it('outra consulta do dentista no intervalo → 409 HORARIO_INDISPONIVEL')`
  - `it('paciente já tem consulta com outro dentista no intervalo → 409 PACIENTE_COM_CONSULTA_NO_HORARIO')`
  - `it('cliente com horário no passado → 422 HORARIO_NO_PASSADO')`
  - `it('recepção registra retroativa fora da grade → 201 e aparece em pendentes')` (D22.4)
  - `it('retroativa sobreposta a outra consulta → 409 HORARIO_INDISPONIVEL')`
  - `it('dentista inativo → 422 DENTISTA_INATIVO'); it('procedimento inativo → 422 PROCEDIMENTO_INATIVO')`
  - `it('com observacao grava HistoricoObservacao com o autor do token')`
  - **Foco 1:** `it('grade seg 20:00–23:00 aceita 22:00 de segunda em SP (terça em UTC)')`
  - **Foco 2:** `it('dois POST simultâneos no mesmo horário → um 201 e um 409 HORARIO_INDISPONIVEL')` (`Promise.all`)
  - **Foco 3:** `it('POST de bloqueio e POST de consulta simultâneos no mesmo intervalo → só um é criado')`
- [ ] **Passo 2:** `npm test` → FAIL; implementar.
- [ ] **Passo 3:** verificação padrão.

**Pronto quando:** 19 testes passam; os 6 códigos de erro de horário do api.md cobertos.

**Commit:** `feat: criação de consulta com checagem de grade, passo, bloqueio e sobreposição (D12, D13, D22)`

---

## Tarefa 19: Listar, ver e pendentes

**Arquivos:** criar `src/modulos/consultas/{consulta.service.ts,consultas.leitura.test.ts}`;
modificar `consultas.rotas.ts`, `.controller.ts`, `.schemas.ts`.

**Interfaces (produz):** `buscarConsultaVisivel(contexto, usuario, id): Promise<ConsultaComRelacoes>` —
lança 404 se não existe **ou** se o usuário não pode vê-la (D10, D20.5); usado pelas tarefas 20 e 21.

- [ ] **Passo 1: testes que falham:**
  - `it('recepção filtra por de/ate (datas em SP), dentistaId, pacienteId e status')`
  - `it('lista paginada em ordem de inicio')`
  - `it('dentista recebe só a própria agenda, mesmo filtrando outro dentistaId')`
  - `it('cliente recebe só as próprias')`
  - `it('GET {id} de consulta de outro paciente pelo cliente → 404')`
  - `it('GET {id} de consulta de outro dentista pelo dentista → 404')`
  - `it('pendentes: CONFIRMADAS com fim no passado, mais antigas primeiro')` (D13.4)
  - `it('pendentes do dentista: só as dele'); it('pendentes pelo cliente → 403')`
- [ ] **Passo 2:** `npm test` → FAIL; implementar.
- [ ] **Passo 3:** verificação padrão.

**Pronto quando:** 9 testes passam.

**Commit:** `feat: listagem, detalhe e pendentes de consultas (D10, D13)`

---

## Tarefa 20: Cancelamento e remarcação

**Arquivos:** criar `src/modulos/consultas/{cancelamento.service.ts,consultas.cancelamento.test.ts}`;
modificar `consultas.rotas.ts`, `.controller.ts`, `.schemas.ts`, `criacao.service.ts` (só se a
assinatura precisar de ajuste).

**Interfaces (produz):**
```ts
export const ANTECEDENCIA_SEM_JUSTIFICATIVA_HORAS = 24;
export function cancelarConsultaNaTransacao(tx, contexto, usuario, consultaId: string,
  justificativa?: string): Promise<Consulta>;
```
Regras na ordem: visível (404) → `status ≠ CONFIRMADA` → 422 `CONSULTA_NAO_CANCELAVEL` → C com
`agora ≥ inicio` → 422 `CONSULTA_JA_INICIADA` → C com `inicio − agora < 24 h` sem justificativa →
422 `JUSTIFICATIVA_OBRIGATORIA`. Clínica cancelou → SMS ao paciente **depois** do commit (D14.5).
Remarcação: uma transação com `cancelarConsultaNaTransacao` e depois `criarConsultaNaTransacao`
(mesmo paciente; dentista e procedimento da original quando ausentes). Clínica → um SMS com o
horário novo (D25.11).

- [ ] **Passo 1: testes que falham:**
  - `it('cliente cancela com 48 h sem justificativa → 200, canceladoPor PACIENTE')`
  - **Foco 5:** `it('cliente exatamente 24 h antes sem justificativa → 200')`
  - **Foco 5:** `it('cliente 23 h 59 min antes sem justificativa → 422 JUSTIFICATIVA_OBRIGATORIA')`
  - `it('com justificativa e 2 h antes → 200')`
  - `it('cliente depois do início → 422 CONSULTA_JA_INICIADA')`
  - `it('recepção cancela depois do início sem justificativa → 200 e SMS ao paciente')`
  - `it('cancelar CANCELADA ou REALIZADA → 422 CONSULTA_NAO_CANCELAVEL')`
  - `it('dentista cancela consulta de outro dentista → 404')`
  - `it('horário cancelado volta a aparecer em horarios-livres')`
  - `it('remarcação → 201 { cancelada, nova }')`
  - **Foco 4:** `it('remarcar 30 min para frente, sobrepondo a original → 201')`
  - `it('remarcação para horário ocupado → 409 e a original continua CONFIRMADA')` (D22.1)
  - `it('remarcação pelo cliente com menos de 24 h sem justificativa → 422 e nada muda')`
  - `it('remarcação pela recepção manda um SMS com o horário novo')`
- [ ] **Passo 2:** `npm test` → FAIL; implementar.
- [ ] **Passo 3:** verificação padrão.

**Pronto quando:** 14 testes passam.

**Commit:** `feat: cancelamento com regra de 24 h e remarcação atômica (D14, D22)`

---

## Tarefa 21: Realização e observação

**Arquivos:** criar `src/modulos/consultas/{observacao.service.ts,consultas.realizacao.test.ts,consultas.observacao.test.ts}`;
modificar `consultas.rotas.ts`, `.controller.ts`, `.schemas.ts`.

- [ ] **Passo 1: testes que falham** — realização:
  - `it('dentista marca a própria depois do início → 200 REALIZADA')`
  - `it('antes do início → 422 CONSULTA_NAO_INICIADA')`
  - `it('consulta CANCELADA → 422 CONSULTA_NAO_CONFIRMADA')`
  - `it('recepção marca de qualquer dentista; cliente → 403')`
  - `it('REALIZADA sai de pendentes')`
- [ ] **Passo 2: testes que falham** — observação:
  - `it('PUT pelo dentista grava observacao e linha CLINICA no histórico')`
  - `it('PUT pelo cliente grava linha PACIENTE sem funcionário')`
  - `it('texto null apaga a observação e grava linha com texto null')`
  - `it('histórico guarda a versão anterior depois que o paciente sobrescreve')`
  - `it('GET histórico: mais recente primeiro, funcionario { id, nome } ou null')`
  - `it('cliente em consulta de outro → 404')`
- [ ] **Passo 3:** `npm test` → FAIL; implementar (observação e histórico na mesma transação).
- [ ] **Passo 4:** verificação padrão.

**Pronto quando:** 11 testes passam; as 9 rotas de consultas do api.md respondem.

**Commit:** `feat: marcação de realizada e observação com histórico (D10, D13, D18)`

---

## Tarefa 22: Swagger

**Arquivos:** criar `src/compartilhado/openapi.ts`, `src/compartilhado/openapi.test.ts`;
modificar `src/app.ts` e os `*.rotas.ts` (exportar `rotasDocumentadas<Dominio>` se ainda não
exportam).

- [ ] **Passo 1: conferir no context7** a lib que gera OpenAPI a partir da versão do Zod
  instalada (D23: compatibilidade). Candidatas: conversão nativa do Zod para JSON Schema +
  `swagger-ui-express`, ou uma lib Zod→OpenAPI. Escolher a de menos dependências que suporte a
  versão instalada; registrar a escolha na mensagem de commit.
- [ ] **Passo 2: testes que falham:**
  - `it('GET /api/docs.json fora de produção → 200 com todas as rotas do api.md')` — compara o
    conjunto `metodo + caminho` com uma lista das 43 rotas no próprio teste
  - `it('GET /api/docs fora de produção → 200 HTML')`
  - `it('com NODE_ENV=production, /api/docs e /api/docs.json → 404 NAO_ENCONTRADO')` (D23)
- [ ] **Passo 3:** `npm test` → FAIL; implementar.
- [ ] **Passo 4:** verificação padrão + abrir `http://localhost:<PORTA>/api/docs` com `npm run dev`.

**Pronto quando:** 3 testes passam; Swagger abre no navegador.

**Commit:** `feat: documentação Swagger gerada dos schemas Zod, só fora de produção (D23)`

---

## Tarefa 23: Proxy do Vite, verificação final e documentação

**Arquivos:** modificar `vite.config.js` (raiz), `CLAUDE.md` (raiz: estado real e comandos do
backend), `docs/documentacao.md` ("Próximo"); criar `backend/scripts/conferir-codigos-de-erro.ts`.

- [ ] **Passo 1:** proxy no Vite (D19, D23):
  ```js
  // vite.config.js
  export default defineConfig({
    plugins: [react()],
    server: {
      // D19: front e API no mesmo site para o cookie SameSite=Strict chegar ao refresh
      proxy: { '/api': 'http://localhost:3000' },
    },
  })
  ```
  (`3000` = valor de `PORTA` em `backend/.env`; se o usuário usar outro, ajustar aqui.)
- [ ] **Passo 2: script de cobertura dos códigos de erro** (critério de pronto da D23):
  ```ts
  // backend/scripts/conferir-codigos-de-erro.ts
  import { readFileSync, readdirSync } from 'node:fs';
  import { join } from 'node:path';
  import { fileURLToPath } from 'node:url';

  const contrato = readFileSync(new URL('../../docs/api.md', import.meta.url), 'utf8');

  function codigosDoContrato(texto: string): Set<string> {
    const codigos = new Set<string>();
    for (const linha of texto.split('\n')) {
      const aposStatus = /\*\*\d{3}\*\*\s+((?:`[A-Z_]+`\s*\/?\s*)+)/.exec(linha);
      const linhaDaTabela = /^\|\s*`([A-Z_]+)`\s*\|/.exec(linha);
      const emAspas = linha.matchAll(/codigo: "([A-Z_]+)"/g);
      if (aposStatus) for (const [, codigo] of aposStatus[1].matchAll(/`([A-Z_]+)`/g)) codigos.add(codigo);
      if (linhaDaTabela) codigos.add(linhaDaTabela[1]);
      for (const [, codigo] of emAspas) codigos.add(codigo);
    }
    return codigos;
  }

  function textoDosTestes(pasta: string): string {
    return readdirSync(pasta, { recursive: true, encoding: 'utf8' })
      .filter((arquivo) => arquivo.endsWith('.test.ts'))
      .map((arquivo) => readFileSync(join(pasta, arquivo), 'utf8'))
      .join('\n');
  }

  const testes = textoDosTestes(fileURLToPath(new URL('../src', import.meta.url)));
  const semTeste = [...codigosDoContrato(contrato)].filter((codigo) => !testes.includes(`'${codigo}'`));
  if (semTeste.length > 0) {
    console.error(`Códigos de erro sem teste: ${semTeste.join(', ')}`);
    process.exit(1);
  }
  console.log('Todo código de erro do api.md tem teste.');
  ```
  Script `"conferir:codigos": "tsx scripts/conferir-codigos-de-erro.ts"` no `package.json`.
- [ ] **Passo 3:** rodar `npm run conferir:codigos`; se faltar código, voltar à tarefa dona e
  acrescentar o teste (TDD: o teste falha primeiro, se o comportamento ainda não existir).
- [ ] **Passo 4: ponta a ponta manual:** `docker compose up -d`, `npm run db:migrate`,
  `npm run db:seed`, `npm run db:seed:dev`, `npm run dev` no backend e `npm run dev` na raiz;
  pela aba Network do navegador em `http://localhost:5173`, `POST /api/auth/funcionario/recuperacao/codigo`
  chega ao backend pelo proxy (código aparece no log).
- [ ] **Passo 5:** atualizar `CLAUDE.md` ("Backend: não existe" → existe; comandos do backend) e
  "Próximo" da documentação.
- [ ] **Passo 6:** verificação padrão + `npm run build` (o build não pode incluir `testes/`).

**Pronto quando:** `conferir:codigos` passa; lint, typecheck, testes e build passam; proxy funciona.

**Commit:** `chore: proxy /api no Vite, conferência dos códigos de erro e docs atualizados`
