# Decisões de design — DentAgenda backend

Cada decisão tem status. **Fechada** pode virar schema/código. **Parcial** tem itens em
"Em aberto" que precisam fechar antes de virar código.

| #    | Decisão                                         | Status                       |
|------|-------------------------------------------------|------------------------------|
| D1   | Separação entre Cliente e Login                 | Fechada                      |
| D1.1 | Identificação e contato do Cliente              | Fechada (pendência Colzani)  |
| D2   | Funcionário autentica pela própria tabela       | Fechada quanto à autenticação|
| D3   | Autenticação em dois endpoints                  | Fechada                      |
| D4   | `pacienteDesde`                                 | Fechada                      |
| D5   | Registro de tentativas de login                 | Fechada                      |
| D6   | Banco de dados: PostgreSQL                      | Fechada                      |
| D7   | Linguagem: TypeScript no Node                   | Fechada                      |
| D8   | Repositório e ambiente de desenvolvimento       | Fechada                      |
| D9   | Sessão: JWT curto + refresh revogável           | Fechada                      |
| D10  | Papéis e administração                          | Fechada                      |
| D11  | Procedimento                                    | Parcial                      |
| D12  | Disponibilidade dos dentistas                   | Fechada                      |
| D13  | Consulta: criação e estados                     | Fechada                      |
| D14  | Cancelamento e remarcação                       | Fechada                      |
| D15  | Ativação de conta de paciente já cadastrado     | Parcial                      |
| D16  | SMS e e-mail simulados no MVP                   | Fechada                      |
| D17  | Framework HTTP e organização do código          | Fechada                      |
| D18  | Modelo de dados do domínio                      | Parcial                      |
| D19  | Tabelas e regras de autenticação                | Fechada                      |
| D20  | Convenções da API e rotas de autenticação       | Fechada                      |
| D21  | Rotas de cadastro                               | Fechada                      |
| D22  | Rotas de horários livres e consultas            | Fechada                      |
| D23  | Estrutura do código, erros, testes e ambiente   | Fechada                      |
| D24  | Códigos de erro genéricos e objetos de resposta | Fechada                      |
| D25  | Regras de implementação não fixadas antes       | Fechada                      |
| D26  | Postgres do Docker na porta 5433 do host        | Fechada                      |
| D27  | Login: a 3ª falha e o tempo de resposta         | Fechada                      |
| D28  | E-mail sempre em minúsculas                     | Fechada                      |
| D29  | Rotação do refresh mantém o prazo da sessão     | Fechada                      |
| D30  | Front integrado à API em fatias                 | Fechada                      |

## D1 — Separação entre Cliente e Login

> **Status: fechada.**

**O quê:**
Duas tabelas: `Cliente` (cliente.id, nome, cpf, telefone, e-mail, nascimento, convênio, criadoEm, pacienteDesde) e `Login` (id, clienteId FK único para Cliente.id, senha). Nem todo cliente tem linha em Login. A ligação entre as duas é o `clienteId`, não o e-mail.

**Por quê:**
"Senha obrigatória só se tiver login" é uma regra condicional que NOT NULL não expressa numa tabela única. Exemplo: paciente cadastrado por telefone pela secretária não tem login — senha ficaria null nele, e nada no banco distingue esse caso de um bug (login sem senha). Numa tabela onde toda linha É um login, senha volta a ser NOT NULL de verdade, garantido pelo banco.

**Alternativa descartada:**
Tabela única `Cliente` com `senha` nullable. Quebrava porque não havia como o schema garantir "todo login tem senha" — a regra ficava só no código da aplicação.

## D1.1 — Identificação e contato do Cliente

> **Status: fechada**, com uma pendência externa (Colzani).
> Substitui a versão anterior ("e-mail mora só em `Cliente`"), que usava o e-mail para login.

**O quê:**
- `cpf`: UNIQUE, NOT NULL. É o identificador de login do cliente.
- `email`: só contato. Nullable, sem UNIQUE.
- `telefone`: NOT NULL, sem UNIQUE. É o canal de recuperação de senha (ver D3).
- `criadoEm`: data em que a linha de `Cliente` foi criada.

**Por quê:**
CPF é um por pessoa; e-mail e telefone são compartilhados em família (a mãe coloca os dela no cadastro do filho), então não identificam ninguém. O telefone é sempre informado — pela secretária ou no autocadastro. O CPF começa NOT NULL porque relaxar depois é uma migration trivial; endurecer depois exigiria que toda linha já tivesse valor.

**Alternativas descartadas:**
- *Login por e-mail:* ambíguo quando mãe e filho compartilham e-mail e os dois têm login.
- *`cpf` nullable:* viraria a regra condicional "CPF obrigatório só para quem tem login", que a D1 recusou.
- *`telefone` UNIQUE:* impede cadastrar o filho com o telefone da mãe — mesmo motivo que tirou o UNIQUE do e-mail.

**Pendente (Colzani):**
- A clínica atende crianças. Verificar se as que ela atende têm CPF (certidões recentes já saem com CPF — confirmar a partir de quando).
- A clínica atende estrangeiros sem CPF? Se sim, revisar o NOT NULL.

## D2 — Funcionário autentica pela própria tabela

> **Status: fechada** quanto à autenticação. Demais campos de `Funcionario` e permissões por categoria ainda não definidos.

**O quê:**
Tabela `Funcionario` com `email` (corporativo) UNIQUE NOT NULL, `senha` NOT NULL e `categoria` ∈ {RECEPCIONISTA, DENTISTA}. Não existe tabela de login separada para funcionário.

**Por quê:**
A separação da D1 existe porque nem todo cliente tem login. Todo funcionário tem, então nenhuma linha teria senha nula e o NOT NULL garante a regra direto. Ter mais dados do funcionário na tabela não é motivo para separar a senha.

**Alternativa descartada:**
Tabela `LoginFuncionario` espelhando a D1 — uma tabela a mais sem nenhuma regra a mais para garantir.

**Em aberto:**
- O que cada categoria (e o cliente) pode fazer — matriz de permissões. Parcialmente
  decidida na D10; o restante depende de D13 e D14.

## D3 — Autenticação em dois endpoints

> **Status: fechada** (pendências resolvidas pela D16 e pela D19).

**O quê:**
- Login de cliente (CPF + senha) e login de funcionário (e-mail + senha) são endpoints separados. Identificador em formato inválido → erro, sem tentar autenticar.
- CPF/e-mail inexistente e senha errada recebem a **mesma** mensagem de erro.
- Recuperação de senha **entra no MVP**: cliente recebe código por SMS no telefone cadastrado; funcionário, por e-mail. Código de 6 dígitos, válido por 10 min, 3 tentativas.
- ~~Mais de 4 pedidos de código → erro e espera de 5 min.~~ Substituído pela D19: no máximo
  3 pedidos por hora e 5 por dia por identificador.

**Por quê:**
- *Endpoints separados:* cliente e funcionário precisam de regras de proteção diferentes. Todos os funcionários saem pelo mesmo IP público da clínica (NAT), então bloqueio por IP no login de funcionário travaria a recepção inteira. Endpoints separados deixam cada regra explícita, sem adivinhar o tipo de usuário pelo formato do identificador.
- *Mensagem única:* evita enumeração de contas — o atacante não descobre quais CPFs/e-mails existem.
- *Recuperação no MVP:* login sem recuperação não é login completo.

**Alternativa descartada:**
Um endpoint só, detectando o formato do identificador.

**Em aberto:**
1. ~~Limite de pedidos de código.~~ Fechado pela D19 (a regra antiga permitia ~1.150 SMS/dia por CPF).
2. ~~Endpoint de recuperação também pode vazar enumeração.~~ Fechado pela D19: resposta sempre igual.
3. ~~Onde o código de recuperação fica guardado. Cliente e funcionário recebem código — uma
   tabela com FK para quem?~~ Fechado pela D19: `CodigoVerificacao`, sem FK (decidido junto com
   o código de ativação da D15 e o refresh token da D9).
4. ~~Provedor de SMS e de e-mail.~~ Fechado para o MVP pela D16 (envio simulado).

## D4 — `pacienteDesde`

> **Status: fechada.**

**O quê:**
`pacienteDesde` em `Cliente` significa "início do vínculo com a clínica". Paciente novo: data do cadastro. Paciente antigo (histórico em papel, anterior ao sistema): informada pela secretária. A secretária pode corrigir o valor depois.

**Por quê:**
Quem se cadastra já é paciente, mesmo que falte à primeira consulta. O histórico anterior ao sistema não está em `Consulta`, e a secretária é a fonte confiável dessa data — o paciente pode não lembrar.

**Alternativa descartada:**
Derivar da primeira consulta. Quem se cadastrou e faltou também é paciente, e o histórico em papel nunca estaria em `Consulta`.

**Em aberto:**
1. ~~Para paciente novo o valor repete `criadoEm`. Justificar por que aqui é aceitável.~~
   Fechado: não é o mesmo fato. `criadoEm` é quando a linha nasceu e nunca muda; `pacienteDesde`
   é um dado de negócio editável. Os dois divergem exatamente no paciente antigo — por isso os dois existem.
2. ~~Nulabilidade.~~ Fechado: **NOT NULL**, começa com a data do cadastro (autocadastro ou
   recepção) e a recepção corrige depois. Nenhum NULL com significado escondido.

## D5 — Registro de tentativas de login

> **Status: fechada** (pendências resolvidas pela D19).

