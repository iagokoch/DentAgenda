# Break-It — auditoria inicial do DentAgenda

Data: 12/11/2026. Checkout local: `sandlance`, remoto `https://github.com/iagokoch/DentAgenda`, base `1251b44` (remoção de helpers CPF sem uso, PR #32). Workspace já era um worktree Orca. Alteração preexistente: somente `.serena/` não rastreada, preservada. Sem commit, push, PR ou correção de produção.

**Registro histórico:** as contagens, falhas e métricas abaixo são da primeira auditoria, anterior à organização das PRs. A branch `chore/break-it-qa` parte de `443f0a8` (`origin/main`), sem incluir o commit de limpeza CPF da branch original. Nesta entrega de infraestrutura ficam **42 testes novos aprovados**, incluindo **11 integrações**. Os dois casos que reproduziram BUG-001 foram transferidos, por solicitação do usuário, para `backend/src/modulos/procedimentos/procedimentos.limites.test.ts` na PR empilhada `fix/procedures-integer-overflow`, junto da correção. O schema de produção continua inalterado nesta PR. O JSON de evidências permanece histórico; a separação evita entregar uma PR de infraestrutura vermelha e não representa resolução do bug.

Triagem posterior dos três avisos altos: [dependency-triage.md](dependency-triage.md). Não foram aplicadas atualizações de segurança nesta entrega.

## 1. Resumo executivo

A baseline está verde: **290 testes frontend, 687 backend com PostgreSQL e 32 backend isolados**. A ordem embaralhada também passou. A auditoria adicionou **44 testes**: 6 propriedades frontend, 9 propriedades backend, 13 integrações e 16 E2E. Dos testes novos, **42 passaram e 2 falharam**, demonstrando **um bug confirmado** com a mesma causa em dois campos. As 15 propriedades executam **4.200 casos gerados por rodada**, além dos testes nomeados; não são 4.200 testes Vitest adicionais.

Agendamento resistiu às disputas investigadas: duas remarcações da mesma original, cancelamento versus remarcação e paciente reservando simultaneamente dois dentistas. Persistência e respostas foram verificadas em três rodadas por cenário. As exclusion constraints `[início,fim)` para dentista e paciente já existiam e continuaram protegidas pela baseline. Isso não prova ausência de todas as condições de corrida.

**Bug confirmado:** inteiros aceitos pelo schema de procedimentos excedem o tipo persistido e provocam HTTP 500. **Hipótese adicional:** idade exibida depende do fuso do navegador; divergência reproduzida, mas falta decisão explícita sobre o fuso da idade. Avisos de dependências são riscos a investigar, não vulnerabilidades exploráveis confirmadas nesta auditoria.

Playwright Test, fast-check e Stryker foram integrados e usados. k6 foi instalado localmente em Temp, com download oficial e checksum verificado, e executado contra API/banco descartáveis. Nenhuma configuração global do Codex foi alterada. A skill permanece em `.agents/skills/break-it/SKILL.md`.

**Limites principais:** E2E usa API sintética; carga mede leituras num dataset pequeno; não houve simulação completa de falha PostgreSQL durante transações reais, medição de CPU/RAM ou auditoria exaustiva de segurança. Não foi calculada cobertura percentual global. Não atribuo nota numérica de resiliência: o escopo não permite generalizar uma nota para o sistema inteiro.

## 2. Instalação e compatibilidade

| Ferramenta | Status | Versão verificada | Integração | Observações |
|---|---|---|---|---|
| Playwright Test | Instalado e executado | 1.65.0 | Raiz; `playwright.config.js`, `vite.break-it.config.js`, `e2e/break-it/` | Edge instalado 157.0.4341.46; Chromium gerenciado não foi baixado |
| fast-check | Instalado e executado | 4.10.2 nos dois módulos | Vitest 5.0.3; configurações próprias | Seed 20261112; 250 casos/propriedade frontend, 300 backend |
| StrykerJS core + runner Vitest | Instalado e executado | 10.1.1 ambos | `backend/stryker.break-it.config.json` | Apenas `horarios.ts`, um worker, sem PostgreSQL |
| k6 | Instalado localmente e executado | 1.4.0 | `scripts/qa/executar-carga.mjs`, `performance/break-it.js` | Binário Windows em `%TEMP%/dentagenda-break-it-k6-1.4.0/`; não global |
| Break-It Skill | Criada e aplicada nesta auditoria | Sem versão semântica declarada | `.agents/skills/break-it/SKILL.md` + referência de execução | Modos completo, backend, frontend, agenda, auth, mutação, E2E e carga |

Ambiente confirmado: Node 24.19.0, npm 12.1.0, Docker Engine 29.8.0, PostgreSQL 17.11 da imagem `postgres:17`. O npm PowerShell foi bloqueado pela política local; utilizou-se `npm.cmd`, sem mudar a política.

Stryker declara Node >=22 e Vitest >=2, compatíveis com as versões instaladas. Entretanto, TypeScript 7.0.2 remove a API de compilador que o preprocessor do Stryker tenta usar. A configuração `tsconfigFile: ""` evita reescrever tsconfig, desnecessário neste projeto sem `extends`/`references`; Vitest continua transformando TS. Typecheck separado passou. Não foi feito downgrade do TypeScript.

No sandbox Windows, Stryker e Playwright encontraram restrições para encerrar processos filhos. As execuções finais foram feitas fora do sandbox, com permissões solicitadas pelas ferramentas, mantendo o isolamento de rede/dados. Não foram instalados Playwright CLI e MCP adicionais: o Test Runner fornece API, execução automatizada e comandos suficientes. MCPs disponíveis incluíam Serena, Context7 e headroom; nenhuma configuração global deles foi alterada. Não havia skill Break-It no catálogo inicial.

## 3. Isolamento e arquitetura observados

Documentos consultados diretamente ou nas análises delegadas: `CLAUDE.md`, README, decisões, API, matriz de papéis, plano de implementação, ponta a ponta, acessibilidade, evolução/validação de auditorias e baseline de desempenho. Não havia `AGENTS.md` no checkout, inclusive subdiretórios rastreados; aplicaram-se também as instruções globais fornecidas no chat. Decisões D42–D44 e código atual prevaleceram sobre os números antigos do README/CLAUDE.

O backend mantém Express → controlador → serviço → Prisma, schemas Zod e transações/travas por domínio. Foram revisados criação, remarcação, cancelamento, realização, disponibilidade, procedimentos, autenticação, paginação e tratamento de erros. Frontend mantém cliente HTTP próprio, sessão, rotas por perfil, formulários e funções puras. SMS/e-mail reais continuam fora da integração existente e não são defeitos desta auditoria.

O Compose existente prevê `dentagenda` e `dentagenda_test` na porta 5433, com volume persistente. **Não foi iniciado nem alterado.** Os runners novos criam instâncias exclusivas PostgreSQL em tmpfs e portas aleatórias publicadas somente em `127.0.0.1`. Confirmam `SELECT current_database()` **antes** das migrations; as próprias guardas existentes continuam verificando URLs e o banco real antes de limpeza.

Baseline/integração usam `dentagenda_break_it_test`. Um segundo banco vazio, `dentagenda_break_it`, é criado na mesma instância descartável apenas para o teste preexistente que comprova a recusa de limpeza fora de `_test`. Carga usa outra instância e `dentagenda_break_it_performance_test`. Nenhum banco existente ou dado real foi acessado. Nenhum volume foi criado ou apagado.

URLs e segredos são injetados em memória. O preload `ignorar-env-real.mjs` impede que configs legadas chamem `loadEnvFile` durante a execução isolada. A instalação backend usou `--ignore-scripts`. Mensageria dos testes é simulada; a API de carga recusa envio. Nenhum seed de desenvolvimento foi executado.

No navegador, toda chamada de API é interceptada; chamadas sem fixture falham. O servidor Vite exclusivo também remove o proxy, desliga `envDir` e devolve HTTP 599 para `/api`, comprovado por um teste que evita a interceptação do browser. Essa segunda barreira foi adicionada após observar uma chamada tardia no teardown tentando usar o proxy legado; houve `ECONNREFUSED`, sem API real disponível. A última rodada não teve erros de proxy.

## 4. Bugs encontrados

### BUG-001 — Overflow de duração/preço de procedimento causa erro interno

**Severidade:** Média. **Área:** administração de procedimentos, validação/persistência.

**Arquivos:** `backend/src/modulos/procedimentos/procedimentos.schemas.ts:6` e `:7`; escrita em `procedimentos.service.ts:21`; fallback 500 em `backend/src/compartilhado/middleware-de-erro.ts:49`.

**Cenário:** autenticar uma recepcionista administradora sintética, enviar `POST /api/procedimentos` com nome sintético exclusivo, duração 60 e preço 100; substituir, separadamente, `duracaoMinutos` ou `precoCentavos` por **2147483648**.

**Esperado:** resposta controlada segundo o contrato de entrada — para o schema persistido atual, recusar valor não representável com `400 ENTRADA_INVALIDA`. Não impor limite clínico arbitrário: o limite técnico precisa ser documentado e alinhado ao tipo PostgreSQL. Uma ampliação deliberada do tipo também exigiria contrato/modelagem próprios.

**Encontrado:** os inteiros passam no Zod (`z.int()` permite faixa maior que PostgreSQL `integer`) e a gravação resulta em **500 ERRO_INTERNO**. Não houve procedimento parcialmente criado nas verificações por nome exclusivo.

**Evidência sanitizada coletada:**

```text
Break-It overflow: campo=duracaoMinutos, HTTP=500, codigo=ERRO_INTERNO
Break-It overflow: campo=precoCentavos, HTTP=500, codigo=ERRO_INTERNO
Tests  2 failed | 11 passed (13)
AssertionError: expected [ 201, 400 ] to include 500
```

**Reprodução automatizada:** em `backend/`, executar `npm run qa:isolado -- integracao`. Teste: `backend/src/qa/break-it.integration.test.ts:114`. Dois campos falharam consistentemente em três execuções, cada uma com novo banco descartável; na última também se conferiu ausência de criação parcial. A suíte termina intencionalmente com exit 1 enquanto o bug existir; os testes não usam `it.fails` para esconder a falha.

**Impacto:** administrador recebe mensagem genérica e não consegue distinguir entrada inválida de indisponibilidade. Pode gerar retentativas e ruído operacional. Não foi demonstrada perda/corrupção de dados ou exploração por usuário sem permissão.

**Sugestão de correção:** decidir/documentar o intervalo representável, limitar ambos os campos em criação e edição a inteiros de 32 bits, preservar positividade/não negatividade e acrescentar regressões das bordas `2147483647`/`2147483648`, incluindo PATCH. Não implementar apenas uma captura genérica de todo erro do Prisma como 400.

## 5. Hipóteses e riscos separados de bugs

| ID | Observação | Evidência e limite | Investigação recomendada |
|---|---|---|---|
| H-001 | Idade pode divergir conforme fuso do navegador | `src/pacientes/formatar.js:36`: no mesmo instante perto da meia-noite, execução em UTC e São Paulo retornou idades diferentes; não há contrato específico confirmado para idade | Confirmar regra com a clínica; fixar o instante e comparar dois contextos Playwright; não alterar automaticamente |
| R-001 | Advisories em dependências | `npm audit` backend: 9 pacotes apontados, 3 altos/6 moderados; não equivalem a nove bugs exploráveis | Validar alcance e pré-condições antes de priorizar atualização |
| R-002 | API do driver PostgreSQL depreciada | Suítes emitiram aviso sobre chamadas concorrentes `client.query()`; testes passaram com pg atual | Acompanhar compatibilidade do adapter antes de migração a pg 9; não tratar aviso como falha atual |

O audit apontou `body-parser` 2.3.0, `qs` 6.16.0, `fast-uri` 3.1.8, Vite backend 8.3.2 e Zod 4.6.5 **já no lockfile original**. A instalação adicionou `minimatch` 10.2.6 e `typed-rest-client` 2.3.1 na árvore de ferramentas de desenvolvimento; os avisos também se propagam aos pacotes Stryker. Nenhuma correção automática foi aplicada. A instalação frontend reportou zero vulnerabilidades.

Referências dos advisories, sem alegar exploração demonstrada: [body-parser](https://github.com/advisories/GHSA-27r3-jxmh-p828), [Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), [Vite/Windows](https://github.com/advisories/GHSA-587h-7wmj-h5pm), [minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249), [qs](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw). Não executar `npm audit fix --force` como substituto dessa avaliação.

## 6. Qualidade e resiliência

### 6.1 Baseline e verificações

| Escopo/comando | Resultado observado |
|---|---|
| Frontend `npm run lint` | Passou; rodada final sem avisos |
| Frontend `npm test` | 25 arquivos, 290 testes passaram, antes e depois da integração |
| Frontend `npm run test:embaralhado` | 290 passaram; seed 1794491885438 |
| Frontend `npm run build` | Passou, 75 módulos; interface de produção preservada |
| Backend `npm run lint` / `typecheck` | Passaram |
| Backend `npm run test:seguranca` | 4 arquivos, 32 testes passaram, sem banco |
| Backend `npm test`, via runner descartável | 46 arquivos, 687 testes PostgreSQL passaram, além dos 32 isolados |
| Backend `test:embaralhado`, via runner descartável | Mesmas contagens passaram; seed 1794494106715 |
| Backend `npm run conferir:codigos` | Passou: 33 códigos de erro documentados cobertos |
| Backend `npm run build` | Passou |

A primeira tentativa da baseline descartável teve 686/687 aprovados: o teste preexistente de recusa de limpeza esperava um segundo banco sem `_test`, ausente na fixture inicial. O runner foi completado com esse banco vazio descartável; baseline e embaralhado passaram. Isso foi falha de preparação da auditoria, não de produção. Não houve mudança no teste existente.

Jsdom informou falta de implementação de canvas durante axe; testes passaram. A rodada de axe no navegador real complementou esse limite no login. Uma primeira propriedade de senha confundia unidades UTF-16 com caracteres Unicode: o oráculo foi ajustado a pontos de código, conforme contrato, mantendo o limite independente de 72 bytes. Não foi classificada como bug da aplicação.

### 6.2 Testes novos

| Suíte | Quantidade/resultado | Lacuna validada |
|---|---|---|
| Frontend propriedades | 6 passaram; 1.500 casos | Round-trip monetário em faixa persistível, conservação da grade, virada de calendário, preservação de máscaras, partição de consultas e fronteira de 24h |
| Backend propriedades | 9 novas passaram; 2.700 casos | CPF gerado com verificadores independentes, e-mail idempotente, senha Unicode/bytes, interseção `[)`, cardinalidade de passos, duração inválida com passo positivo, conservação/monotonicidade de vagas, datas clínicas e paginação |
| Backend configuração pura | 48 testes passaram no total | 9 novos + 39 testes existentes selecionados; não somar estes 39 de novo à baseline |
| Backend integração | 13 executados; 11 passaram, 2 falharam | Três corridas repetidas três vezes; overflow em dois campos; paginação cujo deslocamento ultrapassa inteiro seguro; limite de data aceito pelo contrato sem HTTP 500 |
| E2E navegador | 16 passaram, rodada final em 13,0 s | Quatro perfis, restauração, recusa administrativa/anônimo, cadastro, recuperação com código inválido/retry, reserva com conflito/retry, cancelamento/justificativa/foco, administração/back-forward, busca após 500 e barreira contra API real |

No E2E a largura de 400px, navegação por teclado e axe com CSS/contraste reais passaram no login, sem violações detectadas nesse escopo. Isso não declara todas as telas acessíveis. As contas são fixtures; o CPF inválido sintético usado no browser não testa sua validação backend, exercitada separadamente.

Auth/autorização existentes foram reutilizadas: matriz de rotas por papel, resposta 404 de recursos de terceiros, bloqueio, refresh/replay, consumo de códigos e alteração concorrente de canais. Não foi encontrada falha nova nesses testes. Mudança de canal e notificações pós-commit já protegidas por D43/D44 não foram reclassificadas como defeitos novos. E-mails/telefones compartilhados por pacientes foram respeitados.

### 6.3 Mutation testing

Escopo exclusivo: `backend/src/modulos/disponibilidade/horarios.ts`, um worker, configuração Vitest sem ambiente/setup de banco.

| Métrica | Primeira rodada concluída | Rodada final |
|---|---:|---:|
| Mutações geradas | 86 | 86 |
| Eliminadas por assertivas | 72 | 76 |
| Detectadas por timeout | 7 | 5 |
| Sobreviventes | 7 | 5 |
| Sem cobertura / erros | 0 / 0 | 0 / 0 |
| Mutation score do Stryker | 91,86% | **94,19%** |

O score conta timeouts como detecção: `(76 + 5) / 86`. Não é cobertura global nem mede exclusivamente assertivas. Os tempos de execução e alocação da primeira morte de cada mutante podem variar por rodada.

A primeira rodada mostrou lacuna real: duração zero com **passo positivo** não estava protegida; exemplos existentes usavam o passo padrão zero e mascaravam a retirada da guarda de duração. Foi adicionada uma propriedade para duração não positiva com passo positivo. Nenhuma lógica de produção mudou.

Cinco sobreviventes finais: quatro mutações nos limites dos restos em `horarios.ts:54–55` (`if true` ou `<` → `<=`) e uma em `:73` (`janela.inicio < agora` → `<=`). Elas parecem produzir trechos não positivos filtrados depois, ou escolher instantes temporalmente iguais. São **candidatas a equivalentes no domínio de duração positiva**, não prova automática de equivalência; investigar antes de excluir mutantes ou alegar cobertura perfeita. Não houve mutação de integração PostgreSQL.

Relatórios completos locais ignorados pelo Git: `backend/reports/break-it/mutation.json` e `mutation.html`. Resumo estável sanitizado: [break-it-evidence.json](break-it-evidence.json).

### 6.4 Carga controlada

k6 1.4.0; **5 VUs por 20 segundos**, até 2 segundos de encerramento. API própria em loopback; PostgreSQL tmpfs novo, dataset de **1 dentista, 10 pacientes e 20 consultas**, relógio fixo de teste. Um único login antes da carga; sem chamadas de cadastro/recuperação, mensageria ou serviços externos.

Leituras alternadas: busca de pacientes, lista de consultas por dentista/período, horários livres e histórico de observação. Não há escrita sob carga. A consulta adicional de setup confirma comprovante aleatório e nome do banco descartável.

| Métrica | Resultado |
|---|---:|
| Requisições HTTP, incluindo setup | 370 |
| Leituras verificadas | 369/369 |
| Falhas HTTP | 0/370 (0%) |
| Taxa de requisições | 18,257661/s |
| Latência média / mediana | 21,41 / 14,93 ms |
| p95 / p99 | 58,8 / 109,66 ms |
| Máximo | 156,61 ms |

Thresholds efetivamente usados: erros HTTP iguais a zero e checks 100%. Não foi definido SLA de latência. Evidência local sanitizada: `performance/resultados/break-it-k6.txt`; cópia dos números no JSON estável. API foi encerrada e contêiner exclusivo removido. Nenhum volume persistente foi usado. Esses números não medem capacidade máxima, dataset de clínica, resistência longa ou estabilidade de CPU/RAM.

### 6.5 Falhas de dependência

Baseline isolada cobre indisponibilidade/readiness, timeout com consulta pendente compartilhada, encerramento e rollback, além das regressões de notificações e códigos. E2E acrescenta HTTP 500 na busca e recuperação após conflito. Não foi desligado nenhum banco existente. Não houve caos real de rede/PostgreSQL no meio de uma transação; essa cobertura permanece pendente.

## 7. Priorização

| Ordem | Problema | Severidade | Impacto | Probabilidade | Esforço estimado | Recomendação |
|---:|---|---|---|---|---|---|
| 1 | R-001: avaliar advisories altos já existentes | Alta segundo o audit, alcance não confirmado | Possível indisponibilidade ou exposição no ambiente afetado; exploração não demonstrada | Desconhecida, depende de rotas/configuração e pré-condições | 2–4 h para triagem, atualização a estimar | Validar alcance de body-parser/Zod/Vite; preparar atualizações em mudança própria, com regressões |
| 2 | BUG-001: overflow em procedimentos | Média confirmada | 500 e cadastro recusado sem orientação; ruído operacional | Baixa em uso comum, certa para o payload reproduzido com admin | 1–2 h | Documentar limites técnicos, validar POST/PATCH e testar bordas |
| 3 | R-001: advisories novos na árvore de QA | Moderada segundo o audit | Risco de ferramentas de desenvolvimento; nenhum exploit demonstrado | Baixa no fluxo com padrões locais confiáveis | 1–2 h para avaliar alternativas compatíveis | Acompanhar Stryker/minimatch; não forçar major incompatível |
| 4 | H-001: idade por fuso do navegador | Indeterminada | Possível diferença visual em aniversário perto de meia-noite | Condicionada a fuso/instante e regra desejada | Até 30 min para decisão; implementação a estimar | Confirmar regra antes de abrir bug |
| 5 | Sobreviventes de mutação e lacunas de E2E/caos | Lacuna de evidência | Garantias incompletas fora do escopo medido | Não estimável | 2–4 h por investigação delimitada | Aprofundar por domínio, sem alterar regras para elevar score |

Estimativas são de trabalho técnico, não prazos acordados. Somente BUG-001 integra o total de bugs confirmados; riscos e hipóteses não entram nesse total.

## 8. Integração permanente e próximos testes

As opções operacionais e comandos estão em [.agents/skills/break-it/references/execucao.md](../../.agents/skills/break-it/references/execucao.md). Exemplos: `$break-it auditoria completa`, `$break-it somente backend`, `$break-it somente frontend`, `$break-it agendamentos e concorrência`, `$break-it autenticação e permissões`, `$break-it mutation testing`, `$break-it E2E`, `$break-it carga`.

Os comandos existentes foram preservados. `src/qa/**` fica explicitamente fora dos Vitest padrões; propriedades e integrações Break-It têm comandos próprios. Não foi incluída execução agressiva em `npm test`, CI, hooks ou inicialização do Codex.

| Próxima investigação | Motivo | Como executar com segurança |
|---|---|---|
| PATCH de procedimento e borda máxima válida | BUG-001 confirmado em criação; edição compartilha campos, mas não foi reproduzida | Acrescentar casos à integração opt-in e executar `backend: npm run qa:isolado -- integracao` |
| Corridas com ordem imposta: grade/criação, realização/cancelamento e logout/requisição | `Promise.all` repetido não cobre todas as intercalações | Usar barreiras como as suítes existentes, instância nova por execução, verificar estado persistido |
| E2E remarcação, edição completa de pacientes/equipe/procedimentos e disponibilidade | Navegador atual não percorre todas essas operações | Ampliar fixtures em `e2e/break-it/`, depois `npm run qa:e2e`; para API real criar runner E2E integrado descartável próprio |
| Falha PostgreSQL durante transação e recuperação | Saúde/mock não demonstra integralmente rollback após interrupção real | Criar instância temporária dedicada, injetar falha apenas nela e conferir atomicidade/reconexão |
| Equivalência dos mutantes e benchmark representativo | Score de um arquivo e carga pequena têm alcance limitado | Revisar limites positivos formalmente; repetir carga com datasets autorizados, mantendo 5 VUs/30s nesta etapa |

## 9. Arquivos e evidências

| Arquivos | Finalidade |
|---|---|
| `.agents/skills/break-it/SKILL.md`, `references/execucao.md` | Skill reutilizável e procedimentos de instalação/isolamento/reprodução |
| `package.json`, `package-lock.json`, `backend/package.json`, `backend/package-lock.json` | Dependências locais e comandos opt-in |
| `.gitignore` | Ignorar relatórios transitórios Playwright/Stryker |
| `vite.config.js`, `backend/vitest.config.ts` | Excluir somente os novos testes opt-in das suítes padrões |
| `vitest.break-it.config.js`, `backend/vitest.break-it.config.ts`, `backend/vitest.break-it.integracao.config.ts` | Separar propriedades puras e integrações |
| `backend/stryker.break-it.config.json` | Mutação restrita, sequencial e sem banco |
| `src/qa/break-it.property.test.js`, `backend/src/qa/break-it.property.test.ts` | Propriedades gerativas com seed reproduzível |
| `backend/src/qa/break-it.integration.test.ts` | Concorrência e regressões de entradas extremas, preservando falhas confirmadas |
| `playwright.config.js`, `vite.break-it.config.js`, `e2e/break-it/api-sintetica.js`, `e2e/break-it/fluxos.spec.js` | Navegador com fixtures, sem proxy/API real e sem alteração visual |
| `backend/scripts/qa/executar-isolado.mjs`, `ignorar-env-real.mjs` | PostgreSQL novo, verificação real, ambiente em memória e limpeza específica |
| `scripts/qa/executar-carga.mjs`, `backend/scripts/qa/api-carga.ts`, `performance/break-it.js` | k6 local com checksum, fixture descartável e limites de carga |
| `docs/qa/break-it-report.md`, `break-it-evidence.json` | Relatório e resumo sanitizado persistente |

Resultados transitórios permanecem locais e ignorados, sem tokens, senhas ou dados pessoais nos documentos. O helper Python de validação da skill não iniciou por ausência de PyYAML; a estrutura simples do frontmatter e referências foi conferida por validação independente, sem instalar dependência Python adicional. Revisão independente de código avaliou runners, configurações e skill; corrigidos os problemas de instrução de instalação, alias de navegador e drenagem de saída do k6. Não houve achado de código morto de produção durante a passagem.

## 10. Resolução do BUG-001 — PR de correção separada

Branch de correção: `fix/procedures-integer-overflow`, baseada em `chore/break-it-qa`. As evidências anteriores
permanecem históricas. A correção substitui `z.int()` por `z.int32()` nos dois campos compartilhados por POST/PATCH,
preservando duração positiva e preço não negativo. A decisão D45 e o contrato registram as unidades e o máximo
técnico de 2147483647. Não há migration, mudança de exceções, frontend ou dependências.

Os dois casos originais foram transportados da suíte QA para
`backend/src/modulos/procedimentos/procedimentos.limites.test.ts`, com expectativa explícita de
`400 ENTRADA_INVALIDA`, e ampliados para **40 regressões**. Cada execução usou PostgreSQL novo em tmpfs,
com banco real conferido por SQL antes de migrations.

| Momento | Resultado | Evidência |
|---|---|---|
| Antes do schema corrigido | 36 passaram / 4 falharam | HTTP 500 em vez de 400 nos dois campos, em POST e PATCH |
| Após `z.int32()` | 40 passaram / 0 falharam | Faixas mínimas/máximas aceitas; valores/tipos inválidos recusados com campo identificado |

Os 6 casos válidos verificam retorno e persistência sem truncamento. Os 34 inválidos verificam acima do máximo,
negativos, duração zero, frações, strings, null, booleanos, arrays e objetos. Para PATCH, nome e ativo válidos são
enviados junto do campo inválido; o registro completo é comparado antes/depois. POST inválido não cria registro.

Reprodução atual da regressão, em `backend/`:
`npm run qa:isolado -- baseline src/modulos/procedimentos/procedimentos.limites.test.ts`.
O comando histórico `qa:isolado -- integracao` agora executa somente as 11 integrações aprovadas de infraestrutura.
As regressões da correção participam da suíte normal do backend e, portanto, da CI existente.

Validação final da branch de correção: **727 testes PostgreSQL + 32 isolados aprovados**, 11 integrações
QA aprovadas, 48 testes da configuração pura aprovados, lint/typecheck/build e 33 códigos de erro aprovados.
Frontend não foi modificado na correção; a branch de infraestrutura já teve 290 testes, 6 propriedades,
build/lint e 16 E2E aprovados. As duas branches preservam a separação entre infraestrutura e correção.
