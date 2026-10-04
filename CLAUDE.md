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
- **Backend: não existe.** Nenhum Express, nenhum Prisma, nenhum `schema.prisma`,
  nenhum MySQL. O `package.json` tem só as três dependências do front.
  `backend/schema` é um rascunho em texto, ainda sendo alinhado às decisões D1.1–D5;
  em caso de conflito, vale `docs/documentacao.md`.
- A stack pretendida (Node + Express + Prisma + MySQL + JWT) é **intenção declarada**,
  ainda não justificada nem instalada.

## Comandos

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
npm run lint     # oxlint
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
  schema        Rascunho do modelo em texto (ainda não é Prisma)
docs/
  documentacao.md   Registro de decisões de arquitetura e modelagem
```

## Escopo do MVP do backend

Definido pelo README (seção "Próximos passos sugeridos"), que é o contrato do grupo:

1. API de autenticação
2. Rotas protegidas por perfil (dentista/recepção vs. cliente)
3. CRUD de consultas (criar, ver, editar, cancelar)

**Fora do MVP:** aba Documentos (upload de arquivo) e aba Financeiro. Continuam como
placeholder no front (`TabPlaceholder` em `PerfilPaciente.jsx`).

## Convenções de trabalho

- **Design antes de código.** Modelagem antes de migration, contrato de API antes de
  rota, camadas antes de detalhe.
- **Toda decisão de modelagem ou de contrato vai para `docs/documentacao.md`** antes
  de virar código — com o quê, por quê e a alternativa descartada. O projeto é em
  grupo; decisão não registrada é decisão que o outro dev não consegue contestar.
- **Não invente campo sem justificativa.** Se não dá pra explicar por que a coluna
  existe e o que quebra sem ela, ela não entra no schema.
- **Cuidado com dado do protótipo.** Os valores em `Agenda.jsx` (tabela de preços,
  lista de horários) e em `PerfilPaciente.jsx` (paciente, histórico) são fictícios e
  hardcoded. Não são requisito — mas as **estruturas** que eles implicam são, e
  várias ainda não foram decididas. Veja `docs/documentacao.md`.

## Armadilhas conhecidas no front-end

Coisas que já cravaram decisão de modelagem sem ninguém ter decidido:

- `Agenda.jsx` — `procedures` é um objeto com preço em string (`'180,00'`), hardcoded.
- `Agenda.jsx` — `times` é uma lista fixa 08:00–15:00 com `11:30` e `12:00` `disabled`
  no código; não há noção de disponibilidade real.
- `Agenda.jsx` — `confirm()` sempre confirma. Não há conflito, erro nem validação.
- `PerfilPaciente.jsx` — dentista é string livre (`'Dr. Silva'`, `'Dra. Ana Costa'`).
- `PerfilPaciente.jsx` — status da consulta só tem `REALIZADA` e `CANCELADA`.
- `AppShell.jsx` — o profissional logado é `Dr. Silva` hardcoded; não existe conceito
  de papel/perfil em lugar nenhum do código.
- `Cadastro.jsx` — cria conta com e-mail e senha apenas.
