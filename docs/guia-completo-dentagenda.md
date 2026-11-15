# Guia completo do DentAgenda

Documento para explicar o sistema numa apresentação acadêmica. Fontes: o código atual, `docs/documentacao.md` (decisões D1 a D47), `docs/api.md` e `docs/matriz-de-papeis.md`. Em caso de conflito, vale `docs/documentacao.md`.

## 1. Visão geral

**O que é.** Sistema web de organização de agendas e consultas odontológicas, desenvolvido em grupo (PAC VI, Engenharia de Software) em parceria com a Colzani Odontologia.

**Problema.** A clínica precisa marcar, remarcar e cancelar consultas sem sobreposição de horários, saber quem atende quando, e manter o histórico do paciente num só lugar.

**Público.** Quatro perfis: administração, recepção, dentistas e pacientes.

**Objetivos do MVP** (README, "Próximos passos"): autenticação, rotas protegidas por perfil e CRUD de consultas (criar, ver, remarcar, cancelar). Fora do MVP, por decisão: abas Documentos e Financeiro (aparecem como "em breve").

## 2. Tecnologias

| Camada | Tecnologia | Papel |
|---|---|---|
| Front-end | React 19, Vite, react-router-dom | Telas e rotas do navegador |
| Back-end | Node 24, TypeScript, Express 5 | API HTTP (43 rotas) |
| Validação | Zod 4 | Valida entradas; gera a documentação Swagger (só fora de produção) |
| Banco | PostgreSQL 17 | Dados e garantia contra conflito de horário |
| ORM | Prisma 7 (driver adapter `pg`) | Acesso tipado ao banco e migrations |
| Segurança | bcrypt, jsonwebtoken, helmet, express-rate-limit | Senhas, sessões, cabeçalhos e limite por IP |
| Logs | pino | Logs estruturados |
| Testes | Vitest + Supertest (API); Testing Library + jsdom + axe-core (front) | Testes contra Postgres real, de tela e de acessibilidade |
| Infra | Docker Compose, Nginx | Banco, API e frontend compilado em containers |
| Acesso remoto | Cloudflare Quick Tunnel (cloudflared) | URL HTTPS temporária para a demonstração |

## 3. Arquitetura

**Fluxo:** navegador → front (React) → API (`/api`, mesma origem) → Prisma → PostgreSQL.

**Back-end por domínio**, em camadas: rota → controller → service → Prisma. Módulos: `auth`, `pacientes`, `funcionarios`, `procedimentos`, `disponibilidade` (grade, bloqueios, horários livres) e `consultas`. Código compartilhado: erros, validação, datas (fuso de São Paulo), senhas, tokens, travas e retenção.

**Autenticação.** Dois logins: paciente entra por CPF, funcionário por e-mail (a tela tem um campo único "CPF ou e-mail"). O login devolve um *access token* JWT curto e um *refresh token* em cookie `httpOnly`, guardado no banco só como hash e revogável (D9, D19). O front mantém o token em memória e renova pelo refresh; recarregar a página restaura a sessão.

**Autorização.** Papéis: recepcionista, dentista, paciente e `isAdmin` (flag somada à categoria, D10). A API confere o papel em toda rota; a tela apenas esconde. Recurso de outro dentista ou paciente responde 404, para não confirmar que existe (D20). A matriz completa está em `docs/matriz-de-papeis.md` e é conferida por teste.

**Sessões.** A sessão é conferida no banco em toda rota autenticada (D31); logout e redefinição de senha derrubam sessões.

**Erros.** Respostas padronizadas com `codigo` (por exemplo `NAO_AUTENTICADO`, `SEM_PERMISSAO`, `LIMITE_DE_REQUISICOES`); todo código documentado em `docs/api.md` tem teste (`npm run conferir:codigos`).

## 4. Perfis de usuário

| Perfil | Pode | Limitações |
|---|---|---|
| **Administração** (`isAdmin`) | Gerenciar equipe e procedimentos, editar a grade semanal dos dentistas, além do que a recepção ou dentista da conta fizer | O sistema recusa remover ou desativar o último admin |
| **Recepção** | Cadastrar e editar pacientes, marcar/remarcar/cancelar consultas de qualquer paciente, marcar realizada, ver pendentes, bloqueios de todos (em lote), ler a grade | Não gerencia equipe nem procedimentos; não edita a grade |
| **Dentista** | Ver só a própria agenda, criar e cancelar consultas da própria agenda, realizar consulta, observações, alertas, bloqueios próprios | Não vê agenda de colegas; não cadastra pacientes |
| **Paciente** | Ver horários livres, marcar, remarcar e cancelar as próprias consultas, editar os próprios dados e endereço | Só os próprios dados; cancelamento com menos de 24 h exige justificativa; não cancela depois do início |

## 5. Funcionalidades

