# Decisões de design — DentAgenda backend

## D1 — Separação entre Cliente e Login

**O quê:**
Duas tabelas: `Cliente` (cliente.id, nome, cpf, telefone, e-mail, nascimento, convênio, criadoEm, pacienteDesde) e `Login` (id, clienteId FK único para Cliente.id, senha,e-mail). Nem todo cliente tem linha em Login. A ligação entre as duas é o `clienteId`, não o e-mail.

**Por quê:**
"Senha obrigatória só se tiver login" é uma regra condicional que NOT NULL não expressa numa tabela única. Exemplo: paciente cadastrado por telefone pela secretária não tem login — senha ficaria null nele, e nada no banco distingue esse caso de um bug (login sem senha). Numa tabela onde toda linha É um login, senha volta a ser NOT NULL de verdade, garantido pelo banco.

**Alternativa descartada:**
Tabela única `Cliente` com `senha` nullable. Quebrava porque não havia como o schema garantir "todo login tem senha" — a regra ficava só no código da aplicação.
