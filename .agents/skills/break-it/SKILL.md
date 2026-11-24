---
name: break-it
description: Executa auditorias controladas de QA destrutivo no DentAgenda, incluindo edge cases, fuzzing, property-based testing, testes de concorrência, mutation testing, automação E2E, falhas de dependências e testes de carga.
---

# Break-It — DentAgenda

Atue como QA sênior. Encontre defeitos ocultos com evidências reproduzíveis. Audite tudo ou o domínio solicitado; recomende correções sem implementá-las automaticamente.

## Preparar

1. Confirme remoto, commit e `git status`. Preserve alterações locais. Leia `CLAUDE.md`, instruções aplicáveis, README e os contratos pertinentes em `docs/`. `docs/documentacao.md` decide conflitos de negócio; confira as decisões mais recentes e pendências da clínica.
2. Mapeie rotas → controladores → serviços → Zod → Prisma e formulários → cliente HTTP → sessão. Identifique dependências externas, operações críticas e testes existentes antes de escolher lacunas.
3. Registre baseline antes dos testes novos: lint, typecheck, testes normais/embaralhados, build e conferência de códigos conforme scripts reais. Separe ambiente, hipótese e defeito reproduzido. Para comandos e instalação, consulte [execucao.md](references/execucao.md).

## Isolamento obrigatório

- Testes puros e E2E sintéticos usam configurações próprias. Navegador intercepta toda API e bloqueia rede externa; resposta não prevista falha o teste. Isso não comprova autorização da API nem persistência.
- Integrações usam `npm run qa:isolado -- <modo>` na pasta `backend/`: novo PostgreSQL em loopback, armazenamento efêmero, conferência por `SELECT current_database()` antes das migrations, segredos gerados em memória e nenhuma leitura de `.env` real. Execute arquivos sequencialmente. Nunca reutilize bancos desconhecidos, dados reais ou volumes existentes.
- Carga somente via runner descartável da referência: até 5 VUs, 30 segundos por cenário, API local, mensageria em memória. Sem túneis, serviços reais ou bombardeio de login/cadastro/recuperação. Na impossibilidade de provar isolamento, prepare scripts e registre a execução bloqueada.
- Nunca execute `docker compose down -v`, reset de migrations em banco existente, limpeza do banco de desenvolvimento ou caos em infraestrutura compartilhada. Não leia/exponha arquivos sensíveis, valores de segredos ou dados pessoais. Não faça commit, push ou PR automaticamente.

## Investigar

1. **Agenda primeiro:** exclusão por dentista e paciente no PostgreSQL, intervalos `[início,fim)`, durações diferentes, contato nas bordas, grade/bloqueios, remarcação/cancelamento concorrentes e repetição. Confira estado persistido e atomicidade; não imponha idempotência sem contrato. Use barreiras quando a ordem importa; `Promise.all` repetido demonstra disputa observada, não todas as intercalações.
2. **Permissões e sessão:** compare matriz de papéis automatizada, autorização por recurso e `404` de terceiros. Exercite tokens inválidos/expirados/revogados, refresh/logout/códigos concorrentes, múltiplas abas e canais alterados somente nas lacunas das suítes existentes. D42 e D44 prevalecem sobre documentação antiga.
3. **Propriedades e fuzzing:** CPF com verificadores independentes; normalização/idempotência de e-mail; tamanho de senha em caracteres e bytes UTF-8; datas/fuso/meia-noite; conservação e monotonicidade de vagas; paginação/filtros; transições de consulta; moedas/máscaras/grade frontend. Gere nulos, tipos errados, JSON malformado, campos extras, Unicode e limites numéricos/temporais. Fixe seed e registre seed/path do menor contraexemplo, sanitizando valores sensíveis. Respeite contatos compartilhados e decisões de escopo.
4. **Resiliência e interface:** simule timeout, HTTP 500 e falha de persistência/envio com mocks ou instâncias descartáveis; confira rollback e recuperação. E2E cobre perfis, navegação, cadastro, recuperação, reserva, cancelamento, erros, repetição, foco, teclado, acessibilidade e 400px. Amplie remarcação, administração e disponibilidade conforme risco, sem mudar componentes ou design.
5. **Mutação e carga:** inicie apenas em funções puras selecionadas (`horarios.ts`); use configuração sem setup PostgreSQL e um worker. Registre geradas/eliminadas/sobreviventes/timeouts/sem cobertura, score e análise dos sobreviventes equivalentes. Carga mede latência, erros e estabilidade dentro dos limites; declare exatamente os endpoints e operações medidos.

## Entregar

Execute rápidos → integração → mutação → E2E → carga segura. Reproduza falhas ao menos duas vezes quando viável. Testes que demonstram bugs ficam opt-in e podem terminar com exit 1: não enfraqueça expectativas para escondê-los.

Atualize `docs/qa/break-it-report.md` com commit/ambiente, ferramentas e versões verificadas, comandos/contagens, evidências sanitizadas, baseline, bugs com esperado/real/impacto/reprodução/sugestão, hipóteses, prioridade e limites. Não confunda score de um arquivo com cobertura global; não dê nota sem critérios. Diferencie falhas de ferramentas e fixtures de bugs de produção. Testes agressivos permanecem fora de `npm test`, CI, hooks e inicialização do agente.

## Invocações

`$break-it auditoria completa`; `$break-it somente backend`; `$break-it somente frontend`; `$break-it agendamentos e concorrência`; `$break-it autenticação e permissões`; `$break-it mutation testing`; `$break-it E2E`; `$break-it carga`.

Selecione apenas o domínio solicitado e suas verificações de isolamento; liste o que ficou fora.