- **Login e logout**, ativação e cadastro em duas etapas (código por SMS) e recuperação de senha (código de 6 dígitos).
- **Pacientes:** busca, cadastro (só recepção), perfil com dados, endereço, alertas, edição e histórico.
- **Funcionários e procedimentos:** telas `/admin/equipe` e `/admin/procedimentos`, somente administração.
- **Disponibilidade:** grade semanal por dentista (faixas por dia da semana) e bloqueios (férias, cursos).
- **Agenda e agendamento:** escolha de mês, dia e horário; a clínica encaixa em qualquer minuto livre (múltiplos de 5), o paciente segue o passo da duração do procedimento.
- **Remarcação:** é cancelar e criar nova, e o histórico mostra a original cancelada (D14).
- **Cancelamento:** clínica e paciente; justificativa obrigatória do paciente a menos de 24 h.
- **Consultas:** estados `CONFIRMADA`, `REALIZADA` e `CANCELADA`; consultas passadas ainda confirmadas aparecem como pendentes para a recepção.
- **Observações** da consulta, com histórico de versões; **alertas** do paciente.
- **Início:** saudação e indicadores reais da clínica.

## 6. Regras de negócio

- **Sem conflito de horário:** o banco garante com restrição de exclusão sobre o intervalo da consulta (D6, D13); dois pedidos para o mesmo horário: o segundo recebe erro. Há também travas contra pedidos simultâneos (D22.7, D38).
- **Horário livre** = grade − bloqueios − consultas não canceladas; a consulta precisa caber inteira numa faixa (D12).
- **Bloqueio** sobre consulta já confirmada é recusado.
- **Grade alterada** com consultas futuras fora dela: a mudança é aceita, nenhuma consulta é cancelada sozinha e a resposta lista as afetadas.
- **Consulta nasce confirmada**, sem etapa de aprovação (D13). Paciente não cancela depois do início.
- **Bloqueio de login:** 3 falhas seguidas bloqueiam a conta do paciente até redefinir a senha; do funcionário, por 15 min (D5, D19). Tentativas são registradas, inclusive de CPF inexistente.
- **Transações:** operações de agendamento, login, refresh e códigos são seguras em pedidos simultâneos (D38).
- **Alterações inválidas:** Zod valida toda entrada; paciente só altera campos permitidos (`CAMPO_NAO_EDITAVEL`).
- **Retenção:** `npm run limpar:dados` apaga dados antigos por prazo (D40; 90 dias provisórios).

## 7. Segurança

Proteções existentes: senhas com bcrypt; JWT curto; refresh em cookie `httpOnly`, rotativo e revogável; CSRF (D19); `helmet`; limite de 200 pedidos por IP a cada 15 min em `/api/auth` (D32, D40); sem CORS (mesma origem); sessão conferida no banco; autorização por papel em todas as rotas.

**Perfil de demonstração remota (D47):** dados fictícios; produção real nunca usa o enviador de log (D16 preservada). Neste perfil cadastro e recuperação respondem 503, nenhum SMS ou e-mail real é enviado e nenhum código é exibido. O Nginx só aceita IP de cliente e HTTPS vindos do conector do túnel; o PostgreSQL não tem porta publicada.

**Cloudflare × DentAgenda.** O Quick Tunnel só entrega o tráfego HTTPS até o computador de casa. No modo restrito, a Cloudflare autenticava por e-mail e PIN (Access); no modo público, não há autenticação Cloudflare. **A autenticação do DentAgenda (CPF/e-mail e senha) é sempre obrigatória** para qualquer funcionalidade; a URL pública mostra só a tela de login e os arquivos do front.

## 8. Infraestrutura

**Local (D46):** `scripts/demo-local.ps1` sobe o ambiente fictício em `http://127.0.0.1:5173`, sempre disponível como contingência.

**Remoto (D47):** Docker Compose com `banco` (PostgreSQL), `api`, `front` (Nginx com o front compilado e `/api` na mesma origem) e `conector` (cloudflared, só quando se abre o túnel). Redes separadas: banco só acessível pela API; apenas o conector fala com o front. Quick Tunnel é temporário, sem garantia de disponibilidade e gera uma URL nova a cada execução. Operação: `docs/operacao-remota.md`.

## 9. Testes e qualidade

- API: Vitest + Supertest contra Postgres real, incluindo matriz de papéis (43 rotas × 5 papéis) e testes de corrida; fluxo ponta a ponta da clínica.
- Front: testes de tela (Testing Library + jsdom), axe em 14 telas, nenhum botão sem ação, relógio injetado.
- Demonstração remota: testes de configuração, mensageria e proxy; `RemotoVerificar` percorre 12 grupos pela cadeia compilada (quatro perfis, permissões, agendamento, conflito, remarcação, cancelamento, CSRF, rotação do refresh e logout).
- Último total informado pelo grupo: 1.039 testes aprovados.
- **Validado só localmente** (cadeia interna). A validação por URL externa (HTTPS, cookies no navegador, sessão após minutos) é registrada em `docs/operacao-remota.md`.

## 10. Limitações e próximos passos

- Enviador real de SMS e e-mail (issue #1); sem ele a API recusa `NODE_ENV=production`.
- Respostas da clínica em `docs/pendencias-colzani.md` (retenção, paciente marcar pelo sistema).
- Conferência humana no navegador e celular reais.
- Deploy permanente: túnel nomeado ou servidor próprio, domínio, backups e monitoramento.
- Abas Documentos e Financeiro; interface de `janelasLivres`; consulta passada não marcada permanece confirmada (sem estado `FALTOU`).
