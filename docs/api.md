# Contrato da API — DentAgenda

Contrato entre o backend e o front. As decisões por trás de cada regra estão em
`docs/documentacao.md` (número entre parênteses). Ainda não implementado.

## Convenções (D20)

- **Base:** `/api`, sem versão.
- **Formato:** JSON. Datas em ISO 8601 com fuso (`2026-10-05T14:30:00-03:00`); datas sem hora
  em `AAAA-MM-DD`. Dinheiro em centavos inteiros (`18000` = R$ 180,00).
- **IDs:** UUID.
- **Autenticação:** `Authorization: Bearer <accessToken>`. O refresh token anda só no cookie
  `httpOnly` (D19).
- **CPF** trafega só com dígitos (`12345678900`); **telefone** só com dígitos, com DDD.

### Erros

Todo erro tem o mesmo formato:

```json
{ "erro": { "codigo": "HORARIO_INDISPONIVEL", "mensagem": "Texto para exibir ao usuário." } }
```

| Status | Quando                                                       |
|--------|--------------------------------------------------------------|
| 400    | Entrada inválida (validação Zod). `codigo: "ENTRADA_INVALIDA"` |
| 401    | Sem login, token expirado ou credencial errada              |
| 403    | Logado, mas o papel não permite (D10)                        |
| 404    | Recurso não existe — ou existe e o usuário não pode vê-lo    |
| 409    | Conflito de horário                                          |
| 422    | Regra de negócio violada (ex.: justificativa obrigatória)    |
| 423    | Conta bloqueada (D5, D19)                                    |
| 429    | Limite de pedidos de código atingido (D19)                   |

*404 para "existe mas não pode ver":* responder 403 confirmaria que o recurso existe.

### Objeto `usuario`

Devolvido no login e em `GET /api/auth/eu`:

```json
{ "id": "uuid", "tipo": "CLIENTE", "nome": "Marcos Oliveira" }
{ "id": "uuid", "tipo": "FUNCIONARIO", "nome": "Ana Costa", "categoria": "DENTISTA", "isAdmin": false }
```

### Senha

8 a 72 caracteres, sem regra de composição (D20).

### Paginação

Listas que crescem sem limite (pacientes, consultas) aceitam `?pagina=1&porPagina=20`
(máximo 100) e respondem `{ "itens": [...], "total": 123 }`. Listas pequenas (procedimentos,
dentistas, grade) devolvem o array direto.

### Papéis nas tabelas abaixo (D10)

**R** = recepcionista · **D** = dentista · **A** = admin (`isAdmin`, somado às permissões da
categoria) · **C** = o próprio cliente (só os próprios dados). Chamada fora do papel → 403;
recurso de outro paciente/dentista → 404 (D20).

---

## Autenticação (`auth`)

Todas as rotas abaixo são públicas, exceto `logout` e `eu`.

### `POST /api/auth/cliente/login` (D3, D5)

```json
{ "cpf": "12345678900", "senha": "..." }
```

- **200** `{ "accessToken": "...", "usuario": {...} }` + cookie de refresh (30 dias).
- **401** `CREDENCIAIS_INVALIDAS` — CPF inexistente e senha errada recebem a mesma resposta.
- **423** `CONTA_BLOQUEADA` — 3 falhas desde o último acerto; só sai redefinindo a senha.

### `POST /api/auth/funcionario/login` (D2, D3, D5)

```json
{ "email": "ana@colzani.com.br", "senha": "..." }
```

- **200** igual ao do cliente; `usuario` traz `categoria` e `isAdmin`. Refresh de 12 h.
- **401** `CREDENCIAIS_INVALIDAS`. Funcionário com `ativo = false` também recebe 401.
- **423** `CONTA_BLOQUEADA` — 15 min a partir da 3ª falha.

### `POST /api/auth/refresh` (D9, D19)

Sem corpo. Exige o cookie de refresh **e** o cabeçalho `X-DentAgenda-Refresh: 1`.

- **200** `{ "accessToken": "..." }` + cookie novo (o anterior é revogado).
- **401** token ausente, expirado ou revogado. Token já revogado reapresentado → todas as
  sessões da conta são revogadas.

### `POST /api/auth/logout`

- **204** revoga a sessão atual e apaga o cookie.

### `GET /api/auth/eu`

- **200** `{ "usuario": {...} }`.

### Autocadastro do paciente (D15, D19)

**1. `POST /api/auth/cliente/cadastro/codigo`**

```json
{ "cpf": "12345678900", "telefone": "11987654321" }
```

- **202** sempre a mesma resposta: *"Se os dados estiverem corretos, enviamos um código."*
  - CPF novo → código por SMS no telefone informado (finalidade `CADASTRO`).
  - CPF de paciente sem login → código no telefone **que a clínica tem** (finalidade `ATIVACAO`).
  - CPF que já tem login → SMS orientando a usar "Recuperar senha".
- **429** `LIMITE_DE_CODIGOS` — mais de 3 pedidos na última hora ou 5 no dia.

**2. `POST /api/auth/cliente/cadastro/confirmar`**

```json
{
  "cpf": "12345678900",
  "telefone": "11987654321",
  "codigo": "123456",
  "senha": "...",
  "nome": "Marcos Oliveira",
  "email": "marcos@email.com",
  "nascimento": "1985-05-15"
}
```

`email` e `nascimento` são opcionais.

- **201** igual ao login (`accessToken`, `usuario`, cookie) — o paciente sai logado.
  - `CADASTRO`: cria `Cliente` + `Login`. O `telefone` precisa ser o mesmo para onde o código foi.
  - `ATIVACAO`: cria só o `Login`. Nome, telefone e demais dados do cadastro da clínica **não**
    são sobrescritos pelo que foi digitado.
- **400** `CODIGO_INVALIDO` — errado, expirado, já usado ou com 3 tentativas. Mesma resposta
  para todos os casos.

### Recuperação de senha (D3, D19)

**1. `POST /api/auth/cliente/recuperacao/codigo`** — `{ "cpf": "..." }`
**1. `POST /api/auth/funcionario/recuperacao/codigo`** — `{ "email": "..." }`

- **202** sempre: *"Se os dados estiverem corretos, enviamos um código."* Cliente recebe por
  SMS; funcionário, por e-mail (simulados no MVP — D16).
- **429** `LIMITE_DE_CODIGOS`.

**2. `POST /api/auth/cliente/recuperacao/confirmar`** — `{ "cpf", "codigo", "novaSenha" }`
**2. `POST /api/auth/funcionario/recuperacao/confirmar`** — `{ "email", "codigo", "novaSenha" }`

- **204** senha trocada; grava `REDEFINICAO` em `TentativaLogin` (desbloqueia a conta) e
  revoga todas as sessões.
- **400** `CODIGO_INVALIDO`.

Não existe rota que só verifica o código: a tela de recuperação continua em etapas, mas envia
código e senha nova juntos no final (D20).

---

## Pacientes (`pacientes`)

| Rota                                              | Quem     |
|---------------------------------------------------|----------|
| `GET /api/pacientes?busca=`                       | R, D     |
| `POST /api/pacientes`                             | R        |
| `GET /api/pacientes/{id}`                         | R, D, C  |
| `PATCH /api/pacientes/{id}`                       | R, C     |
| `PUT /api/pacientes/{id}/endereco`                | R, C     |
| `DELETE /api/pacientes/{id}/endereco`             | R, C     |
| `GET /api/pacientes/{id}/alertas`                 | R, D, C  |
| `POST /api/pacientes/{id}/alertas`                | R, D, C  |
| `DELETE /api/pacientes/{id}/alertas/{alertaId}`   | R, D     |

### `GET /api/pacientes?busca=`

`busca` procura em nome (parcial, sem acento/maiúscula) e CPF (exato). Paginado.
**200** `{ "itens": [{ "id", "nome", "cpf", "telefone" }], "total" }`.

### `POST /api/pacientes` (D1, D4, D18)

Cadastro feito pela recepção (paciente por telefone). Cria só `Cliente`, sem `Login`.

```json
{
  "nome": "Marcos Oliveira",
  "cpf": "12345678900",
  "telefone": "11987654321",
  "email": "marcos@email.com",
  "nascimento": "1985-05-15",
  "convenio": "Unimed Odonto",
  "pacienteDesde": "2019-03-01",
  "endereco": { "cep": "01001000", "logradouro": "...", "numero": "123", "complemento": null,
                "bairro": "...", "cidade": "São Paulo", "uf": "SP" }
}
```

Opcionais: `email`, `nascimento`, `convenio` (ausente = particular), `endereco`,
`pacienteDesde` (ausente = hoje).

- **201** paciente criado.
- **409** `CPF_JA_CADASTRADO`. (Aqui não há enumeração a evitar: só a recepção chama.)

### `GET /api/pacientes/{id}`

**200** todos os campos de `Cliente` + `endereco` (ou `null`) + `temLogin` (boolean).

### `PATCH /api/pacientes/{id}` (D21)

Envia só os campos a mudar.

- **R:** qualquer campo, exceto `cpf`.
- **C:** só `email`, `convenio`, `nascimento`. Outro campo no corpo → **403** `CAMPO_NAO_EDITAVEL`.

`cpf` nunca muda → **422** `CPF_IMUTAVEL`.

### `PUT /api/pacientes/{id}/endereco` · `DELETE /api/pacientes/{id}/endereco` (D18)

`PUT` cria ou substitui o endereço inteiro (todos os campos obrigatórios, exceto `complemento`).
`DELETE` remove. **200** / **204**.

### Alertas (D18)

- `GET /api/pacientes/{id}/alertas` — ativos; `?incluirRemovidos=true` traz também os removidos,
  com quem removeu.
