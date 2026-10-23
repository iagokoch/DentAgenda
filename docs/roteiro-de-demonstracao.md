# Roteiro de demonstração (10 a 15 min)

Tudo pelas telas, nos quatro papéis (recepção, dentista, admin e paciente), sem Swagger nem chamada à API na mão. A
única janela fora do navegador é o terminal da API, onde aparecem os códigos dos SMS e e-mails simulados (D16).

## Antes da apresentação (uma vez, uns 10 min)

1. Suba tudo como no README: `docker compose up -d`, `npm run db:migrate`, `npm run db:seed`, `npm run db:seed:dev` e
   `npm run dev` em `backend/`; `npm run dev` na raiz. Abra `http://localhost:5173`.
   - Rode o `db:seed:dev` **no dia** da apresentação: ele cria o paciente de exemplo com uma consulta no último dia útil
     (para "marcar como realizada") e outra no próximo (D41).
2. Defina as senhas em **Esqueci minha senha** (o código de 6 dígitos aparece no terminal da API), uma por conta:
   - admin: o e-mail de `ADMIN_INICIAL_EMAIL` do `backend/.env`;
   - recepção: `carla.souza@exemplo.dev`;
   - dentista: `ana.costa@exemplo.dev`.
3. Deixe abertas três janelas anônimas (ou perfis do navegador), uma por papel, já logadas: a sessão de uma não derruba a
   das outras.

## Na apresentação

### 1. Recepção — o dia da clínica (Carla)

1. **Início:** consultas de hoje, próxima consulta, total de pacientes e o lembrete "1 consulta já passou e ainda não foi
   marcada como realizada".
2. **Pacientes:** busque `marcos` (a busca ignora acento e maiúscula) → abra **Marcos Oliveira (exemplo)**. Mostre dados,
   alertas (adicione "Alergia a látex") e a aba **Histórico**. Teclado: setas trocam de aba.
3. **Agendar Consulta:** Limpeza, Dra. Ana Costa, um dia da semana que vem, 09:00 → **Confirmar Agendamento** → **Ver
   consulta**.
4. **Conflito de horário (409):** abra **Novo Agendamento** em **duas abas**, escolha o mesmo paciente, dia e horário nas
   duas e confirme as duas. A segunda mostra "Esse horário acabou de ser ocupado. Escolha outro horário." e recarrega as
   vagas.
5. **Remarcar** a consulta do passo 3 para 10:00: a original aparece como Cancelada no Histórico (nos detalhes dela,
   "por a clínica"), e o terminal da API mostra o SMS ao paciente com o horário novo.
6. **Cancelar consulta** a criada no passo 4: a clínica não precisa de justificativa; o SMS sai no terminal.

### 2. Dentista — o atendimento (Ana)

1. **Início:** mesmo lembrete de consulta pendente. Abra a consulta: **Pacientes** → `marcos` → **Marcos Oliveira
   (exemplo)** → aba **Histórico** → a consulta do último dia útil, às 09:00.
2. **Observações:** escreva "Dente 24 – oclusal. Sem intercorrências." → salve → edite de novo: o histórico mostra as
   duas versões, com o nome da Ana.
3. **Marcar como realizada:** o status vira Realizada, e o lembrete do Início some. Numa consulta futura o botão fica
   desabilitado ("disponível a partir do horário da consulta").
4. **Disponibilidade:** a Ana vê só a própria grade (sem editar) e bloqueia uma tarde (ex.: sexta 14:00–18:00). Volte
   ao Novo Agendamento na janela da recepção: a tarde bloqueada não oferece horário.

### 3. Admin — a clínica por trás (admin inicial)

1. **Equipe:** lista com categoria, admin e situação. **Novo funcionário** (ex.: dentista com CRO): a tela avisa que a
   pessoa define a senha em "Esqueci minha senha". Tente **Desativar** o único admin: a API recusa ("Precisa existir pelo
   menos um administrador ativo").
2. **Procedimentos:** preço em reais (enviado em centavos), duração. Desative um: ele some do agendamento.
3. **Disponibilidade:** o admin edita a grade (ex.: tira a quarta à tarde) e, se houver consulta confirmada nela, a
   tela lista as consultas que ficaram fora da grade — nada é cancelado sozinho.
4. Matriz de papéis: a recepção não vê Equipe nem Procedimentos no menu, e abrir `/admin/equipe` na janela dela volta
   para o Início (a API responderia 403).

### 4. Paciente — a área dele

1. Saia e vá em **Cadastre-se** com o CPF `123.456.789-09` (o paciente que a clínica cadastrou) e qualquer celular.
   O código vai para o celular **que a clínica tem** (veja no terminal: `47999990000`) — é a ativação da conta (D15).
2. Em **Minhas consultas**: próximas e histórico. **Cancelar** a do próximo dia útil: se faltar menos de 24 h, a
   justificativa já vem obrigatória.
3. **Marcar consulta:** o paciente só vê horários no passo do procedimento e só procedimentos ativos.

### 5. Fechamento (opcional, 2 min)

- **Celular:** ferramentas do navegador → modo dispositivo, 400px: menu embaixo, Sair no topo.
- **Qualidade:** `npm test` na raiz e em `backend/` (front com axe nas telas; backend com o ponta a ponta, a matriz de
  43 rotas × 5 papéis e as corridas de login). Decisões em `docs/documentacao.md` (D1 a D41).

## Se algo der errado

- **Código de verificação não chegou:** ele está no terminal da API (D16). Muitos pedidos seguidos dão
  `LIMITE_DE_CODIGOS` (3 por hora por CPF ou e-mail): use outra conta.
- **"Muitos pedidos deste endereço":** o limite de 200 pedidos por 15 min em login e códigos (D32). Reinicie a API para
  zerar o contador.
- **Sem horários livres:** a dentista precisa de grade (Disponibilidade) e o procedimento precisa estar ativo.
