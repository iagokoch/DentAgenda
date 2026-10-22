# Matriz de papéis por rota

Quem pode chamar cada rota e o que acontece com quem não pode (issue #5, D10, D39). É o `docs/api.md` em forma de
tabela: o teste `backend/src/matriz-de-papeis.test.ts` confere que esta tabela, as colunas "Quem" do `api.md` e o código
dizem a mesma coisa, e chama cada rota com cada papel.

**Papéis:** **Anônimo** = sem token · **R** = recepcionista · **R-admin** = recepcionista com `isAdmin` (admin é flag
somada à categoria, D10) · **D** = dentista · **C** = paciente (cliente).

**Legenda:** **✓** = o papel passa pela checagem de acesso (a resposta depende do resto: 200, 400, 404…) · **401** =
`NAO_AUTENTICADO` · **403** = `SEM_PERMISSAO`.

Regras que a tabela não mostra, porque dependem do recurso e não do papel (D20):
- **D** só age na própria agenda e **C** só nos próprios dados: recurso de outro dentista ou paciente → **404**
  `NAO_ENCONTRADO`, para não confirmar que ele existe.
- `POST /api/auth/refresh` é pública, mas a sessão vem do cookie de refresh: sem cookie → 401 para qualquer papel.
- `PATCH /api/pacientes/{id}` por **C** com campo que ele não edita → 403 `CAMPO_NAO_EDITAVEL`; `POST /api/bloqueios`
  por **D** com id de outro dentista → 403. São regras do corpo, não do papel.

## API

| Rota | Anônimo | R | R-admin | D | C |
|------|---------|---|---------|---|---|
| `POST /api/auth/cliente/login` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /api/auth/funcionario/login` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /api/auth/refresh` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /api/auth/logout` | 401 | ✓ | ✓ | ✓ | ✓ |
| `GET /api/auth/eu` | 401 | ✓ | ✓ | ✓ | ✓ |
| `POST /api/auth/cliente/cadastro/codigo` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /api/auth/cliente/cadastro/confirmar` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /api/auth/cliente/recuperacao/codigo` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /api/auth/funcionario/recuperacao/codigo` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /api/auth/cliente/recuperacao/confirmar` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /api/auth/funcionario/recuperacao/confirmar` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/pacientes` | 401 | ✓ | ✓ | ✓ | 403 |
| `POST /api/pacientes` | 401 | ✓ | ✓ | 403 | 403 |
| `GET /api/pacientes/{id}` | 401 | ✓ | ✓ | ✓ | ✓ |
| `PATCH /api/pacientes/{id}` | 401 | ✓ | ✓ | 403 | ✓ |
| `PUT /api/pacientes/{id}/endereco` | 401 | ✓ | ✓ | 403 | ✓ |
| `DELETE /api/pacientes/{id}/endereco` | 401 | ✓ | ✓ | 403 | ✓ |
| `GET /api/pacientes/{id}/alertas` | 401 | ✓ | ✓ | ✓ | ✓ |
| `POST /api/pacientes/{id}/alertas` | 401 | ✓ | ✓ | ✓ | ✓ |
| `DELETE /api/pacientes/{id}/alertas/{alertaId}` | 401 | ✓ | ✓ | ✓ | 403 |
| `GET /api/funcionarios` | 401 | 403 | ✓ | 403 | 403 |
| `POST /api/funcionarios` | 401 | 403 | ✓ | 403 | 403 |
| `PATCH /api/funcionarios/{id}` | 401 | 403 | ✓ | 403 | 403 |
| `GET /api/dentistas` | 401 | ✓ | ✓ | ✓ | ✓ |
| `GET /api/procedimentos` | 401 | ✓ | ✓ | ✓ | ✓ |
| `POST /api/procedimentos` | 401 | 403 | ✓ | 403 | 403 |
| `PATCH /api/procedimentos/{id}` | 401 | 403 | ✓ | 403 | 403 |
| `GET /api/dentistas/{id}/grade` | 401 | ✓ | ✓ | ✓ | 403 |
| `PUT /api/dentistas/{id}/grade` | 401 | 403 | ✓ | 403 | 403 |
| `GET /api/dentistas/{id}/bloqueios` | 401 | ✓ | ✓ | ✓ | 403 |
| `POST /api/bloqueios` | 401 | ✓ | ✓ | ✓ | 403 |
| `DELETE /api/bloqueios/{id}` | 401 | ✓ | ✓ | ✓ | 403 |
| `GET /api/horarios-livres` | 401 | ✓ | ✓ | ✓ | ✓ |
| `GET /api/dias-disponiveis` | 401 | ✓ | ✓ | ✓ | ✓ |
| `POST /api/consultas` | 401 | ✓ | ✓ | ✓ | ✓ |
| `GET /api/consultas` | 401 | ✓ | ✓ | ✓ | ✓ |
| `GET /api/consultas/pendentes` | 401 | ✓ | ✓ | ✓ | 403 |
| `GET /api/consultas/{id}` | 401 | ✓ | ✓ | ✓ | ✓ |
| `POST /api/consultas/{id}/cancelamento` | 401 | ✓ | ✓ | ✓ | ✓ |
| `POST /api/consultas/{id}/remarcacao` | 401 | ✓ | ✓ | ✓ | ✓ |
| `POST /api/consultas/{id}/realizacao` | 401 | ✓ | ✓ | ✓ | 403 |
| `PUT /api/consultas/{id}/observacao` | 401 | ✓ | ✓ | ✓ | ✓ |
| `GET /api/consultas/{id}/observacao/historico` | 401 | ✓ | ✓ | ✓ | ✓ |

## Front (D35, D37)

A tela só esconde; quem garante o acesso é a API. Funcionário numa tela que o papel não abre volta para `/inicio`;
paciente numa tela da clínica vai para `/minha-conta`; anônimo vai para `/login` (`src/sessao/rotas.jsx`, testado em
`rotas.test.jsx`).

| Rota do front | Anônimo | R | R-admin | D | C |
|---------------|---------|---|---------|---|---|
| `/login`, `/cadastro`, `/recuperar-senha` | ✓ | → início | → início | → início | → minha conta |
| `/inicio`, `/agenda`, `/pacientes`, `/pacientes/:id`, `/consultas/:id` | → login | ✓ | ✓ | ✓ | → minha conta |
| `/pacientes/novo` | → login | ✓ | ✓ | → início | → minha conta |
| `/disponibilidade` | → login | ✓ (lê a grade, bloqueia todos) | ✓ (edita a grade) | ✓ (só a própria) | → minha conta |
| `/admin/equipe`, `/admin/procedimentos` | → login | → início | ✓ | → início | → minha conta |
| `/minha-conta`, `/minha-conta/agendar` | → login | → início | → início | → início | ✓ |