**O quê:**
Tabela de eventos com uma linha por tentativa de login (cliente e funcionário): identificador digitado (texto, **sem FK**), IP, data/hora e resultado (sucesso/falha). Acertos também são gravados.
- *Bloqueio da conta:* 3 falhas com o mesmo identificador depois do último acerto → conta bloqueada até redefinir a senha.
  Para **funcionário**, o bloqueio dura 15 min (D19).
- ~~*Bloqueio por IP:* só no endpoint de cliente (ver D3).~~ Fora do MVP (D19).

**Por quê:**
O fato registrado é a tentativa, não a pessoa — por isso CPF inexistente também é gravado e bloqueia igual, sem permitir enumeração pelo comportamento do bloqueio. Acertos ficam gravados porque marcam o ponto a partir do qual se contam as falhas e preservam o histórico de ataque.

**Alternativas descartadas:**
- *Contador em `Login`/`Cliente`:* não registra CPF inexistente.
- *Gravar a senha digitada:* tentativas erradas costumam ser quase-senhas e vazariam em texto puro.
- *Apagar as linhas no acerto:* perde o histórico ("alguém tentou invadir a conta do Marcos ontem?").
- *Bloqueio permanente desbloqueado pela secretária:* qualquer um com o CPF de um paciente travaria a conta dele e a recepção.

**Em aberto:**
1. ~~Regra por IP.~~ Fechado pela D19: fora do MVP.
2. ~~Identificador em uma coluna ou duas?~~ Fechado pela D19: uma coluna + `tipo`.
3. ~~Como a redefinição de senha aparece no registro.~~ Fechado pela D19: linha com resultado `REDEFINICAO`.
4. ~~O bloqueio "até redefinir" vale também para funcionário?~~ Fechado pela D19: não, 15 min.

## D6 — Banco de dados: PostgreSQL

> **Status: fechada.**
> Substitui a intenção declarada de MySQL, que nunca chegou a ser justificada.

**O quê:**
PostgreSQL como banco do backend.

**Por quê:**
O conflito de horário (D12, D13) é a regra mais importante do agendamento, e o PostgreSQL
consegue garanti-la no próprio banco: uma *exclusion constraint* sobre
(dentista, intervalo `[inicio, fim)`) recusa duas consultas confirmadas sobrepostas do mesmo
dentista — inclusive quando dois pedidos chegam ao mesmo tempo (paciente pelo sistema e
recepção pelo telefone, no mesmo horário). É o mesmo princípio da D1: a regra fica garantida
pelo banco, não só pelo código.

**Alternativa descartada:**
MySQL. Não tem exclusion constraint; a regra de sobreposição ficaria só na aplicação
(transação + lock), e um bug no código vira consulta dupla.

**Custo aceito:**
O Prisma não declara exclusion constraint no `schema.prisma`. Ela entra numa migration SQL
escrita à mão (precisa da extensão `btree_gist`).

## D7 — Linguagem: TypeScript no Node

> **Status: fechada.**

**O quê:**
Backend em TypeScript, rodando em Node.js.

**Por quê:**
- O Prisma gera tipos a partir do schema: campo renomeado ou removido quebra na compilação,
  não em produção.
- Os schemas de validação de entrada viram o contrato da API, que o front pode reaproveitar.
- Dois devs mexendo no mesmo backend: o tipo é documentação que o compilador confere.

**Alternativa descartada:**
JavaScript (ESM), igual ao front. Sem passo de build, mas erro de campo ou de contrato só
aparece em execução.

**Custo aceito:**
Passo de build/execução (`tsc` / `tsx`).

## D8 — Repositório e ambiente de desenvolvimento

> **Status: fechada.**

**O quê:**
- Backend na pasta `backend/` deste repositório, com `package.json` próprio (front e back não
  compartilham dependências).
- ~~`backend/schema` (rascunho em texto) vira `backend/prisma/schema.prisma`.~~ Feito na Tarefa 2 do
  plano; o rascunho foi apagado.
- PostgreSQL de desenvolvimento roda em Docker Compose.
- Credenciais do banco ficam em variável de ambiente (`.env`), fora do git.

**Por quê:**
- *Mesmo repositório:* mudança de contrato da API e a mudança do front que a consome entram
  no mesmo commit.
- *Docker Compose:* os dois devs sobem a mesma versão do Postgres com um comando.

**Alternativas descartadas:**
- *Repositório separado:* o contrato teria que ser sincronizado à mão entre dois repositórios.
- *Postgres instalado na máquina:* cada dev configura à mão e as versões divergem.
- *Banco na nuvem (Neon/Supabase):* depende de internet para desenvolver.

**Pré-requisitos:**
- `.gitignore` cobre `.env` (incluído antes do primeiro commit do backend).
- Docker Desktop instalado nas duas máquinas.

## D9 — Sessão: JWT curto + refresh revogável

> **Status: fechada** (pendências resolvidas pela D19).

**O quê:**
O login devolve um *access token* JWT de vida curta (proposta: 15 min) e um *refresh token*
em cookie `httpOnly`. O refresh fica guardado no banco (só o hash) e pode ser revogado.

**Por quê:**
- A D5 bloqueia conta e a D3 redefine senha — as duas precisam derrubar sessões já abertas.
  Um JWT sozinho não pode ser revogado antes de expirar; o refresh guardado no banco pode,
  e o access curto limita a janela em que um token antigo ainda vale.
- Cookie `httpOnly`: o JavaScript da página não lê o refresh, então um XSS não rouba a sessão longa.

**Alternativas descartadas:**
- *Só JWT longo (ex.: 8 h):* senha redefinida não derruba sessão já aberta.
- *Sessão no servidor (cookie + tabela, sem JWT):* também é revogável e é mais simples.
  Foi preterida para manter a stack declarada (JWT) — motivo fraco; pode ser reaberta.

**Em aberto:**
1. ~~Validade do refresh e rotação.~~ Fechado pela D19.
2. ~~Tabela de refresh.~~ Fechado pela D19: `RefreshToken` com FK exclusiva.
3. ~~CSRF.~~ Fechado pela D19.

## D10 — Papéis e administração

> **Status: fechada.**

**O quê:**
- Papéis: **CLIENTE** (quem tem linha em `Login`), **RECEPCIONISTA**, **DENTISTA** e **admin**.
- `Funcionario.categoria` ∈ {RECEPCIONISTA, DENTISTA} (como na D2) + `isAdmin` boolean
  NOT NULL, padrão `false`.

Permissões já decididas:

| Papel          | Pode                                                                      |
|----------------|---------------------------------------------------------------------------|
| Admin          | Gerenciar funcionários, procedimentos (D11) e grades semanais (D12)       |
| Recepcionista  | Gerenciar pacientes, consultas de qualquer paciente e bloqueios (D12); marcar REALIZADA; ver pendentes (D13) |
| Dentista       | Ver **só a própria** agenda; criar e cancelar consultas da própria agenda; cadastrar os próprios bloqueios; marcar REALIZADA nas próprias consultas |
| Cliente        | Ver horários livres, criar e cancelar as próprias consultas               |

*Dentista só na própria agenda:* ele não vê a agenda dos colegas, então também não cria nem
cancela consulta nela.

**Por quê `isAdmin` separado da categoria:**
O dono da clínica atende como dentista e também administra. Com ADMIN como categoria ele
precisaria de duas contas — dois e-mails, já que a D2 exige e-mail UNIQUE — e as consultas
dele ficariam presas a uma conta diferente da que administra.

**Alternativas descartadas:**
- *ADMIN como categoria:* obriga o dono a ter duas contas (acima).
- *Recepção administra tudo:* qualquer recepcionista criaria contas e mudaria preços.
- *Dentista e recepção com as mesmas permissões:* nenhum controle.

**Em aberto:**
1. ~~Dentista vê a agenda dos outros? Cria/cancela consulta? Cadastra o próprio bloqueio?~~
   Fechado: não vê; cria/cancela e bloqueia só na própria agenda (tabela acima).
2. ~~Quem marca a consulta como REALIZADA.~~ Fechado: o dentista da consulta e a recepção — o
   dentista marca ao terminar, a recepção corrige se ele esquecer.
3. ~~Quem pode ver dados de saúde do paciente (dado sensível pela LGPD).~~ Fechado pela D18:
   funcionários e o próprio paciente leem e escrevem.
4. ~~O que impede a clínica de ficar sem nenhum admin?~~ Fechado: o sistema recusa tirar o
   `isAdmin` ou desativar o último admin ativo.

## D11 — Procedimento

> **Status: parcial.**

**O quê:**
- Tabela `Procedimento` com `nome`, `duracaoMinutos` e `precoCentavos` (inteiro).
- O preço é só exibição ("Valor estimado" na tela de agendamento). A consulta **não** copia o preço.
- No MVP, todo dentista faz todo procedimento.

**Por quê:**
- *Duração no procedimento:* sem ela não há como calcular os horários livres (D12) nem o fim
  da consulta (D13).
- *Preço em centavos inteiros:* o protótipo usa string (`'180,00'`), que não ordena nem soma;
  `float` tem erro de arredondamento.

**Alternativas descartadas:**
- *Duração fixa por slot:* procedimento longo viraria vários agendamentos.
- *Quem agenda escolhe a duração:* o paciente não sabe quanto tempo reservar.
- *Consulta guarda o preço do dia:* é decisão do Financeiro, que está fora do MVP.
- *Tabela `DentistaProcedimento`:* adiada — no MVP todos fazem tudo.
- *Sem preço:* a tela perderia o "Valor estimado".

