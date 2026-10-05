# Spec — Backend do MVP do DentAgenda

Visão geral para revisão do grupo. Não repete regras: aponta para a decisão (`Dx` em
`docs/documentacao.md`) e para o contrato (`docs/api.md`). Em caso de conflito, valem esses
dois documentos.

## 1. Objetivo

Dar ao front uma API que permita à Colzani Odontologia e aos seus pacientes **marcar, ver,
cancelar e remarcar consultas sem conflito de horário**, com login por papel. Sucesso =
todas as rotas de `docs/api.md` implementadas, cada código de erro coberto por teste (D23) e
a regra de sobreposição garantida pelo banco (D6).

## 2. Escopo

**Dentro do MVP** (README, "Próximos passos sugeridos", detalhado em D1–D23):

1. Autenticação de paciente e funcionário: login, refresh, logout, autocadastro/ativação,
   recuperação de senha (D3, D5, D9, D15, D19, D20).
2. Rotas protegidas por papel (D10).
3. Consultas: criar, listar, ver, cancelar, remarcar, marcar realizada, observação com
   histórico (D13, D14, D18, D22).
4. O que as consultas exigem para existir: pacientes (com endereço e alertas), funcionários,
   procedimentos, grade semanal, bloqueios e horários livres (D11, D12, D18, D21).
5. Ambiente: Docker Compose, seed do primeiro admin, Swagger fora de produção, proxy `/api`
   no Vite (D8, D23).
6. Front ligado à API em três fatias — autenticação, pacientes, agenda e consultas — nas 8
   telas do Figma (D30).

**Fora do MVP:**

- Abas Documentos (upload) e Financeiro do perfil do paciente (`CLAUDE.md`).
- Telas além das 8 do Figma (D30).
- Provedor real de SMS/e-mail (D16), status `FALTOU` (D13), regra de bloqueio por IP (D19),
  limites de agendamento por paciente (D12), `DentistaProcedimento` (D11), preço copiado
  para a consulta (D11), vínculo entre consulta remarcada e original (D22).

## 3. Arquitetura

Estrutura de pastas e convenções em **D23**; camadas em **D17**.

```
front (Vite :5173) ──/api (proxy)──▶ Express (backend/)
   rota ─ autenticação + papel (D10)
   controller ─ valida com Zod, traduz para HTTP
   service ─ regra de negócio; usa relógio e mensageria injetáveis
   Prisma ─▶ PostgreSQL (Docker) ─ exclusion constraints e CHECKs (D6, D18)
middleware de erro único ─ formato `{ erro: { codigo, mensagem } }` (D20, D23)
```

- **Pasta:** `backend/` com `package.json` próprio (D8). Domínios: `auth`, `pacientes`,
  `funcionarios`, `procedimentos`, `disponibilidade`, `consultas` (D17).
- **Código em português** (D23). IDs em UUID (D20).
- **Tempo:** `timestamptz` em UTC; grade lida em `America/Sao_Paulo` (D18). O código pede
  "agora" a um relógio injetável (D23).
- **Mensageria:** interface única; no MVP grava no log e o servidor recusa subir com ela em
  produção (D16, D23).
- **Segredos:** só em variáveis de ambiente validadas na subida (D23). No repositório, só
  `backend/.env.example` com os nomes.

## 4. Entidades

Colunas, restrições e o porquê de cada uma: **D18** (domínio) e **D19** (autenticação).
O rascunho `backend/schema` foi apagado na Tarefa 2; o schema real é `backend/prisma/schema.prisma`.

| Tabela               | Para que serve                                         | Decisão        |
|----------------------|--------------------------------------------------------|----------------|
| `Cliente`            | Paciente, com ou sem login                             | D1, D1.1, D4   |
| `EnderecoCliente`    | Endereço opcional, 1:1                                 | D18            |
| `AlertaCliente`      | Risco clínico; removido sem apagar                     | D18            |
| `Login`              | Senha do paciente que tem conta                        | D1             |
| `Funcionario`        | Recepcionista/dentista, `isAdmin`, `ativo`             | D2, D10, D18   |
| `Procedimento`       | Duração e preço de exibição, `ativo`                   | D11, D18       |
| `GradeHorario`       | Faixas semanais por dentista                           | D12, D18       |
| `Bloqueio`           | Período sem atendimento de um dentista                 | D12, D18       |
| `Consulta`           | Agendamento e seus estados                             | D13, D14, D18  |
| `HistoricoObservacao`| Toda versão de `Consulta.observacao`                   | D18            |
| `TentativaLogin`     | Uma linha por tentativa; base do bloqueio de conta     | D5, D19        |
| `CodigoVerificacao`  | Códigos de recuperação, ativação e cadastro            | D3, D15, D19   |
| `RefreshToken`       | Sessões revogáveis                                     | D9, D19        |

## 5. Papéis e permissões

Papéis em **D10**; quem chama cada rota nas tabelas de `docs/api.md`; dado clínico na tabela
"Permissões sobre dado clínico" da **D18**. Três regras transversais:

1. **Admin é flag**, não papel exclusivo: soma-se às permissões da categoria. O sistema
   recusa ficar sem admin ativo (D10).
2. **Escopo por dono:** dentista só age na própria agenda; paciente só nos próprios dados (D10).
3. **Fora do papel → 403; recurso de outro → 404**, para não confirmar que ele existe (D20).

