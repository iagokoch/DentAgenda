# Decisões de design — DentAgenda backend

Cada decisão tem status. **Fechada** pode virar schema/código. **Parcial** tem itens em
"Em aberto" que precisam fechar antes de virar código.

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
- O que cada categoria (e o cliente) pode fazer — matriz de permissões. Depende da máquina de estados de `Consulta`.

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
4. Provedor de SMS e de e-mail.

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

## Próximo: `Consulta`

Nada decidido ainda. Primeiro esboço em discussão: data/hora, paciente, dentista; estados criado → aguardando confirmação do médico → aguardando confirmação do paciente → concluída. Falta: justificar cada campo, duração, onde fica o estado, conflito de horário, cancelamento, não comparecimento.