**Em aberto:**
1. Lista real de procedimentos, durações e preços (Colzani).
2. ~~Procedimento que deixa de ser oferecido não pode ser apagado se já tem consultas. Desativar?~~
   Fechado pela D18: coluna `ativo`.
3. Se a clínica tiver especialistas, `DentistaProcedimento` volta para a mesa.

## D12 — Disponibilidade dos dentistas

> **Status: fechada.**

**O quê:**
- **Grade semanal** por dentista: faixas de (dia da semana, início, fim).
  Ex.: segunda 08:00–12:00 e 14:00–18:00. O almoço é o intervalo entre duas faixas.
- **Bloqueio:** período (início, fim) em que um dentista não atende — férias, curso, feriado.
- **Horário livre** = faixas da grade − bloqueios − consultas não canceladas (CONFIRMADA e REALIZADA; ver D18).
- Os horários de início oferecidos **andam no passo da duração do procedimento**, contados a
  partir do início de cada faixa. Limpeza de 60 min na faixa 08:00–12:00 → 08:00, 09:00,
  10:00, 11:00. A consulta precisa caber inteira dentro de uma faixa.
- **Sem limites** para o paciente no MVP: sem antecedência mínima, sem horizonte máximo,
  sem máximo de consultas futuras.

**Por quê:**
- *Grade por dentista:* os dentistas não atendem todos no mesmo horário. O protótipo tinha
  uma lista fixa com `11:30` e `12:00` desabilitados no código, sem noção de disponibilidade.
- *Passo = duração:* escolha do grupo. Consequência aceita: pode sobrar buraco. Se uma
  avaliação de 30 min ocupa 08:30–09:00, a limpeza de 60 min não é oferecida às 08:00 e
  os 30 min das 08:00 ficam vazios para ela.
- *Sem limites:* escopo do MVP. Risco aceito: um paciente pode reservar muitos horários.

**Alternativas descartadas:**
- *Horário único da clínica:* não cobre dentista que atende só alguns dias.
- *Recepção abre cada horário à mão:* trabalho manual demais.
- *Passo fixo de 30 ou 15 min:* preterido pelo grupo.

**Em aberto:**
1. ~~Feriado/clínica fechada: um bloqueio por dentista, ou bloqueio sem dentista?~~
   Fechado pela D18: um bloqueio por dentista, criados em lote.
2. ~~Fuso horário.~~ Fechado pela D18: UTC (`timestamptz`), grade lida em `America/Sao_Paulo`.
3. ~~A recepção também fica presa ao passo?~~ Fechado: **a clínica (recepção e dentista) encaixa
   em qualquer minuto livre** (múltiplo de 5 min — D22) dentro da grade; só o paciente fica preso ao passo. Resolve os
   buracos que o passo cria. O banco continua impedindo sobreposição (D18).
4. ~~Bloqueio criado em cima de consulta já confirmada.~~ Fechado pela D18: o bloqueio é recusado.
5. ~~Grade alterada quando já existem consultas futuras fora da nova grade.~~ Fechado: a mudança
   é aceita, nenhuma consulta é cancelada sozinha, e a resposta lista as consultas futuras que
   ficaram fora da nova grade para a recepção resolver. *Descartados:* recusar a mudança (trava
   o admin) e cancelar automaticamente (paciente perde a consulta sem ninguém decidir).

## D13 — Consulta: criação e estados

> **Status: fechada.**
> Substitui o esboço anterior (criado → aguardando confirmação do médico → aguardando
> confirmação do paciente → concluída).

**O quê:**
- Criada **pelo paciente no sistema** (escolhe um horário livre) ou **pela recepção**
  (paciente liga). Nos dois casos nasce **CONFIRMADA** — não há aprovação.
- Estados: `CONFIRMADA` → `REALIZADA` (marcada à mão) ou `CANCELADA`. Não existe `FALTOU` no MVP.
- Dois pedidos para o mesmo horário: o segundo recebe erro (garantido pelo banco, D6).
- Remarcar = cancelar + criar nova (D14).

**Por quê:**
- *Nasce confirmada:* o paciente só vê horários que já estão livres na grade; não sobra
  nada para a clínica aprovar.
- *Sem FALTOU:* escopo do MVP. Consequência aceita: não comparecimento não é registrado, e
  consulta passada que ninguém marcou continua CONFIRMADA.

**Alternativas descartadas:**
- *Nasce pendente e a clínica aprova:* o esboço anterior. Etapa sem decisão real a tomar.
- *Só a clínica cria:* o paciente teria que ligar sempre.
- *Passou do horário → REALIZADA automaticamente:* o histórico mentiria sobre as faltas.

**Campos implicados** (ainda não é schema):
paciente (`Cliente`), dentista (`Funcionario` DENTISTA), procedimento, `inicio`, `fim`, `status`.
`fim` é guardado, não derivado: se a duração do procedimento mudar, a consulta já marcada
mantém o horário que reservou — e a exclusion constraint (D6) precisa do intervalo na própria linha.

**Em aberto:**
1. ~~Quem marca REALIZADA.~~ Fechado na D10: dentista da consulta e recepção.
2. ~~"Observações clínicas" (campo do protótipo) entra? Quem lê?~~ Fechado pela D18.
3. ~~Registrar quem criou a consulta?~~ Fechado pela D18: não entra — nenhuma regra do MVP depende disso.
4. ~~Consulta CONFIRMADA com horário já passado.~~ Fechado: um endpoint lista as consultas
   CONFIRMADAS com `fim` no passado ("pendentes") para a recepção marcar. Nada muda sozinho.

## D14 — Cancelamento e remarcação

> **Status: fechada.**

**O quê:**
- Clínica e paciente podem cancelar uma consulta CONFIRMADA.
- Paciente com **24 h ou mais** de antecedência: cancela sem justificativa.
- Paciente com **menos de 24 h**: cancela, mas a **justificativa é obrigatória**. O front abre
  um popup; o backend recusa o pedido que chegar sem justificativa.
- Remarcar = cancelar a consulta original + criar uma nova, com a mesma regra de 24 h.

**Por quê:**
- *Justificativa em vez de proibição:* proibir o cancelamento não faz o paciente aparecer —
  só faz a clínica não ficar sabendo da falta.
- *Remarcar como cancelar + criar:* o histórico fica fiel (a original aparece cancelada) e a
  nova consulta passa pela mesma checagem de horário livre.

**Alternativas descartadas:**
- *Proibir cancelamento com menos de 24 h:* acima.
- *Editar data/hora na mesma consulta:* perde o registro do horário original.
- *Só a clínica remarca:* o paciente teria que ligar.

**Em aberto:**
1. ~~Campos de cancelamento (quando, quem cancelou, justificativa).~~ Fechado pela D18.
2. ~~A clínica também precisa justificar?~~ Fechado: não. Justificativa é obrigatória só para o
   paciente com menos de 24 h.
3. ~~Paciente pode cancelar depois do horário de início?~~ Fechado: não. Depois do início,
   cancelar não libera horário para ninguém e mascararia a falta. Só a clínica cancela.
4. ~~Cancelamento com menos de 24 h tem consequência?~~ Fechado: nenhuma no MVP além da
   justificativa — coerente com "sem limites" (D12) e "sem FALTOU" (D13).
5. ~~Paciente é avisado quando a clínica cancela?~~ Fechado: sim, por SMS pela interface da D16
   (simulado no MVP).

## D15 — Ativação de conta de paciente já cadastrado

> **Status: parcial.**

**O quê:**
Paciente cadastrado pela recepção (`Cliente` sem `Login`, D1) que tenta se autocadastrar com
o mesmo CPF recebe um código por SMS **no telefone que a clínica já tem**. Só depois de
informar o código ele cria a senha (linha em `Login`).

**Por quê:**
CPF não é segredo. Sem verificar o telefone, qualquer pessoa com o CPF de um paciente criaria
a senha e veria o histórico dele. O telefone cadastrado pela clínica é o dado que o atacante
não controla.

**Alternativas descartadas:**
- *Bloquear e mandar ligar para a clínica:* trabalho manual para a recepção, e a mensagem
  confirma que aquele CPF é paciente (enumeração).
- *Criar a senha direto:* qualquer um toma a conta.

**Em aberto:**
1. ~~Enumeração no autocadastro.~~ Fechado pela D19: sempre verifica telefone por SMS e responde igual.
2. ~~CPF que já tem `Login`.~~ Fechado pela D19: mesma resposta; o SMS orienta a recuperar a senha.
3. Paciente trocou de telefone e a clínica tem o antigo: só a recepção resolve?
   (Pergunta em `docs/pendencias-colzani.md`.)
4. ~~Código igual ao da D3? Mesma tabela?~~ Fechado pela D19: sim, `CodigoVerificacao`.
5. ~~Custo de SMS por autocadastro.~~ Fechado pela D19: entra no mesmo limite de 3/h e 5/dia.

## D16 — SMS e e-mail simulados no MVP

> **Status: fechada.**

**O quê:**
O envio de mensagens fica atrás de uma interface (enviar para um destino uma mensagem). No MVP,
a única implementação escreve a mensagem no log do servidor. Um provedor real entra depois
como outra implementação, sem mudar regra de negócio. Fecha a D3.4 para o MVP.

