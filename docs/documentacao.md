# Decisões de design — DentAgenda backend

Cada decisão tem status. **Fechada** pode virar schema/código. **Parcial** tem itens em
"Em aberto" que precisam fechar antes de virar código.

| #    | Decisão                                         | Status                       |
|------|-------------------------------------------------|------------------------------|
| D1   | Separação entre Cliente e Login                 | Fechada                      |
| D1.1 | Identificação e contato do Cliente              | Fechada (pendência Colzani)  |
| D2   | Funcionário autentica pela própria tabela       | Fechada quanto à autenticação|
| D3   | Autenticação em dois endpoints                  | Parcial                      |
| D4   | `pacienteDesde`                                 | Parcial                      |
| D5   | Registro de tentativas de login                 | Parcial                      |
| D6   | Banco de dados: PostgreSQL                      | Fechada                      |
| D7   | Linguagem: TypeScript no Node                   | Fechada                      |
| D8   | Repositório e ambiente de desenvolvimento       | Fechada                      |
| D9   | Sessão: JWT curto + refresh revogável           | Parcial                      |
| D10  | Papéis e administração                          | Parcial                      |
| D11  | Procedimento                                    | Parcial                      |
| D12  | Disponibilidade dos dentistas                   | Parcial                      |
| D13  | Consulta: criação e estados                     | Parcial                      |
| D14  | Cancelamento e remarcação                       | Parcial                      |
| D15  | Ativação de conta de paciente já cadastrado     | Parcial                      |
| D16  | SMS e e-mail simulados no MVP                   | Fechada                      |

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

> **Status: parcial.**

**O quê:**
- Login de cliente (CPF + senha) e login de funcionário (e-mail + senha) são endpoints separados. Identificador em formato inválido → erro, sem tentar autenticar.
- CPF/e-mail inexistente e senha errada recebem a **mesma** mensagem de erro.
- Recuperação de senha **entra no MVP**: cliente recebe código por SMS no telefone cadastrado; funcionário, por e-mail. Código de 6 dígitos, válido por 10 min, 3 tentativas.
- Mais de 4 pedidos de código → erro e espera de 5 min.

**Por quê:**
- *Endpoints separados:* cliente e funcionário precisam de regras de proteção diferentes. Todos os funcionários saem pelo mesmo IP público da clínica (NAT), então bloqueio por IP no login de funcionário travaria a recepção inteira. Endpoints separados deixam cada regra explícita, sem adivinhar o tipo de usuário pelo formato do identificador.
- *Mensagem única:* evita enumeração de contas — o atacante não descobre quais CPFs/e-mails existem.
- *Recuperação no MVP:* login sem recuperação não é login completo.

**Alternativa descartada:**
Um endpoint só, detectando o formato do identificador.

**Em aberto:**
1. Limite de pedidos de código: calcular quantos SMS um atacante dispara por CPF em 1 h e em 1 dia com a regra atual, e decidir se é aceitável (cada SMS tem custo).
2. Endpoint de recuperação também pode vazar enumeração ("código enviado" vs. "CPF não encontrado").
3. Onde o código de recuperação fica guardado. Cliente e funcionário recebem código — uma tabela com FK para quem?
   A mesma pergunta aparece no código de ativação (D15) e no refresh token (D9) — decidir as três juntas.
4. ~~Provedor de SMS e de e-mail.~~ Fechado para o MVP pela D16 (envio simulado).

## D4 — `pacienteDesde`

> **Status: parcial.**

**O quê:**
`pacienteDesde` em `Cliente` significa "início do vínculo com a clínica". Paciente novo: data do cadastro. Paciente antigo (histórico em papel, anterior ao sistema): informada pela secretária. A secretária pode corrigir o valor depois.

**Por quê:**
Quem se cadastra já é paciente, mesmo que falte à primeira consulta. O histórico anterior ao sistema não está em `Consulta`, e a secretária é a fonte confiável dessa data — o paciente pode não lembrar.