## 6. Fluxos principais

| Fluxo                                   | Rotas (`docs/api.md`)                                   | Decisões            |
|-----------------------------------------|---------------------------------------------------------|---------------------|
| Login, renovação e saída                | `auth/*/login`, `auth/refresh`, `auth/logout`, `auth/eu`| D3, D5, D9, D19     |
| Autocadastro / ativação do paciente     | `auth/cliente/cadastro/codigo` → `/confirmar`           | D15, D19, D20       |
| Recuperação de senha                    | `auth/*/recuperacao/codigo` → `/confirmar`              | D3, D19, D20        |
| Primeiro acesso de funcionário e admin  | seed / `POST funcionarios` → recuperação de senha       | D21, D23            |
| Paciente agenda                         | `procedimentos` → `dias-disponiveis` → `horarios-livres` → `POST consultas` | D12, D13, D22 |
| Recepção/dentista agenda ou encaixa     | `pacientes?busca=` → `horarios-livres` (com `janelasLivres`) → `POST consultas` | D12, D22 |
| Cancelar / remarcar                     | `consultas/{id}/cancelamento`, `/remarcacao`            | D14, D22            |
| Fechar o atendimento                    | `consultas/pendentes`, `/realizacao`, `/observacao`     | D10, D13, D18       |
| Montar a agenda dos dentistas           | `dentistas/{id}/grade`, `bloqueios`                     | D12, D21            |

## 7. Regras críticas

**Garantidas pelo banco** (migration SQL escrita à mão, `btree_gist` — D6):

1. Dentista sem duas consultas não canceladas sobrepostas (exclusion constraint).
2. Paciente sem duas consultas não canceladas sobrepostas (exclusion constraint).
3. CHECKs de coerência listados em D18 (cancelamento, autor, CRO do dentista, justificativa
   de menos de 24 h) e D19 (uma conta por refresh, máximo de 3 tentativas por código).

**Garantidas no service, dentro de transação:**

1. `dentistaId` aponta para funcionário DENTISTA e ativo (D18).
2. Criar consulta e criar bloqueio travam a linha do dentista (`SELECT … FOR UPDATE`), porque
   a constraint não compara `Consulta` com `Bloqueio` (D22.7).
3. Bloqueio em lote é tudo ou nada (D21.3); faixas da grade não se sobrepõem (D18).
4. Escrita em `Consulta.observacao` grava `HistoricoObservacao` na mesma transação (D18).
5. Remarcação cancela e cria numa transação só (D22.1).

**Segurança** (D19, D20, D23): senha em bcrypt (8–72 caracteres), código em HMAC, refresh em
SHA-256; respostas de recuperação e autocadastro não revelam se a conta existe; log com
campos sensíveis trocados por `[OCULTO]`.

## 8. Testes e critério de pronto

Detalhes em **D23**:

- TDD: o teste da regra falha antes do código que a implementa.
- Vitest + Supertest contra `dentagenda_test` no mesmo Docker; arquivos em série; banco limpo
  antes de cada arquivo.
- **Pronto** = todo código de erro de `docs/api.md` com pelo menos um teste, e `lint`,
  `typecheck` e `test` passando.

## 9. Riscos técnicos já conhecidos

1. **Prisma não declara exclusion constraint nem CHECK** (D6). Ficam na migration SQL; o erro
   `23P01` chega como erro do Prisma e é traduzido pelo nome da constraint (D23).
2. **Lib Zod → OpenAPI** precisa ser compatível com a versão do Zod instalada — conferir na
   documentação antes de instalar (D23).

## 10. A confirmar

Interpretações já registradas nos documentos, mas ainda não confirmadas pelo grupo de forma
explícita. A implementação segue o texto abaixo até alguém contestar.

1. **Consulta retroativa** (registrada pela clínica com horário no passado) não checa grade
   nem bloqueio; só sobreposição (D22.4).
2. **Encaixe em múltiplos de 5 min** vale para recepção **e** dentista; só o paciente fica
   preso ao passo da duração (D12.3, D22.3).
3. **Dentista cria e cancela consultas só na própria agenda** (D10).
4. **Endereço em tabela 1:1 separada** (`EnderecoCliente`), pelo mesmo motivo da D1 (D18).
5. **Horário livre desconta consultas não canceladas** (CONFIRMADA e REALIZADA), como em D18 e
   `docs/api.md`. A D12 dizia só "CONFIRMADAS" e foi corrigida; a diferença aparece quando uma consulta
   é marcada REALIZADA antes do fim — o resto do horário dela não pode virar livre.
6. **Dados fictícios de desenvolvimento** (procedimentos, um dentista, grade) entram num seed
   **separado** do seed do primeiro admin (D23), que continua criando só o admin. O seed
   fictício recusa rodar com `NODE_ENV=production`, como a mensageria de log (D16).

## 11. Pendências externas (não bloqueiam o código)

Perguntas para a Colzani em `docs/pendencias-colzani.md`: D11.1 (lista de procedimentos),
D11.3 (especialistas), D15.3 (paciente trocou de telefone), D18 (`dataInicio` do funcionário).
Até lá, o desenvolvimento usa dados fictícios (item 6 da seção 10).