**Por quê:**
Provedor de SMS cobra por mensagem e exige conta; o projeto acadêmico não precisa disso para
demonstrar o fluxo. A interface isola a troca futura.

**Alternativa descartada:**
Provedor real já no MVP (Zenvia, Twilio etc.).

**Cuidado:**
A implementação de log escreve códigos de recuperação e ativação em texto puro. Ela não pode
rodar em produção — o servidor deve se recusar a subir com ela fora do ambiente de desenvolvimento.

## D17 — Framework HTTP e organização do código

> **Status: fechada.**

**O quê:**
- **Express** como framework HTTP, com **Zod** validando toda entrada (body, params, query).
- Código organizado **por domínio**: `auth`, `pacientes`, `funcionarios`, `procedimentos`,
  `disponibilidade`, `consultas`. Cada domínio tem as mesmas camadas:
  rota → controller → service → Prisma.
  - *Rota:* liga URL + método ao controller e aplica autenticação/papel (D10).
  - *Controller:* valida a entrada com Zod e traduz resultado/erro em resposta HTTP.
  - *Service:* regra de negócio (24 h do cancelamento, horários livres etc.). Não conhece HTTP.
- Testes com **Vitest + Supertest**, contra um Postgres real no Docker (D8) — a exclusion
  constraint (D6) só existe no Postgres, então banco simulado não testaria a regra principal.

**Por quê:**
- *Express:* era a stack declarada, é o framework Node mais documentado, e nenhum requisito
  da clínica (volume baixo de requisições) pede o desempenho do Fastify.
- *Zod:* o Express não valida nada sozinho. Os schemas Zod também servem de contrato da API
  para o front (D7).
- *Por domínio:* cada dev pega domínios diferentes sem mexer nos mesmos arquivos.
- *Service sem HTTP:* a regra de negócio é testada direto, sem subir servidor.

**Alternativas descartadas:**
- *Fastify:* validação embutida e mais rápido, mas troca a stack declarada sem necessidade.
- *NestJS:* injeção de dependência e decorators — curva de aprendizado alta para 2 devs num
  projeto acadêmico; o framework pesaria mais que o domínio.
- *Organização por camada* (`controllers/`, `services/` na raiz): uma mudança em consultas
  espalha arquivos por quatro pastas.

## D18 — Modelo de dados do domínio

> **Status: parcial.**
> Cruza o rascunho `backend/schema` com D1–D17. Tabelas de autenticação (refresh, códigos,
> tentativas) ficam para a próxima decisão. Implementada em `backend/prisma/schema.prisma`.

**Convenções de todas as tabelas:**
- Datas com hora em `timestamptz` (UTC). A grade semanal é lida no fuso `America/Sao_Paulo`.
- Senhas guardadas só como hash (`senhaHash`, 60 caracteres — bcrypt). Renomeado de `senha`
  para que o nome não sugira texto puro.
- Nada é apagado se outra tabela aponta para ele: `Funcionario` e `Procedimento` têm `ativo`.
  Apagar quebraria o histórico de consultas; sem `ativo`, ex-funcionário continuaria logando.

### Tabelas

**Cliente** (D1, D1.1, D4)

| Coluna         | Tipo / restrição           | Por que existe                                                      |
|----------------|----------------------------|---------------------------------------------------------------------|
| nome           | NOT NULL                   | Identifica o paciente para a clínica                                |
| cpf            | UNIQUE NOT NULL            | Login do cliente (D1.1)                                             |
| telefone       | NOT NULL                   | Contato e canal de recuperação/ativação (D3, D15)                   |
| email          | NULL                       | Só contato (D1.1)                                                   |
| nascimento     | DATE NULL                  | Idade orienta o atendimento (criança, dose de anestésico). NULL = não informado (cadastro por telefone) |
| convenio       | NULL                       | Recepção precisa saber se é plano ou particular. NULL = particular   |
| criadoEm       | NOT NULL                   | D1.1                                                                |
| pacienteDesde  | DATE NOT NULL              | Início do vínculo com a clínica (D4)                                |

**EnderecoCliente** — 1:1 com Cliente, opcional

| Coluna                                   | Tipo / restrição          |
|------------------------------------------|---------------------------|
| clienteId                                | PK e FK → Cliente         |
| cep                                      | CHAR(8) NOT NULL          |
| logradouro, numero, bairro, cidade       | NOT NULL                  |
| uf                                       | CHAR(2) NOT NULL          |
| complemento                              | NULL                      |

*Por que tabela separada:* "se o paciente informou endereço, CEP, rua, número, cidade e UF são
obrigatórios" é regra condicional — o mesmo caso da D1. Com colunas NULL em `Cliente`, o banco
aceitaria endereço só com a cidade. Na tabela própria, toda linha **é** um endereço e o NOT NULL
vale de verdade. *Por que campos separados:* escolha do grupo.

**AlertaCliente** — risco clínico que o dentista vê antes de atender ("Alergia à Penicilina")

| Coluna                  | Tipo / restrição                    | Por que existe                                  |
|-------------------------|-------------------------------------|-------------------------------------------------|
| clienteId               | FK NOT NULL                         | De quem é o alerta                              |
| texto                   | TEXT NOT NULL                       | O alerta                                        |
| autor                   | {PACIENTE, CLINICA} NOT NULL        | Quem registrou                                  |
| autorFuncionarioId      | FK → Funcionario NULL               | Qual funcionário registrou                      |
| criadoEm                | NOT NULL                            | Quando                                          |
| removidoEm              | NULL                                | Remoção sem apagar a linha                      |
| removidoPorFuncionarioId| FK → Funcionario NULL               | Só funcionário remove                           |

- `CHECK`: `autor = 'CLINICA'` ⇔ `autorFuncionarioId` preenchido.
- `CHECK`: `removidoEm` e `removidoPorFuncionarioId` preenchidos juntos ou vazios juntos.
- *Por que uma linha por alerta, e não texto único em `Cliente`:* a regra "paciente só acrescenta,
  só funcionário remove" vale **por alerta**. Num texto único o banco não distingue o trecho que a
  clínica escreveu do que o paciente escreveu. Alerta removido não some: o histórico mostra que
  existiu e quem removeu.

**Login** (D1): `clienteId` FK UNIQUE, `senhaHash` NOT NULL.

**Funcionario** (D2, D10)

| Coluna      | Tipo / restrição                     | Por que existe                                   |
|-------------|--------------------------------------|--------------------------------------------------|
| nome        | NOT NULL                             | Identificação                                    |
| cpf         | UNIQUE NOT NULL                      | Identificação legal do funcionário               |
| email       | UNIQUE NOT NULL                      | Login do funcionário (D2)                        |
| senhaHash   | NOT NULL                             | D2                                               |
| categoria   | {RECEPCIONISTA, DENTISTA} NOT NULL   | D2, D10                                          |
| isAdmin     | boolean NOT NULL, padrão `false`     | D10                                              |
| cro         | UNIQUE NULL + `CHECK`                | Registro profissional exigido do dentista        |
| dataInicio  | DATE NOT NULL                        | Registro do vínculo com a clínica (ver Em aberto)|
| ativo       | boolean NOT NULL, padrão `true`      | Convenções, acima                                |

`CHECK (categoria <> 'DENTISTA' OR cro IS NOT NULL)` — todo dentista tem CRO, garantido pelo banco.

**Procedimento** (D11): `nome` UNIQUE NOT NULL, `duracaoMinutos` NOT NULL `CHECK > 0`,
`precoCentavos` NOT NULL `CHECK >= 0`, `ativo`.

**GradeHorario** (D12): `dentistaId` FK, `diaSemana` 0–6, `inicio` TIME, `fim` TIME,
`CHECK (inicio < fim)`. Faixas sobrepostas do mesmo dentista no mesmo dia: recusadas no service.

**Bloqueio** (D12): `dentistaId` FK **NOT NULL**, `inicio`, `fim`, `CHECK (inicio < fim)`.
- Feriado = um bloqueio por dentista, criados em lote por um único pedido.
- Bloqueio em cima de consulta CONFIRMADA é **recusado**, com a lista das consultas em conflito;
  a recepção cancela antes. Fica no service, dentro de uma transação — exclusion constraint
  não compara duas tabelas.

**Consulta** (D13, D14)

| Coluna                     | Tipo / restrição                          | Por que existe                              |
|----------------------------|-------------------------------------------|---------------------------------------------|
| clienteId                  | FK NOT NULL                               | Paciente                                    |
| dentistaId                 | FK → Funcionario NOT NULL                 | Quem atende                                 |
| procedimentoId             | FK NOT NULL                               | Define a duração (D11)                      |
| inicio, fim                | timestamptz NOT NULL, `inicio < fim`      | D13 (`fim` guardado, não derivado)          |
| status                     | {CONFIRMADA, REALIZADA, CANCELADA}        | D13                                         |
| observacao                 | TEXT NULL                                 | Anotação clínica do atendimento             |
| criadoEm                   | NOT NULL                                  | Momento do agendamento                      |
| canceladoEm                | NULL                                      | Base da regra de 24 h (D14)                 |
| canceladoPor               | {PACIENTE, CLINICA} NULL                  | A regra de 24 h só vale para o paciente     |
| canceladoPorFuncionarioId  | FK → Funcionario NULL                     | Qual funcionário cancelou                   |
| justificativa              | TEXT NULL                                 | D14                                         |