**Alternativa descartada:**
Derivar da primeira consulta. Quem se cadastrou e faltou também é paciente, e o histórico em papel nunca estaria em `Consulta`.

**Em aberto:**
1. Para paciente novo o valor repete `criadoEm`. A D1.1 recusou duplicação porque o valor podia divergir — justificar por que aqui é aceitável (`criadoEm` muda algum dia?).
2. Nulabilidade: paciente antigo que se autocadastra fica com a data do cadastro até a secretária corrigir, ou fica null? Se null, o que o null significa?

## D5 — Registro de tentativas de login

> **Status: parcial.**

**O quê:**
Tabela de eventos com uma linha por tentativa de login (cliente e funcionário): identificador digitado (texto, **sem FK**), IP, data/hora e resultado (sucesso/falha). Acertos também são gravados.
- *Bloqueio da conta:* 3 falhas com o mesmo identificador depois do último acerto → conta bloqueada até redefinir a senha.
- *Bloqueio por IP:* só no endpoint de cliente (ver D3).

**Por quê:**
O fato registrado é a tentativa, não a pessoa — por isso CPF inexistente também é gravado e bloqueia igual, sem permitir enumeração pelo comportamento do bloqueio. Acertos ficam gravados porque marcam o ponto a partir do qual se contam as falhas e preservam o histórico de ataque.

**Alternativas descartadas:**
- *Contador em `Login`/`Cliente`:* não registra CPF inexistente.
- *Gravar a senha digitada:* tentativas erradas costumam ser quase-senhas e vazariam em texto puro.
- *Apagar as linhas no acerto:* perde o histórico ("alguém tentou invadir a conta do Marcos ontem?").
- *Bloqueio permanente desbloqueado pela secretária:* qualquer um com o CPF de um paciente travaria a conta dele e a recepção.

**Em aberto:**
1. Regra por IP: limite e janela de tempo. Precisa ser bem maior que o limite por CPF — um IP pode ser a sala de espera inteira ou milhares de clientes de operadora (CGNAT). Proposta atual (3 falhas → 5/15/30 min/24 h) bloqueia o IP com um único paciente errando 3 vezes.
2. Identificador em uma coluna (CPF ou e-mail) ou duas? Se uma, a linha precisa saber de qual endpoint veio?
3. Como a redefinição de senha aparece no registro, para que as falhas anteriores parem de contar.
4. O bloqueio "até redefinir" vale também para funcionário (que recupera por e-mail)?

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
- `backend/schema` (rascunho em texto) vira `backend/prisma/schema.prisma` quando a modelagem fechar.
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
- `.gitignore` ainda **não** cobre `.env` — precisa entrar antes do primeiro commit do backend.
- Docker Desktop instalado nas duas máquinas.

## D9 — Sessão: JWT curto + refresh revogável

> **Status: parcial.**

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
1. Validade do refresh e se ele é trocado a cada uso (rotação).
2. Tabela de refresh: cliente e funcionário têm sessão — mesma pergunta de FK da D3.3.
3. CSRF: o cookie vai automaticamente em toda requisição, então o endpoint de refresh precisa
   de proteção (`SameSite`, front e API no mesmo domínio?).

## D10 — Papéis e administração

> **Status: parcial.**

**O quê:**
- Papéis: **CLIENTE** (quem tem linha em `Login`), **RECEPCIONISTA**, **DENTISTA** e **admin**.
- `Funcionario.categoria` ∈ {RECEPCIONISTA, DENTISTA} (como na D2) + `isAdmin` boolean
  NOT NULL, padrão `false`.

Permissões já decididas:

| Papel          | Pode                                                                      |
|----------------|---------------------------------------------------------------------------|
| Admin          | Gerenciar funcionários, procedimentos (D11) e grades semanais (D12)       |
| Recepcionista  | Gerenciar pacientes, consultas de qualquer paciente e bloqueios (D12)     |
| Dentista       | Ver a própria agenda                                                      |
| Cliente        | Ver horários livres, criar e cancelar as próprias consultas               |