- `POST /api/pacientes/{id}/alertas` — `{ "texto": "Alergia à Penicilina" }`. O autor
  (`PACIENTE`/`CLINICA`) vem do token, não do corpo. **201**.
- `DELETE /api/pacientes/{id}/alertas/{alertaId}` — só funcionário; marca `removidoEm`, não apaga
  a linha. **204**.

---

## Funcionários (`funcionarios`)

| Rota                              | Quem              |
|-----------------------------------|-------------------|
| `GET /api/funcionarios`           | A                 |
| `POST /api/funcionarios`          | A                 |
| `PATCH /api/funcionarios/{id}`    | A                 |
| `GET /api/dentistas`              | qualquer logado   |

### `POST /api/funcionarios` (D2, D10, D18, D21)

```json
{
  "nome": "Ana Costa",
  "cpf": "98765432100",
  "email": "ana@colzani.com.br",
  "categoria": "DENTISTA",
  "cro": "SP-12345",
  "dataInicio": "2026-10-01",
  "isAdmin": false
}
```

Não recebe senha. A conta nasce com uma senha aleatória que ninguém conhece; o funcionário
define a dele em "Recuperar senha" (e-mail, simulado no MVP — D16).

- **201** funcionário criado.
- **409** `EMAIL_JA_CADASTRADO` / `CPF_JA_CADASTRADO` / `CRO_JA_CADASTRADO`.
- **422** `CRO_OBRIGATORIO` — categoria `DENTISTA` sem `cro`.

### `PATCH /api/funcionarios/{id}`

Qualquer campo do `POST`, mais `ativo`.
- Desativar (`ativo: false`) revoga todas as sessões do funcionário (D19).
- **422** `ULTIMO_ADMIN` — tirar `isAdmin` ou desativar o último admin ativo (D10).

### `GET /api/dentistas`

Dentistas ativos, para o paciente escolher. **200** `[{ "id", "nome" }]`.

---

## Procedimentos (`procedimentos`)

| Rota                               | Quem             |
|------------------------------------|------------------|
| `GET /api/procedimentos`           | qualquer logado  |
| `POST /api/procedimentos`          | A                |
| `PATCH /api/procedimentos/{id}`    | A                |

- `GET` → `[{ "id", "nome", "duracaoMinutos", "precoCentavos", "ativo" }]`. Cliente recebe só
  os ativos; funcionário recebe todos.
- `POST` → `{ "nome", "duracaoMinutos", "precoCentavos" }`. **409** `NOME_JA_CADASTRADO`.
- `PATCH` → qualquer campo + `ativo`. Não existe `DELETE` (D18). Mudar `duracaoMinutos` não
  altera consultas já marcadas (`fim` guardado — D13).

---

## Grade semanal (`disponibilidade`)

| Rota                                 | Quem                   |
|--------------------------------------|------------------------|
| `GET /api/dentistas/{id}/grade`      | R, A, D (a própria)    |
| `PUT /api/dentistas/{id}/grade`      | A                      |

### `PUT /api/dentistas/{id}/grade` (D12)

Substitui a semana inteira do dentista.

```json
[
  { "diaSemana": 1, "inicio": "08:00", "fim": "12:00" },
  { "diaSemana": 1, "inicio": "14:00", "fim": "18:00" }
]
```

`diaSemana`: 0 = domingo … 6 = sábado. Horários no fuso `America/Sao_Paulo`.

- **200** `{ "grade": [...], "consultasForaDaGrade": [{ "id", "inicio", "fim", "paciente" }] }` —
  nada é cancelado sozinho; a lista é para a recepção resolver (D12.5).
- **422** `FAIXAS_SOBREPOSTAS` / `FAIXA_INVALIDA` (`inicio >= fim`).
- **404** se o id não for de um dentista.

---

## Bloqueios (`disponibilidade`)

| Rota                                          | Quem                      |
|-----------------------------------------------|---------------------------|
| `GET /api/dentistas/{id}/bloqueios?de=&ate=`  | R, D (os próprios)        |
| `POST /api/bloqueios`                         | R, D (só o próprio id)    |
| `DELETE /api/bloqueios/{id}`                  | R, D (os próprios)        |

### `POST /api/bloqueios` (D12, D18)

```json
{ "dentistaIds": ["uuid-1", "uuid-2"], "inicio": "2026-12-24T00:00:00-03:00", "fim": "2026-12-26T00:00:00-03:00" }
```

Um bloqueio por dentista, criados juntos (feriado em lote). **Tudo ou nada:** se um dentista
tiver consulta CONFIRMADA no período, nenhum bloqueio é criado.

- **201** `[{ "id", "dentistaId", "inicio", "fim" }]`.
- **409** `CONSULTAS_NO_PERIODO` com `consultas: [{ "id", "dentistaId", "inicio", "paciente" }]`.
- **403** dentista enviando id de outro dentista.

### `DELETE /api/bloqueios/{id}`

Apaga a linha — nada aponta para bloqueio. **204**.