Restrições garantidas pelo banco:
1. Um dentista não tem duas consultas não canceladas sobrepostas (exclusion constraint, D6).
2. Um paciente não tem duas consultas não canceladas sobrepostas (exclusion constraint).
3. `status = 'CANCELADA'` ⇔ `canceladoEm` e `canceladoPor` preenchidos.
4. `canceladoPor = 'CLINICA'` ⇔ `canceladoPorFuncionarioId` preenchido.
5. Paciente que cancela com menos de 24 h tem justificativa:
   `CHECK (canceladoPor <> 'PACIENTE' OR inicio - canceladoEm >= interval '24 hours' OR justificativa IS NOT NULL)`.

Garantido só no service: `dentistaId` aponta para funcionário com categoria DENTISTA e ativo
(FK não olha colunas da linha apontada).

**HistoricoObservacao** — log das edições de `Consulta.observacao`

| Coluna              | Tipo / restrição                 | Por que existe                         |
|---------------------|----------------------------------|----------------------------------------|
| consultaId          | FK NOT NULL                      | Qual consulta                          |
| texto               | TEXT NULL                        | Texto **depois** da edição (NULL = apagado) |
| autor               | {PACIENTE, CLINICA} NOT NULL     | Quem editou                            |
| autorFuncionarioId  | FK → Funcionario NULL            | Qual funcionário editou                |
| editadoEm           | NOT NULL                         | Quando                                 |

- `CHECK`: `autor = 'CLINICA'` ⇔ `autorFuncionarioId` preenchido.
- Toda escrita em `Consulta.observacao` grava uma linha aqui **na mesma transação**, no service.
- Guarda o texto completo de cada versão: se o paciente apagar a anotação do dentista, a versão
  anterior continua no histórico.
- *Risco aceito:* o valor atual existe duas vezes (`Consulta.observacao` e a última linha do
  histórico). Uma escrita que pule o service deixa os dois divergentes.

**Padrão de autor** (usado em `Consulta.canceladoPor`, `AlertaCliente`, `HistoricoObservacao`):
enum {PACIENTE, CLINICA} + FK para o funcionário quando é a clínica. Quando é o paciente, ele já
é conhecido pela própria linha (`clienteId`), então não precisa de FK para `Cliente`.

### Permissões sobre dado clínico (fecha a D10.3)

| Dado                   | Lê                                | Escreve                               | Remove           |
|------------------------|-----------------------------------|---------------------------------------|------------------|
| `Consulta.observacao`  | Funcionários e o próprio paciente | Funcionários e o próprio paciente     | —                |
| `AlertaCliente`        | Funcionários e o próprio paciente | Funcionários e o próprio paciente     | Só funcionários  |
| `HistoricoObservacao`  | Funcionários e o próprio paciente | Ninguém direto (gravado pelo service) | Ninguém          |

**Por quê:** escolha do grupo. O paciente informa alergias e condições que a clínica precisa saber.
O histórico compensa o risco de o paciente alterar a anotação do dentista: nada se perde e
fica registrado quem mudou. Alerta não pode ser removido pelo paciente porque um alerta apagado
por engano faz o dentista atender sem saber da alergia.

**Alternativas descartadas:**
- *Dado clínico fora do MVP:* o protótipo já mostra alertas e observações.
- *Observação só para dentistas:* o grupo quer o paciente vendo o próprio registro.
- *Endereço em texto único:* escolha do grupo por campos separados.
- *Nascimento, convênio, endereço, CPF/CRO/dataInicio do funcionário fora do MVP:* o grupo
  decidiu manter o cadastro completo do rascunho e do protótipo.
- *Bloqueio sem dentista (NULL = clínica inteira):* o NULL carregaria um significado escondido.
- *`criadoPor` na Consulta:* nenhuma regra do MVP depende de quem criou.
- *Duas colunas de observação (da clínica e do paciente):* o grupo preferiu uma coluna só com
  histórico de quem editou.
- *Alertas em texto único em `Cliente`:* não permite "paciente só acrescenta" (acima).

**Em aberto:**
1. `dataInicio` do funcionário: nenhuma regra do sistema lê a coluna. Confirmar que é exigência
   de cadastro, não campo "por via das dúvidas".

## D19 — Tabelas e regras de autenticação

> **Status: fechada.**
> Fecha as pendências de D3, D5, D9 e quase todas da D15.

### Tabelas

**TentativaLogin** (D5)

| Coluna        | Tipo / restrição                          | Por que existe                                   |
|---------------|-------------------------------------------|--------------------------------------------------|
| identificador | TEXT NOT NULL, **sem FK**                 | CPF ou e-mail digitado, exista ou não (D5)        |
| tipo          | {CLIENTE, FUNCIONARIO} NOT NULL           | Define a regra de bloqueio que se aplica          |
| ip            | NOT NULL                                  | Histórico de ataque (D5); não há regra por IP     |
| ocorridoEm    | timestamptz NOT NULL                      | Janela de contagem                                |
| resultado     | {SUCESSO, FALHA, REDEFINICAO} NOT NULL    | `REDEFINICAO` zera a contagem (fecha D5.3)        |

Contagem: falhas do par (identificador, tipo) depois da última linha `SUCESSO` ou `REDEFINICAO`.
- **Cliente:** 3 falhas → bloqueado até redefinir a senha (D5).
- **Funcionário:** 3 falhas → bloqueado por 15 min a partir da 3ª falha.

**CodigoVerificacao** (D3, D15)

| Coluna        | Tipo / restrição                               | Por que existe                                   |
|---------------|------------------------------------------------|--------------------------------------------------|
| identificador | TEXT NOT NULL, **sem FK**                      | No cadastro de CPF novo ainda não existe linha para apontar |
| tipo          | {CLIENTE, FUNCIONARIO} NOT NULL                | Mesmo motivo da `TentativaLogin`                  |
| finalidade    | {RECUPERACAO, ATIVACAO, CADASTRO} NOT NULL     | Código de recuperar senha não pode criar conta    |
| destino       | TEXT NULL                                      | Telefone/e-mail para onde foi enviado. No `CADASTRO`, a confirmação precisa vir com o **mesmo** telefone — senão alguém recebe o código no próprio celular e cadastra outro número. NULL = nada enviado (abaixo) |
| codigoHash    | NOT NULL                                       | HMAC com segredo do servidor: banco vazado não entrega códigos válidos |
| criadoEm      | timestamptz NOT NULL                           | Limite de pedidos                                 |
| expiraEm      | timestamptz NOT NULL                           | 10 min (D3)                                       |
| tentativas    | int NOT NULL, padrão 0, `CHECK <= 3`           | 3 tentativas por código (D3)                      |
| usadoEm       | timestamptz NULL                               | Código vale uma vez só                            |

- **Limite:** no máximo **3 pedidos por hora e 5 por dia** por (identificador, tipo). Acima disso → erro.
- **Identificador inexistente também grava linha** (sem envio, `destino` NULL). Se não gravasse,
  o limite só disparasse para quem existe e revelaria a conta — mesmo princípio da D5.
- Código novo invalida os códigos anteriores ainda não usados da mesma finalidade.

**RefreshToken** (D9)

| Coluna        | Tipo / restrição                 | Por que existe                                   |
|---------------|----------------------------------|--------------------------------------------------|
| loginId       | FK → Login NULL                  | Sessão de cliente                                |
| funcionarioId | FK → Funcionario NULL            | Sessão de funcionário                            |
| tokenHash     | UNIQUE NOT NULL                  | SHA-256 do token (aleatório, alta entropia)      |
| criadoEm      | timestamptz NOT NULL             | —                                                |
| expiraEm      | timestamptz NOT NULL             | Validade (abaixo)                                |
| revogadoEm    | timestamptz NULL                 | Revogação e rotação                              |

`CHECK (num_nonnulls(loginId, funcionarioId) = 1)` — toda sessão é de exatamente uma conta.

*Por que aqui tem FK e nos códigos não:* a sessão sempre pertence a uma conta que já existe, e
"derrubar todas as sessões da conta" precisa achar as linhas pela chave.

### Regras

**Sessão** (fecha D9.1–D9.3)
- Access token JWT: **15 min**. Refresh: **cliente 30 dias, funcionário 12 h**.
- **Rotação:** cada uso do refresh revoga o atual e emite um novo. Reapresentar um token já
  revogado → **todas** as sessões daquela conta são revogadas (sinal de token roubado).
- Todas as sessões da conta caem quando: a senha é redefinida, a conta de cliente é bloqueada
  (D5), o funcionário é desativado (D18).
- **Cookie:** `httpOnly`, `Secure` fora do desenvolvimento, `SameSite=Strict`, enviado só para a
  rota de refresh. A chamada de refresh exige também um cabeçalho próprio da aplicação.
  Consequência: front e API no mesmo site — no desenvolvimento, o Vite encaminha `/api` ao backend.

**Respostas que não revelam contas** (fecha D3.2, D15.1, D15.2)
- Recuperação e autocadastro respondem sempre: *"Se os dados estiverem corretos, enviamos um código."*
- Autocadastro **sempre** verifica telefone por SMS: CPF novo → telefone informado;
  CPF de paciente sem login → telefone cadastrado (D15); CPF que já tem login → SMS orientando
  a usar "Recuperar senha".