**Por quê `isAdmin` separado da categoria:**
O dono da clínica atende como dentista e também administra. Com ADMIN como categoria ele
precisaria de duas contas — dois e-mails, já que a D2 exige e-mail UNIQUE — e as consultas
dele ficariam presas a uma conta diferente da que administra.

**Alternativas descartadas:**
- *ADMIN como categoria:* obriga o dono a ter duas contas (acima).
- *Recepção administra tudo:* qualquer recepcionista criaria contas e mudaria preços.
- *Dentista e recepção com as mesmas permissões:* nenhum controle.

**Em aberto:**
1. Dentista vê a agenda dos outros dentistas? Cria/cancela consulta? Cadastra o próprio bloqueio?
2. Quem marca a consulta como REALIZADA (D13).
3. Quem pode ver dados de saúde do paciente (dado sensível pela LGPD).
4. Admin pode remover o próprio `isAdmin`? O que impede a clínica de ficar sem nenhum admin?

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
2. Procedimento que deixa de ser oferecido não pode ser apagado se já tem consultas. Desativar?
3. Se a clínica tiver especialistas, `DentistaProcedimento` volta para a mesa.

## D12 — Disponibilidade dos dentistas

> **Status: parcial.**

**O quê:**
- **Grade semanal** por dentista: faixas de (dia da semana, início, fim).
  Ex.: segunda 08:00–12:00 e 14:00–18:00. O almoço é o intervalo entre duas faixas.
- **Bloqueio:** período (início, fim) em que um dentista não atende — férias, curso, feriado.
- **Horário livre** = faixas da grade − bloqueios − consultas CONFIRMADAS.
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
1. Feriado/clínica fechada: um bloqueio por dentista, ou bloqueio sem dentista (clínica inteira)?
2. Fuso horário. Proposta: guardar em UTC (`timestamptz`) e calcular a grade em `America/Sao_Paulo`.
3. A recepção também fica presa ao passo, ou pode encaixar em qualquer minuto livre?
4. Bloqueio criado em cima de consulta já confirmada: recusa o bloqueio ou cancela a consulta?
5. Grade alterada quando já existem consultas futuras fora da nova grade.

## D13 — Consulta: criação e estados

> **Status: parcial.**
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
1. Quem marca REALIZADA (D10).
2. "Observações clínicas" (campo do protótipo) entra? Quem lê?
3. Registrar quem criou a consulta (paciente ou recepção) — o que quebra sem isso?
4. Consulta CONFIRMADA com horário já passado: fica assim ou aparece como pendente para a recepção?

## D14 — Cancelamento e remarcação

> **Status: parcial.**

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
1. Campos de cancelamento (quando, quem cancelou, justificativa) — justificar cada um.
2. A clínica também precisa justificar?
3. Paciente pode cancelar depois do horário de início? (Proposta: não.)
4. Cancelamento com menos de 24 h tem alguma consequência além da justificativa?
5. Paciente é avisado quando a clínica cancela? (O canal existe — D16.)

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
1. Enumeração: se CPF novo cria conta na hora e CPF existente dispara SMS, a resposta revela
   quem é paciente. Proposta: o autocadastro **sempre** verifica telefone por SMS (CPF novo →
   telefone informado; CPF existente → telefone cadastrado) e responde igual nos dois casos.
2. CPF que já tem `Login`: mesma resposta, e o SMS orienta a recuperar a senha?
3. Paciente trocou de telefone e a clínica tem o antigo: só a recepção resolve?
4. Código igual ao da D3 (6 dígitos, 10 min, 3 tentativas)? Mesma tabela (D3.3)?
5. Custo de SMS por autocadastro entra na conta da D3.1.

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

## Próximo

1. Escolher o framework HTTP (Express, Fastify ou NestJS) — abordagens em discussão.
2. Desenhar o modelo de dados completo, cruzando `backend/schema` com D1–D16.
3. Analisar o Figma (8 primeiras páginas) — **bloqueado**: a conta conectada não tem acesso
   de edição ao arquivo, e o MCP do Figma exige esse acesso.
