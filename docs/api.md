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