**Alternativas descartadas:**
- *Tabela `Usuario` base unificando cliente e funcionário:* desfaria a D1 e a D2.
- *Duas tabelas de refresh (cliente e funcionário):* duplicaria a regra de rotação.
- *FK nos códigos:* não existe linha para apontar no cadastro de CPF novo.
- *Refresh igual para todos (7 dias):* sessão esquecida aberta por dias no computador da recepção.
- *Funcionário bloqueado até redefinir:* e-mail de funcionário é fácil de adivinhar, e qualquer
  pessoa travaria a recepção.
- *Limite antigo (4 pedidos → 5 min):* permitia ~1.150 SMS por dia por CPF.
- *Regra por IP:* fora do MVP. **Risco aceito:** um robô pode testar muitos CPFs diferentes, 3
  vezes cada, sem barreira global.

## D20 — Convenções da API e rotas de autenticação

> **Status: fechada.**
> O contrato rota por rota fica em `docs/api.md`; aqui ficam os porquês.

**O quê:**
1. **IDs em UUID** em todas as tabelas expostas pela API.
2. **Senha:** 8 a 72 caracteres, sem regra de composição.
3. **Prefixo `/api` sem versão.**
4. **Erro em formato único** (`{ erro: { codigo, mensagem } }`) com status fixo por tipo
   (tabela em `docs/api.md`). Regra de negócio violada → 422; conflito de horário → 409.
5. **404 também para "existe, mas você não pode ver"**.
6. **Ativação (D15) não sobrescreve** o cadastro feito pela clínica: só cria a senha.
7. **Recuperação de senha sem rota de verificação do código**: código e senha nova vão juntos.

**Por quê:**
1. *UUID:* ID sequencial revela quantos pacientes a clínica tem e permite chutar o próximo.
   Com UUID, um esquecimento de checagem de permissão não vira acesso ao paciente vizinho por
   `id + 1`.
2. *Senha:* recomendação atual do NIST — comprimento protege mais que exigir símbolo, e regra
   de composição leva o paciente a anotar a senha. 72 é o limite do bcrypt (D18): acima disso
   o resto seria ignorado em silêncio.
3. *Sem versão:* só existe um cliente da API (o nosso front), que muda junto no mesmo repositório (D8).
4. *Erro único:* o front trata todos os erros num lugar só. 409 separado de 422 porque conflito
   de horário pede outra ação na tela (escolher outro horário).
5. *404:* responder 403 confirmaria que aquele paciente/consulta existe.
6. *Ativação:* quem tem o telefone pode criar a senha, mas os dados que a clínica conferiu não
   devem ser trocados por qualquer coisa digitada na tela de cadastro.
7. *Sem rota de verificação:* seria mais um ponto para testar códigos; o limite de 3 tentativas
   já vive no `confirmar`. Custo aceito: código errado só aparece no último passo da tela.

**Alternativas descartadas:**
- *INT sequencial (rascunho):* segurança dependeria 100% da checagem em toda rota.
- *Senha com letra e número / mínimo de 6:* acima.
- *Prefixo `/api/v1`:* versão sem segundo cliente que precise dela.
- *Rota `recuperacao/verificar`:* acima.

## D21 — Rotas de cadastro (pacientes, funcionários, procedimentos, grade, bloqueios)

> **Status: fechada.**
> Contrato em `docs/api.md`; aqui ficam os porquês das regras que não vieram de D1–D20.

**O quê:**
1. **Primeiro acesso do funcionário:** `POST /api/funcionarios` não recebe senha. A conta nasce
   com uma senha aleatória que ninguém conhece; o funcionário define a dele por "Recuperar senha".
2. **O paciente edita no próprio cadastro só** `email`, `convenio`, `nascimento` e o endereço.
   `nome` e `telefone` só pela recepção; `cpf` por ninguém.
3. **Bloqueio em lote é tudo ou nada:** um conflito em qualquer dentista cancela o pedido inteiro.
4. **Bloqueio é apagado de verdade** (`DELETE`), ao contrário de funcionário e procedimento.
5. **Desativar funcionário revoga todas as sessões dele.**

**Por quê:**
1. O admin nunca conhece a senha de ninguém, e não precisa de campo "trocar no primeiro login"
   nem de rota nova — reaproveita a recuperação (D3, D19).
2. O telefone é o canal de recuperação de senha (D3). Se o paciente pudesse trocá-lo, quem
   roubasse a sessão trocaria o telefone e tomaria a conta de vez. O nome identifica o
   paciente para a clínica.
3. Feriado aplicado pela metade (uns dentistas bloqueados, outros não) é pior que nenhum:
   a recepção acharia que bloqueou todos.
4. Nenhuma tabela aponta para `Bloqueio`, então apagar não quebra histórico.
5. Sem isso, o access/refresh de quem saiu da clínica continuaria valendo até expirar (D19).

**Alternativas descartadas:**
- *Admin define senha temporária:* admin conhece a senha e exige "trocar no primeiro login".
- *Paciente edita tudo menos CPF:* troca de telefone sem verificação (acima).
- *Paciente não edita nada:* liga para a clínica até para mudar o e-mail.
- *Bloqueio em lote parcial* (cria os que dá e lista os que falharam): acima.

## D22 — Rotas de horários livres e consultas

> **Status: fechada.**
> Contrato em `docs/api.md`; aqui ficam os porquês das regras que não vieram de D1–D21.

**O quê:**
1. **Remarcação atômica:** `POST /api/consultas/{id}/remarcacao` cancela a original e cria a nova
   numa transação só. O modelo da D14 não muda: continua sendo uma consulta cancelada + uma nova.
2. **Dias com vaga no mês:** `GET /api/dias-disponiveis` para o calendário marcar dias lotados.
3. **Encaixe da clínica em múltiplos de 5 min** (refina a D12.3 "qualquer minuto livre").
4. **Consulta retroativa só pela clínica:** R/D registram consulta com horário no passado
   (urgência atendida sem agendamento). Grade e bloqueio não são checados nesse caso;
   sobreposição continua. Nasce `CONFIRMADA` e aparece em pendentes. Paciente → 422.
5. **Todo erro de horário é 409**, com `codigo` diferente para cada causa.
6. **Ações como sub-recursos** (`/cancelamento`, `/realizacao`, `/remarcacao`), não `PATCH status`.
7. **Trava da linha do dentista:** criar consulta e criar bloqueio fazem
   `SELECT … FOR UPDATE` no `Funcionario` do dentista dentro da transação.

**Por quê:**
1. Com duas chamadas soltas, se o horário novo fosse tomado entre elas, o paciente ficaria sem
   nenhuma consulta. E mover a consulta 30 min para frente conflitaria com a própria consulta
   antiga (D18, paciente sem sobreposição). Dentro da transação a antiga já está `CANCELADA`
   quando a nova é inserida, e a exclusion constraint ignora canceladas.
2. Escolha do grupo: paciente não clica dia por dia procurando vaga.
3. Evita início como 08:07 por erro de digitação e mantém a agenda legível.
4. Escolha do grupo. Grade e bloqueio não são checados porque descrevem quando o dentista
   **pode** atender; o atendimento retroativo já aconteceu. A sobreposição continua porque o
   dentista não atendeu dois pacientes ao mesmo tempo.
5. Para o front a ação é sempre a mesma (escolher outro horário); o `codigo` explica o motivo.
6. Cada ação tem regras e campos próprios (justificativa, 24 h, "só depois do início"). Um
   `PATCH status` genérico misturaria todas num lugar só.
7. A exclusion constraint compara linhas de **uma** tabela. Sem a trava, um bloqueio e uma
   consulta criados no mesmo instante passariam os dois pela checagem um do outro.

**Alternativas descartadas:**
- *Front remarca com duas chamadas:* acima.
- *Calendário sem marcar dias:* preterido pelo grupo.
- *Encaixe em qualquer minuto:* acima.
- *Só horário futuro para todos:* preterido pelo grupo — urgência sem agendamento ficaria fora do sistema.
- *Ligar a consulta nova à cancelada* (`remarcadaDe`): nenhuma regra do MVP lê esse vínculo.
- *Transação `SERIALIZABLE` em vez da trava:* também resolve, mas falha com erro de
  serialização que o código teria que repetir; a trava só faz a segunda transação esperar.

## D23 — Estrutura do código, erros, testes e ambiente

> **Status: fechada.**

**O quê:**

*Estrutura* (detalha a D17):
```
backend/
  docker-compose.yml   Postgres de desenvolvimento e de teste
  .env.example         nomes das variáveis, sem valores
  prisma/
    schema.prisma
    migrations/        SQL à mão para exclusion constraints e CHECKs (D6, D18)
    seed.ts            cria o primeiro admin
  src/
    app.ts             monta o Express sem abrir porta
    server.ts          abre a porta
    config/env.ts      valida as variáveis com Zod
    compartilhado/     erros, autenticação, papéis, validação, mensageria, relógio
    modulos/<dominio>/ <dominio>.rotas.ts · .controller.ts · .service.ts · .schemas.ts · .test.ts
```

*Nomes no código em português* (`Consulta`, `cancelarConsulta`, `horariosLivres`). Termos do
framework (`req`, `res`, `middleware`) ficam como são.

*Erros:* um middleware só traduz tudo para o formato do `docs/api.md`:
- `ErroDeNegocio` (status + código) → resposta direta.
- Erro de validação Zod → 400 `ENTRADA_INVALIDA` com os campos que falharam.
- Violação de exclusion constraint (Postgres `23P01`) → 409; o nome da constraint escolhe o
  código (`HORARIO_INDISPONIVEL` ou `PACIENTE_COM_CONSULTA_NO_HORARIO`).
