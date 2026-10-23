# Pendências com a Colzani Odontologia

Perguntas que só a clínica pode responder. Cada uma bloqueia ou ajusta uma decisão de
`docs/documentacao.md` (número entre parênteses). Levar para a próxima conversa com a
clínica; anotar a resposta embaixo da pergunta e depois atualizar a decisão correspondente.

## 1. Pacientes

- [ ] As crianças atendidas têm CPF? A partir de que idade a clínica tem o CPF delas? (D1.1)
  - Resposta:
- [ ] A clínica atende estrangeiros sem CPF? Com que frequência? (D1.1)
  - Resposta:
- [ ] Os pacientes antigos têm registro em papel da data em que começaram na clínica? (D4)
  - Resposta:
- [ ] Paciente que troca de telefone costuma avisar a clínica? (D15 — ativação de conta
  depende do telefone cadastrado)
  - Resposta:

## 2. Procedimentos

- [ ] Lista dos procedimentos oferecidos, com duração média e preço de cada um. (D11)
  - Resposta:
- [ ] Algum procedimento só é feito por um dentista específico (especialista)? (D11)
  - Resposta:

## 3. Agenda dos dentistas

- [ ] Quantos dentistas atendem e em quais dias/horários cada um? (D12)
  - Resposta:
- [ ] Em feriados e recessos a clínica fecha inteira, ou alguns dentistas atendem? (D12)
  - Resposta:
- [ ] Hoje a recepção faz "encaixes" fora dos horários padrão? (D12 — passo dos horários)
  - Resposta:

## 4. Equipe e acesso

- [ ] Quem administra o sistema? O dono também atende como dentista? (D10)
  - Resposta:
- [ ] Um dentista precisa ver a agenda dos outros dentistas? (D10)
  - Resposta:
- [ ] Quem pode ver informações de saúde do paciente (histórico, observações)? (D10, D13 — LGPD)
  - Resposta:
- [ ] Quem registra que a consulta foi realizada: o dentista ou a recepção? (D13)
  - Resposta:

## 5. Cancelamento

- [ ] Hoje existe alguma regra ou consequência para cancelamento em cima da hora? (D14)
  - Resposta:
- [ ] Quando a clínica cancela, como o paciente é avisado hoje? (D14)
  - Resposta:

## 6. Produto e produção (surgiram na F3 e no fechamento)

- [ ] O "Valor Estimado" de uma consulta deve poder ser editado pela clínica, ou é sempre o preço do procedimento? (D33)
  - Resposta:
- [ ] O paciente vai marcar, ver e cancelar as próprias consultas pelo sistema? Ou só a recepção agenda? (D30, D33)
  - Resposta:
- [ ] Qual provedor de SMS e de e-mail a clínica aceita contratar, e quem paga? Sem isso a API não sobe em produção. (D16)
  - Resposta:
- [ ] Por quanto tempo a clínica quer guardar tentativas de login, códigos de verificação e sessões antigas? (LGPD, D40)
  - **Valor provisório no código: 90 dias** (`RETENCAO_DIAS`, rotina `npm run limpar:dados`). Trocar o padrão em
    `backend/src/config/env.ts` e na D40 quando a clínica responder. Efeito colateral a explicar: uma falha de login mais
    velha que o prazo deixa de contar para o bloqueio da conta.
  - Resposta:
- [ ] O que é um paciente "ativo": quem teve consulta nos últimos meses? Quantos? Hoje o Início só mostra o total de
  cadastrados. (D33)
  - Resposta:
- [ ] A recepção precisa marcar consulta fora do passo dos horários (encaixe de 5 em 5 minutos) pela tela? A API já
  oferece as janelas livres. (D22, D33)
  - Resposta:
