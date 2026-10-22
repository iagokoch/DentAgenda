# Ponta a ponta — da grade da dentista à consulta realizada

Fechamento da Tarefa 23. O mesmo fluxo existe automatizado em
`backend/src/e2e/ponta-a-ponta.test.ts` (roda no `npm test` do backend, contra o banco de teste, com relógio fixo).
Este documento é a versão manual, para conferir no navegador com o banco de desenvolvimento.

## 0. Preparar

No PowerShell, com o Docker Desktop aberto e `backend/.env` criado (veja o README):

```powershell
cd backend
docker compose up -d
npm run db:migrate
npm run db:seed          # admin inicial (ADMIN_INICIAL_* do .env)
npm run db:seed:dev      # Dra. Ana Costa, Carla Souza (recepção) e 4 procedimentos
npm run dev              # API; deixe este terminal aberto: os códigos de verificação saem aqui
```

Em outro terminal, na raiz: `npm run dev` e abra `http://localhost:5173`.

**Senhas:** nenhuma conta tem senha conhecida. Em "Esqueci minha senha", informe o e-mail
(`ADMIN_INICIAL_EMAIL`, `ana.costa@exemplo.dev` ou `carla.souza@exemplo.dev`); o código de 6 dígitos aparece no log
da API. Ao pedir o código pela tela, confira na aba Network que `POST /api/auth/funcionario/recuperacao/codigo` saiu
para `localhost:5173` e chegou à API pelo proxy do Vite (resposta 202).

## 1. Definir a grade da dentista (admin)

O `db:seed:dev` já deixa a Ana com seg–sex, 08:00–12:00 e 14:00–18:00. Para conferir a rota, redefina a grade:

- **Pela tela** (depois do Bloco 3): entre como admin → Administração → Grade semanal → Dra. Ana Costa.
- **Pela API:** em `http://localhost:3000/api/docs`, `POST /api/auth/funcionario/login` com o e-mail e a senha do
  admin; copie o `accessToken`, clique em **Authorize** e cole. Em `GET /api/dentistas` pegue o id da Ana e chame
  `PUT /api/dentistas/{id}/grade` com:

  ```json
  [
    { "diaSemana": 1, "inicio": "08:00", "fim": "12:00" },
    { "diaSemana": 1, "inicio": "14:00", "fim": "18:00" },
    { "diaSemana": 3, "inicio": "08:00", "fim": "12:00" }
  ]
  ```

**Esperado:** 200 com `grade` e `consultasForaDaGrade: []`.

## 2. Marcar uma consulta (recepção)

Entre como Carla. Em Pacientes → Novo paciente, cadastre um paciente fictício (CPF válido, ex.: `39053344705`).
No perfil dele, **Agendar Consulta**: escolha Limpeza, a Dra. Ana Costa, uma segunda-feira futura e 09:00. Confirme.

**Esperado:** a tela de Detalhes da Consulta abre com status "Confirmada", 09:00–10:00.

## 3. Tentar o mesmo horário (409)

Cadastre um segundo paciente e tente marcar Limpeza com a Ana no **mesmo dia e horário**. A tela não oferece o
horário ocupado; para ver o 409, use o Swagger: `POST /api/consultas` com o `pacienteId` do segundo paciente e o mesmo
`dentistaId`, `procedimentoId` e `inicio` da consulta do passo 2.

**Esperado:** 409 `HORARIO_INDISPONIVEL`, e nenhuma consulta criada.

## 4. Remarcar

Em Detalhes da Consulta do passo 2, **Remarcar** → escolha 10:00 do mesmo dia → confirme.

**Esperado:** abre a consulta nova (10:00, Confirmada); a original aparece como Cancelada no Histórico do paciente,
cancelada pela clínica. No log da API, um SMS simulado ao paciente com o horário novo.

## 5. Cancelar

Marque outra consulta para o segundo paciente e, em Detalhes, **Cancelar consulta**. A clínica não precisa de
justificativa (só o paciente, a menos de 24 h).

**Esperado:** status Cancelada, e SMS simulado ao paciente no log.

## 6. Registrar observação

Entre como Ana (dentista). Abra a consulta das 10:00 e escreva uma observação; salve. Edite de novo.

**Esperado:** o texto aparece na consulta e o histórico lista as duas versões, a mais recente primeiro, com o nome da
Ana.

## 7. Marcar como realizada

Antes do horário de início, o botão **Marcar como realizada** fica desabilitado (a API responderia 422
`CONSULTA_NAO_INICIADA`). Para conferir sem esperar o dia, marque pelo Swagger uma consulta **no passado** (recepção
e dentista podem registrar atendimento já acontecido — D22): o Início passa a avisar que uma consulta "já passou e
ainda não foi marcada como realizada". Abra essa consulta e clique em **Marcar como realizada**.

**Esperado:** status Realizada; o Início volta a dizer "Nenhuma consulta pendente de registro."

## Resultado

Anote a data e quem conferiu. Diferenças entre o esperado e o que a tela mostrou viram issue no GitHub.

| Data | Quem | Resultado |
|------|------|-----------|
|      |      |           |