- Qualquer outro → 500 `ERRO_INTERNO` com mensagem genérica; o stack trace vai só para o log.

*Log:* pino, com `senha`, `novaSenha`, `codigo`, `cpf`, `authorization` e `cookie` trocados por
`[OCULTO]` antes de gravar.

*Testes:*
- **TDD:** cada regra deste documento vira um teste que falha antes do código que a implementa.
- Vitest + Supertest contra o banco `dentagenda_test`, no mesmo Docker.
- Arquivos de teste rodam em série; o banco é limpo antes de cada arquivo.
- **Relógio injetável:** o código pede "agora" a um relógio, não a `Date.now()`, para testar a
  regra de 24 h, pendentes e expiração de código sem esperar o tempo passar.
- **Critério de pronto:** todo código de erro listado em `docs/api.md` tem pelo menos um teste.

*Ambiente:*
- Variáveis: `DATABASE_URL`, `DATABASE_URL_TESTE`, `JWT_SEGREDO`, `CODIGO_HMAC_SEGREDO`,
  `NODE_ENV`, `PORTA`, `ENVIADOR_MENSAGEM`, e as do primeiro admin: `ADMIN_INICIAL_EMAIL`,
  `ADMIN_INICIAL_NOME`, `ADMIN_INICIAL_CPF`, `ADMIN_INICIAL_CATEGORIA`, `ADMIN_INICIAL_CRO`
  (só se for dentista).
- `config/env.ts` recusa subir se faltar variável, e recusa `ENVIADOR_MENSAGEM=log` com
  `NODE_ENV=production` (D16).
- Scripts: `dev`, `build`, `start`, `test`, `lint`, `typecheck`, `db:migrate`, `db:seed`.
- `vite.config.js` do front ganha proxy de `/api` para o backend (D19).

*Primeiro admin:* `npm run db:seed` cria o admin com os dados das variáveis acima,
`dataInicio` = hoje e senha aleatória. Ele define a senha por "Recuperar senha" (mesmo fluxo da
D21). Se já existir algum admin, o seed não faz nada.

*Swagger:* documentação navegável em `/api/docs`, gerada a partir dos schemas Zod. Só fora de
produção. `docs/api.md` continua sendo o contrato revisado pelo grupo; o Swagger é para testar
rotas no navegador.

**Por quê:**
- *`app.ts` separado de `server.ts`:* o Supertest testa o app sem abrir porta.
- *Português:* domínio, documentação e contrato estão em português; traduzir no código cria
  dois vocabulários para a mesma coisa.
- *Middleware único de erro:* o formato de erro é o mesmo em todas as rotas sem cada controller repetir.
- *Log sem dado sensível:* CPF é dado pessoal (LGPD) e senha/código em log é credencial vazada.
- *Banco real nos testes:* as regras principais (sobreposição, CHECKs) existem só no Postgres (D6).
- *Testes em série:* mais simples que um banco por worker; o volume de testes do projeto não
  justifica o paralelismo.
- *Seed:* sem admin, ninguém cria funcionário. O seed não expõe rota nenhuma.
- *Swagger só fora de produção:* não expor o mapa da API publicamente.

**Alternativas descartadas:**
- *Nomes em inglês:* acima.
- *Rota pública de setup inicial:* a primeira pessoa a chamar viraria admin.
- *Código antes dos testes:* risco de regra sem teste.
- *Sem Swagger:* preterido pelo grupo.
- *Banco em memória/SQLite nos testes:* não tem exclusion constraint.

**A confirmar na implementação:** a biblioteca que gera o OpenAPI a partir do Zod precisa ser
compatível com a versão do Zod instalada — conferir na documentação atual antes de instalar.

## D24 — Códigos de erro genéricos e objetos de resposta

> **Status: fechada.**
> Fecha lacunas do `docs/api.md` encontradas ao escrever o plano de implementação.

**O quê:**
1. `codigo` dos erros que o contrato ainda não nomeava:
   - **401** sem token, token inválido ou expirado, refresh ausente/expirado/revogado →
     `NAO_AUTENTICADO`. `CREDENCIAIS_INVALIDAS` continua só no login.
   - **403** papel não permite → `SEM_PERMISSAO`. `CAMPO_NAO_EDITAVEL` continua no `PATCH` de paciente.
   - **404** recurso inexistente, sem permissão de ver (D20.5) ou rota inexistente → `NAO_ENCONTRADO`.
   - **500** → `ERRO_INTERNO` (D23).
2. **400** `ENTRADA_INVALIDA` traz `erro.campos: [{ "caminho": "endereco.cep", "mensagem": "..." }]`.
3. **Objeto `consulta`**, igual em toda rota de consultas:
   `{ id, paciente: { id, nome }, dentista: { id, nome }, procedimento: { id, nome }, inicio, fim,
   status, observacao, criadoEm, canceladoEm, canceladoPor, justificativa }`.
4. Onde o contrato escreve só `"paciente"` (`consultasForaDaGrade`, `CONSULTAS_NO_PERIODO`), o
   valor é `{ id, nome }`.
5. Toda data com hora na resposta sai no fuso de São Paulo (`…-03:00`).

**Por quê:**
1. Sem `codigo` fixo o front não distingue "sessão expirou" (renovar o token) de "sem permissão"
   (mostrar aviso).
2. O front precisa saber qual campo do formulário marcar.
3. e 4. Sem formato único, cada rota inventaria o seu; com nome junto do id, a agenda se monta
   com uma chamada só.
5. A clínica e os pacientes leem horário local; o exemplo do `api.md` já usava `-03:00`.

**Alternativas descartadas:**
- *Só o status HTTP, sem `codigo` nos erros genéricos:* quebraria a regra da D20.4 (formato único).
- *Consulta só com IDs (`pacienteId`, `dentistaId`):* três chamadas a mais por linha da agenda.
- *Datas de saída em UTC (`Z`):* o front teria que converter tudo.

## D25 — Regras de implementação não fixadas antes

> **Status: fechada.**
> Pontos que D1–D24 deixavam abertos e que o código precisa decidir. Contrato em `docs/api.md`.

**O quê:**
1. **CPF válido** = 11 dígitos com dígitos verificadores corretos; recusa sequência repetida
   (`11111111111`).
2. **Bloqueio do funcionário:** as falhas contam a partir do último `SUCESSO`, `REDEFINICAO` ou
   do fim do último bloqueio. Tentativa durante o bloqueio → 423, gravada como `FALHA`, sem
   estender os 15 min. Senha **certa** durante o bloqueio (cliente ou funcionário) → 423.
3. **Limite de códigos:** janelas móveis (últimos 60 min e últimas 24 h), somando todas as
   finalidades do par (identificador, tipo).
4. **Recuperação** de CPF sem `Login`, e-mail inexistente ou funcionário inativo → 202 igual,
   grava linha de código sem envio (`destino` NULL).
5. **Autocadastro de CPF que já tem login:** grava linha de código (conta no limite) com código
   aleatório nunca enviado e `destino` NULL; ao telefone cadastrado vai só o SMS de orientação.
6. **Logout:** o access token carrega o `sessaoId` (id do `RefreshToken`); o logout revoga essa
   sessão e apaga o cookie.
7. **`PATCH` de paciente com `cpf`** → 422 `CPF_IMUTAVEL` para qualquer papel, conferido antes
   do 403 `CAMPO_NAO_EDITAVEL`.
8. **`dias-disponiveis`:** para C conta só horários no passo; para R/D conta também janelas de encaixe.
9. **Procedimento inexistente ou inativo** em `horarios-livres` e `dias-disponiveis` → 404.
10. **Ordem das checagens em `POST /api/consultas`** (o primeiro erro vence): entrada (400) →
    paciente, dentista e procedimento existem e são visíveis (404) → `DENTISTA_INATIVO` /
    `PROCEDIMENTO_INATIVO` → `HORARIO_NO_PASSADO` (C) → `FORA_DOS_5_MINUTOS` (R/D) →
    `FORA_DA_GRADE` → `FORA_DO_PASSO` (C) → `HORARIO_BLOQUEADO` → sobreposição (banco).
    "No passado" = `inicio` antes de agora.
11. **Remarcação feita pela clínica** manda **um** SMS ao paciente com o horário novo.
12. **`ADMIN_INICIAL_*`** são conferidas só pelo seed, não pela subida do servidor.
13. **Postgres de desenvolvimento:** `POSTGRES_USER` e `POSTGRES_PASSWORD` em `backend/.env`,
    lidas pelo Docker Compose.

**Por quê:**
1. Erro de digitação na recepção criaria um CPF errado UNIQUE, que travaria o verdadeiro dono
   no autocadastro.
2. Sem recomeçar a contagem, a primeira falha depois do bloqueio travaria de novo na hora; e
   tentativas durante o bloqueio estendendo o prazo deixariam um atacante travar a recepção
   para sempre (o motivo da D19).
3. Janela móvel não deixa 5 pedidos às 23:59 e mais 5 à 00:01. Somar as finalidades impede
   contornar o limite trocando de rota.
4. e 5. Mesmo princípio da D5 e da D19: o comportamento não pode revelar se a conta existe.
6. O cookie só vai para `/api/auth/refresh` (D19), então a rota de logout não o recebe.
7. CPF é imutável para todos; a resposta não deve depender do papel de quem tentou.
8. A recepção encaixa fora do passo (D12.3); um dia com só janela de encaixe tem vaga para ela.
9. O cliente não vê procedimento inativo (`docs/api.md`); 404 é a mesma resposta para os dois casos.
10. Erros de entrada e de permissão antes dos de regra; checagens baratas antes da transação.
11. Remarcação é uma ação só para o paciente; dois SMS (cancelada + nova) confundiriam.
12. O servidor não usa essas variáveis; exigir na subida obrigaria a mantê-las em produção.
13. Senha do banco fora do código e do git (D8).

**Alternativas descartadas:**
- *CPF só com formato (11 dígitos):* aceita erro de digitação.
- *Bloqueio do funcionário estendido a cada tentativa:* trava a recepção (acima).
- *Limite por dia de calendário:* acima.
- *Cookie de refresh com path `/api/auth`:* também resolveria o logout, mas mandaria o cookie a
  rotas que não precisam dele.
- *Dois SMS na remarcação:* acima.

## D26 — Postgres do Docker na porta 5433 do host

> **Status: fechada.**
> Encontrada na Tarefa 2 do plano, ao rodar a primeira migration.

**O quê:**
O `docker-compose.yml` publica o Postgres do container em `localhost:5433` (`"5433:5432"`).
`DATABASE_URL` e `DATABASE_URL_TESTE` em `backend/.env` usam a porta 5433.

**Por quê:**
Na máquina de um dos devs já havia um Postgres instalado no Windows escutando na 5432. Com os dois
na mesma porta, `localhost:5432` caía no Postgres local, e o Prisma falhava com `P1000`
(credenciais inválidas) mesmo com o `.env` certo. O `docker compose exec … psql` da Tarefa 1 não
pegou o problema porque entra direto no container, sem passar pela porta. A 5433 é a porta
seguinte, livre em instalação padrão, e não exige mexer em nada da máquina.

**Alternativas descartadas:**
- *Parar o serviço do Postgres do Windows:* resolve numa máquina só; o próximo dev com Postgres
  instalado cai no mesmo erro sem saber por quê.
- *Usar o Postgres do Windows:* contraria a D8 (mesma versão para os dois devs via Docker).

**Em aberto:** nada.

## D27 — Login: a 3ª falha e o tempo de resposta

> **Status: fechada.**
> Encontrada na Tarefa 6 do plano; detalha D5, D19 e D25.2 sem mudar nenhuma delas.

**O quê:**
1. **A tentativa que completa 3 falhas já responde 423** `CONTA_BLOQUEADA`, e não 401. No cliente,
   é nela que as sessões abertas são revogadas (D19).
2. **CPF ou e-mail inexistente também passa pelo bcrypt**, comparado com um hash fictício, antes de
   responder 401.
3. **As falhas contam pela ordem**, e não pelo horário: entram as falhas registradas depois do
   último `SUCESSO` ou `REDEFINICAO`, mesmo que tenham ocorrido no mesmo instante.

**Por quê:**
1. O `docs/api.md` define 423 como "3 falhas desde o último acerto", e na 3ª falha essa condição já
   vale. O paciente fica sabendo na hora que precisa redefinir a senha, em vez de errar uma 4ª vez
   para descobrir.
2. Sem isso, CPF inexistente responderia em ~1 ms e CPF real em ~250 ms (bcrypt custo 12). A
   diferença de tempo revelaria quais CPFs têm conta — a enumeração que a D5 quer evitar.
3. Comparando horário, um acerto e uma falha no mesmo milissegundo ficariam empatados, e a falha
   deixaria de contar.

**Alternativas descartadas:**
- *401 na 3ª falha e 423 só a partir da 4ª:* o paciente erra mais uma vez sem saber que já está
  bloqueado.
- *Responder rápido para identificador inexistente:* revela quem tem conta pelo tempo de resposta.

**Em aberto:** nada.

## D28 — E-mail sempre em minúsculas

> **Status: fechada.** Escolha do grupo na Tarefa 6 do plano.

**O quê:**
- Todo e-mail recebido pela API (login e recuperação de funcionário, cadastro e edição de
  funcionário e de paciente) é convertido para minúsculas antes de qualquer uso.
- O banco garante: `CHECK (email = lower(email))` em `Funcionario` e em `Cliente`
  (migration `email_minusculo`).

**Por quê:**
O e-mail é o login do funcionário (D2). Sem normalizar, `Ana@colzani.com.br` e
`ana@colzani.com.br` seriam contas diferentes: a funcionária digitaria com maiúscula e receberia
"credenciais inválidas", e o UNIQUE deixaria cadastrar a mesma pessoa duas vezes. O CHECK pega o
que não passa pela API (seed, inserção direta). No paciente o e-mail é só contato (D1.1), mas a
regra é a mesma para não haver dois formatos no banco.

**Alternativas descartadas:**
- *Comparar sem diferenciar maiúsculas no login (`lower(email)` na consulta):* o UNIQUE continuaria
  aceitando as duas grafias como contas diferentes.
- *Tipo `citext` do Postgres:* exige mais uma extensão e o Prisma o trata como texto comum; o
  CHECK resolve com o que já existe.

**Em aberto:** nada.

## D29 — Rotação do refresh mantém o prazo da sessão

> **Status: fechada.**
> Encontrada na Tarefa 7 do plano; a D19 fixa a rotação, mas não diz qual prazo o token novo recebe.

**O quê:**
1. Na rotação (`POST /api/auth/refresh`), o refresh novo herda o `expiraEm` da sessão original.
   O prazo conta do **login**: 12 h para funcionário e 30 dias para cliente, por mais que o refresh
   seja usado nesse meio-tempo. Depois disso, só fazendo login de novo.
2. Funcionário desativado não renova a sessão (401), mesmo que alguma sessão dele tenha escapado da
   revogação da D21.5.

**Por quê:**
1. O front renova o access token a cada 15 min enquanto a aba está aberta. Se cada renovação desse
   um prazo novo, a sessão esquecida aberta no computador da recepção nunca venceria — exatamente o
   que as 12 h da D19 queriam impedir.
2. A revogação ao desativar (D21.5) acontece numa rota; a checagem no refresh garante a regra mesmo
   se a desativação vier por outro caminho (seed, banco).

**Alternativas descartadas:**
- *Prazo renovado a cada uso (janela deslizante):* sessão de funcionário eterna enquanto houver uma
  aba aberta.

**Em aberto:** nada.

## D30 — Front integrado à API em fatias

> **Status: fechada.**
> Aprovada pelo usuário depois da Tarefa 9; muda a seção 2 da spec, que deixava o front fora do MVP.

**O quê:**
1. O front (`src/`) passa a usar a API real em três fatias, cada uma logo depois que o backend do
   domínio fica pronto: **F1 autenticação** (depois da Tarefa 9), **F2 pacientes** (depois da
   Tarefa 13), **F3 agenda e consultas** (depois da Tarefa 21). Tarefas no plano de implementação.
2. O proxy `/api` do Vite sai da Tarefa 23 e entra na F1 (sem ele o cookie de refresh não chega, D19).
3. O contrato é `docs/api.md`. Se o front precisar de algo que a API não dá, vira decisão nova e
   mudança no `api.md`; não se contorna no front.
4. Visual: as 8 telas do Figma listadas no `CLAUDE.md`.
5. **Verificação do front:** Vitest só no cliente HTTP (token em memória, renovação no 401, formato
   de erro); as telas são conferidas com `npm run lint`, `npm run build` e uso no navegador contra a
   API rodando.

**Por quê:**
1. Erro de contrato aparece com o backend ainda em construção, quando mudar o `api.md` é barato —
   não depois da Tarefa 23.
2. As armadilhas do protótipo (login por e-mail, `Dr. Silva` fixo, preços em string) saem enquanto
   a decisão que as substitui está fresca.
3. Teste automático onde a falha é silenciosa e difícil de ver na tela (renovação de sessão); as
   telas serão refeitas, e teste de tela se perderia junto.

**Alternativas descartadas:**
- *Front só depois da Tarefa 23:* o contrato só seria exercitado quando mudá-lo custasse mais.
- *Front em paralelo com dados simulados (mocks):* duplica o contrato em mocks que divergem da API.
- *Vitest + Testing Library nas telas:* 1–2 h a mais por fatia em telas que serão refeitas.

**Em aberto:**
1. O Figma não tem tela para o paciente logado (C). Na F1 ele cai numa página simples (nome e
   sair); a F3 decide o resto.

## Próximo

1. ~~Spec consolidada do backend.~~ Feita: `docs/spec-backend-mvp.md`.
2. ~~Plano de implementação.~~ Feito: `docs/plano-implementacao.md`. Execução tarefa por tarefa;
   progresso nos checkboxes do plano (Tarefas 0–9 feitas: ambiente, schema Prisma e migration
   com as restrições do banco, utilitários de relógio, fuso, CPF e paginação, app Express com
   middleware de erro, logger e mensageria, senhas, JWT e papéis, login com bloqueio, refresh,
   logout e `eu`, códigos de verificação e recuperação de senha, autocadastro e ativação; e a
   fatia F1 do front, autenticação ligada à API — D30).
3. Pendências que **não** travam os endpoints (dependem de dados ou respostas da Colzani):
   D11.1, D11.3, D15.3, D18 (`dataInicio`).
4. Analisar o Figma (8 primeiras telas) e cruzar com `docs/api.md` — desbloqueado: usar a
   cópia com acesso de edição indicada no `CLAUDE.md`.
