# Fase 2 — Correções e preparação do deploy

## Atualização — demonstração local validada em 15/11/2026

**GO para apresentação exclusivamente local neste Windows; NO-GO para exposição externa.**
A fotografia abaixo permanece como histórico. A decisão posterior D46 aprovou Docker Desktop apenas
para PostgreSQL exclusivo, API/frontend no host em desenvolvimento, dados fictícios e janela compartilhada.
D16 e a recusa de `production + log` continuam intactas; nenhum Cloudflare Tunnel foi iniciado.

Branch aprovada `demo/local-apresentacao`, criada de `657e497` (#48). Origens conferidas e cherry-picks
aplicados sem conflitos: `05234e5` (#43, transação) → `865d57f`; `843204d` (#44, testes críticos) →
`129e1df`; `ff15872` (#45, estado temporal) → `d378e94`; `6bf3edc` (#49, esperas dependentes de #45)
→ `6b387d7`. As branches e PRs anteriores foram preservadas, sem merge automático.
A PR desta entrega deve ter base `fix/deploy-reinicio-servicos` (#48), preservando a cadeia existente;
os cherry-picks de #43/#44/#45/#49 são cópias explícitas autorizadas, não merges dessas PRs.

### Evidências desta candidata

| Verificação executada | Resultado |
| --- | --- |
| Frontend: `npm run lint`, `npm test -- --reporter=json --outputFile=.codex/demo-local/frontend-testes.json`, `npm run build` | 297 testes aprovados, zero falhos/ignorados; lint/build aprovados |
| Backend: `npm run lint`, `npm run typecheck`, `npm run build` | Aprovados |
| Backend isolado: `node node_modules/vitest/vitest.mjs run --config vitest.seguranca.config.ts --reporter=json --outputFile=../.codex/demo-local/backend-isolados.json` | 53 testes aprovados, zero falhos/ignorados |
| Backend integração: `node node_modules/vitest/vitest.mjs run --config vitest.config.ts --reporter=json --outputFile=../.codex/demo-local/backend-src.json` | 689 testes aprovados, zero falhos/ignorados, no banco exclusivo `dentagenda_demo_local_test` |
| **Total de testes desta candidata** | **1.039 aprovados; zero falhos/ignorados** |
| Regressão de escuta real em subprocesso | Antes: outro endereço local recebia 200; depois: somente `127.0.0.1` atende |
| `Preparar` | PostgreSQL exclusivo, quatro migrations aplicadas, seeds fictícios, quatro perfis e baseline com SHA256 |
| `Iniciar` e verificador HTTP | Admin/recepção/dentista/paciente: login, identidade, papéis, listas, disponibilidade, agendamento/conflito, remarcação, cancelamento, refresh/logout aprovados |
| Navegador Orca — recepção | Lista/perfil do paciente, criação em 18/11, remarcação, cancelamento, grade semanal e logout aprovados; recarga restaurou sessão |
| `Estado` e listeners do Windows | API 3000, frontend 5173 e PostgreSQL 5434 somente em `127.0.0.1`; HTTP e banco saudáveis |
| `ReiniciarApi`, `ReiniciarFront`, `Parar` → `Iniciar` | Processos retomados, container/volume preservados, identidades fictícias preservadas, roteiro HTTP aprovado novamente |
| `Backup`, `Restaurar` → `Iniciar` | Cópia inicial restaurada em banco novo, original preservado, identidades e autenticação dos quatro perfis conferidas, estado saudável |
| Parser PowerShell e `git diff --check` | Aprovados |

A instalação original estava desatualizada e incompleta. `npm ci --ignore-scripts` foi autorizado e
executado na raiz e em `backend`; lockfiles preservados. Client Prisma 7.10.1 gerado explicitamente
após backup individual validado. As primeiras tentativas de relatórios foram bloqueadas pelo sandbox;
as execuções finais fora dele produziram os três JSON com `success=true`. O teste novo de escuta
foi executado vermelho antes da correção e verde depois. Nenhum teste de carga foi repetido.

### Operação e limites atuais

- URL: **http://127.0.0.1:5173**. Guia curto: [operação local](operacao-local.md).
- `scripts/demo-local.ps1`: Preparar, Iniciar, Estado, ReiniciarApi, ReiniciarFront, Backup, Restaurar,
  Parar e consulta privada de Credenciais. `Estado` é informativo; confira o texto `SAUDAVEL`.
- Contas fictícias: administração, recepção, dentista e paciente. Senhas/configuração em
  `.codex/demo-local/config.xml`, protegidas por DPAPI CurrentUser e ignoradas pelo Git. Não imprimir,
  versionar ou compartilhar credenciais/códigos. Logs locais de desenvolvimento contêm mensagens simuladas.
- Baseline e backups privados têm checksum. Restauração usa banco novo dentro do mesmo container e
  não remove o anterior. Testes destrutivos usam outro banco. Nenhum volume antigo foi reutilizado/excluído.
- A aplicação ficou iniciada após o ensaio operacional. Não houve reboot do Windows. `Stop-Process`
  não comprova encerramento gracioso. Avisos conhecidos: canvas no jsdom e depreciação de consulta
  concorrente no client `pg`; não impediram as verificações.
- CRUD de pacientes/funcionários tem cobertura de integração; não foi repetido integralmente no navegador.
- AUD-02, Cloudflare, mensageria remota e validação completa do deploy continuam no backlog. Os
  619 HTTP 200 anteriores são carga histórica local, sem equivalência com capacidade remota.
- Backups individuais validados precederam alterações preexistentes; `.codex/` e `AGENTS.md` locais
  foram preservados e não fazem parte da entrega. Nenhuma alteração direta em `main` ou merge de PR.

---

Fotografia de 15/11/2026. **Em andamento; NO-GO para exposição externa.**
O destino informado é este computador Windows, com Docker Desktop e Cloudflare
Tunnel, para apresentação em 16/11/2026, condicionada à validação de carga.
Essa escolha não comprova a cadeia de proxy nem autoriza abrir o túnel.

A [auditoria das Fases 0 e 1](https://github.com/iagokoch/DentAgenda/pull/41)
continua como registro histórico do commit `443f0a8`: 1.009 testes aprovados.
As autorizações posteriores permitem implementar a Fase 2 e publicar commits,
branches e PRs encadeadas. Não autorizam merge automático. AUD-01 foi adiada
por solicitação do usuário: códigos continuam no log, preservando a guarda D16
que recusa esse enviador em produção. Os ensaios usaram apenas dados fictícios e
credenciais novas das próprias fixtures; não usaram segredos de produção.

## Entregas para revisão

Todas as PRs abaixo estavam abertas, sem merge, na consulta de 15/11/2026.
Os checks `front` e `backend` passaram em #41 a #49. Esse estado é uma fotografia,
não uma garantia sobre revisões futuras ou integração em `main`.

| PR | Branch / base | Alteração | Revisão local |
| --- | --- | --- | --- |
| [#42](https://github.com/iagokoch/DentAgenda/pull/42) | `fix/body-parser-corpos-comprimidos` / `main` | SEC-05: body-parser 2.4.0 e qs 6.17.1; 20 regressões HTTP em subprocesso | Crash reproduzido antes; processo sobrevive depois; 1.029 testes da candidata passaram |
| [#43](https://github.com/iagokoch/DentAgenda/pull/43) | `fix/leitura-grade-na-transacao` / `main` | AUD-05: leitura da grade usa a conexão transacional | Pool de uma conexão: falha antes, reserva única depois; 74 testes focados passaram |
| [#44](https://github.com/iagokoch/DentAgenda/pull/44) | `test/auditoria-assertivas-criticas` / `main` | AUD-03/04: matriz de papéis e concorrência com bloqueio real | 219 testes passaram, também embaralhados; injeções de 500 e ausência da trava reprovam os controles |
| [#45](https://github.com/iagokoch/DentAgenda/pull/45) | `fix/atualizacao-temporal-minhas-consultas` / `main` | AUD-06: relógio reativo e revalidação no cancelamento | 7 regressões novas; 297 testes frontend passaram |
| [#46](https://github.com/iagokoch/DentAgenda/pull/46) | `fix/validacao-colecoes-seguranca` / #42 | SEC-07: Zod 4.6.7 | 739 testes backend, lint, tipos, build e conferência textual de 33 códigos passaram |
| [#47](https://github.com/iagokoch/DentAgenda/pull/47) | `chore/dependencias-ferramentas-auditoria` / #46 | Vite 8.2.6 no frontend, Vite 8.3.8 no backend, fast-uri 3.1.9 e transitivas necessárias | 1.029 testes; lint, tipos, builds, geração Prisma e instalação somente de produção passaram |
| [#48](https://github.com/iagokoch/DentAgenda/pull/48) | `fix/deploy-reinicio-servicos` / #47 | AUD-07/D45: reinício dos serviços contínuos e manutenção explícita | Configuração sem interpolação e fixture Docker passaram; destino completo pendente |
| [#49](https://github.com/iagokoch/DentAgenda/pull/49) | `test/sincronizacao-minhas-consultas` / #45 | Aguarda itens/botão carregados nos testes da tela | Falha reproduzida com resposta pendente; espera corrigida passou, mantendo todas as assertivas |

As oito especialidades continuam na coordenação: arquitetura, QA, confiabilidade,
segurança, qualidade/desempenho, DevOps, SRE e documentação. Revisões independentes
foram somente leitura; alterações foram sequenciais, no checkout confirmado.
Não houve trabalho de escrita paralelo que exigisse worktrees. Arquivos existentes
tiveram backups individuais validados antes das alterações. `AGENTS.md` e `.codex/`
locais não integram as entregas.

## Validação combinada

Um ensaio em cópia descartável aplicou os arquivos de `05234e5` (#43), `843204d`
(#44), `ff15872` (#45) e o ajuste `6bf3edc` (#49) sobre os arquivos de dependências
de `5d9b45c` (#47). Não houve merge Git ou alteração da instalação original.
Banco PostgreSQL 17 próprio, em tmpfs, rede exclusiva e porta em loopback; ambiente
controlado, sem `.env` real. A integração com banco foi executada serialmente.

| Suíte | Aprovados | Falhos | Ignorados |
| --- | ---: | ---: | ---: |
| Frontend | 297 | 0 | 0 |
| Backend isolado | 52 | 0 | 0 |
| Backend em `src/`, incluindo integração e E2E | 689 | 0 | 0 |
| **Total da cópia combinada** | **1.038** | **0** | **0** |

Os três processos terminaram com código zero e JSON de sucesso. Executados pelos
scripts npm/binários locais da cópia: `test`, `test:seguranca`, `vitest run --config
vitest.config.ts`, lint frontend/backend, typecheck backend e builds frontend/backend.
Não se somam contagens de validações independentes para produzir esse total.
Esta cópia combina fontes para ensaio; não representa código integrado em `main`.

A primeira rodada frontend teve 296/297: um teste encontrava a região antes da
resposta e buscava itens sincronamente. Controle descartável com respostas em
40/80 ms reprovou o original e aprovou as esperas da #49. O atraso foi removido
antes da rodada final. As asserções de ordem, conteúdo, quantidade e ação foram mantidas.

Avisos conhecidos: canvas no jsdom, chunk frontend acima de 500 kB e uso concorrente
do client `pg` depreciado. Não se obteve cobertura percentual nem prova visual pelo axe.

Na candidata #47, as quatro consultas npm audit (frontend/backend, completas e
`--omit=dev`) terminaram com zero alertas em 15/11/2026. Isso descreve a base consultada,
não ausência de vulnerabilidades. Instalação limpa `npm ci --omit=dev --ignore-scripts`
em cópia somente de metadados confirmou Prisma/client 7.10.1 e fast-uri 3.1.9 presentes,
Vite ausente. Não comprova inicialização de produção com mensageria por log.

O ensaio básico de AUD-07 observou `RestartCount` de 0 para 1 após saída da fixture
e parada manual respeitada por 3 segundos. A fixture ficou parada, com reinício
desativado. Não foi reboot do host nem recuperação da cadeia real de serviços.

## Pendências e sequência de liberação

| Item | Estado / próximo passo |
| --- | --- |
| AUD-01 | Adiada: produção + log continua recusado. Apresentação remota exige decisão explícita sobre um perfil restrito com dados fictícios ou retomada da mensageria; não trocar silenciosamente para development/test e publicar. Alternativa compatível hoje: apresentação no navegador local e compartilhamento da janela. |
| AUD-02 | Topologia escolhida; identidade do peer do Docker Desktop, isolamento da origem e HTTPS ainda não medidos. Nginx hoje substitui IP/scheme do visitante. Definir origem confiável e ensaiar dois clientes, headers forjados, IPv4/IPv6, limites por IP e cookies Secure. Loopback sozinho não autentica cloudflared contra processos locais. |
| AUD-07/10 | Política configurada em #48; falta construir/operar a cadeia final, validar dependências, persistência, queda/retorno, encerramento, HTTPS e reboot. |
| AUD-08 | Investigação estática não confirmou fonte real de dado sensível até `Error.message`/log. Sink dos 500 existe; não corrigir com base apenas na sentinela artificial. |
| AUD-09 | Gargalo no endpoint não comprovado. Medir sob dataset/carga definidos antes de otimizar. |
| AUD-11 | Confirmar permissões/grants mínimos, versões/digests das imagens, armazenamento disponível, acesso restrito, alertas, cópia externa e restauração; definir retenção/RPO/RTO. Dados reais exigem preparação própria. |
| AUD-12 | Esta fotografia atualiza o acompanhamento; os registros históricos permanecem intactos. Scripts Bash devem ser transportados com LF; não inferir execução Linux a partir do checkout Windows CRLF. |

Limites residuais das correções: gzip corrompido ainda pode retornar 500 controlado,
também observado na versão anterior; o patch Zod não cria teto universal para arrays.
OOM por esses arrays não foi reproduzido. As atualizações de ferramentas não comprovam
exploração da aplicação nem substituem configuração segura do servidor de desenvolvimento.

Integração proposta para revisão: `#42 → #46 → #47 → #48`, e `#45 → #49`;
#41, #43 e #44 seguem independentes. Após integrar uma base, conferir o destino e
o diff da próxima PR, retargetar quando necessário e repetir os checks pertinentes.
PRs antigas fora desta sequência não foram alteradas nem consideradas integradas.

Antes da exposição: resolver a decisão de apresentação/mensageria, corrigir e validar
o proxy, validar o stack final e seus controles de acesso/recuperação. A Fase 3 não foi iniciada.

## Ensaio curto de carga local — 15/11/2026

Concluído às 19:33:36 UTC. API real da cópia combinada em processo Node separado
do gerador, vinculada explicitamente a `127.0.0.1` e porta efêmera; PostgreSQL 17
na fixture Docker exclusiva. Banco novo, vazio, terminado em `_performance_test`,
com migrations e o gerador versionado: 5 dentistas, 500 pacientes e 5.000 consultas
fictícias. Os registros foram criados somente nesse banco temporário.

Sem instalação de ferramentas: k6 não estava no PATH. O harness Node usou `fetch`,
timeout de 3 segundos, limite de concorrência e pacing por estágio. Mix de leitura:
busca de pacientes, consultas diárias, horários livres e dias disponíveis do mês.
Tempo medido até consumir o corpo da resposta, percentis por nearest rank.

| Etapa | Concorrência máxima | Alvo req/s | Amostras | Duração | Req/s observado | p50 | p95 | Erros |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline sequencial | 1 | — | 50 | — | — | 7,03 ms | 23,12 ms | 0 |
| 1 | 1 | 2 | 41 | 20,01 s | 2,05 | 7,83 ms | 29,81 ms | 0 |
| 2 | 2 | 5 | 102 | 20,21 s | 5,05 | 7,84 ms | 26,84 ms | 0 |
| 3 | 4 | 10 | 200 | 19,92 s | 10,04 | 7,57 ms | 24,81 ms | 0 |
| 4 | 8 | 20 | 200 | 9,97 s | 20,05 | 7,31 ms | 24,15 ms | 0 |

Cada estágio parava ao atingir cerca de 20 segundos ou 200 pedidos. A concorrência
é um teto, não prova de oito requisições simultaneamente em processamento; a taxa
observada considera os pedidos imediatos nas bordas da janela. Regras de parada:
resposta inesperada/timeout, readiness falho, pressão de memória livre (<512 MiB)
ou p95 recente acima de `max(1 segundo, 3 × p95 baseline)`. Nenhuma foi acionada.

Total: **619 respostas HTTP 200**, zero erros: 543 leituras dos quatro estágios,
50 de baseline, 20 de aquecimento, 5 de readiness/cooldown e 1 login. O único login
mediu 250,44 ms; não é medição de autenticação sob carga. p95 agregado 25,29 ms,
incluindo essas operações diferentes; para comparação de carga, usar os estágios.

Host observado: Ryzen 5 8500G, 12 processadores lógicos, cerca de 15,61 GiB de RAM,
Node 24.22.1. API: pico de RSS 291,02 MiB, heap 127,25 MiB; 81 amostras de memória,
memória livre mínima do host 7,59 GiB. p95 do atraso do event loop 21,17 ms.
Esses picos amostrados não medem todo o consumo do Docker nem provam ausência de leak.

**Limites:** ensaio curto, somente leituras e um login, logger silencioso, relógio
fixo de teste e mesmos IDs/dataset. Sem escritas sob carga, clientes físicos,
resistência longa, saturação, Nginx, TLS, Cloudflare ou API em container. Respostas
foram verificadas por status; isso não substitui as assertivas funcionais da suíte.
Resultado satisfatório neste recorte local; não libera exposição nem estabelece
capacidade máxima. O roteiro k6 existente continua sem execução nesta rodada.

O primeiro comando de preparação usou um papel PostgreSQL inexistente e parou
antes da carga. O harness foi corrigido para usar o papel da própria fixture;
não houve mudança do aplicativo. O banco de carga nasceu novo; o banco da suíte
não foi limpo para esse ensaio.

## Checkpoint para /clear

Estado observado ao preparar o checkpoint, em 15/11/2026:

```text
worktree: C:/Users/potat/orca/DentAgenda (única worktree listada)
branch: docs/estado-fase2
HEAD: 657e497db7068930790175f0058218ab511b6b6a
staging: vazio
modificações rastreadas: nenhuma
não rastreados preservados: .codex/, AGENTS.md, docs/estado-fase2.md
```

A branch documental parte de #48, sem upstream ou PR próprios no checkpoint.
Ela contém a cadeia #42/#46/#47/#48; as correções independentes #43/#44/#45/#49
não foram integradas nesse checkout. Este documento é novo, local e **sem commit**.
Nenhum arquivo preexistente foi descartado; a instalação original não foi reinstalada.
Não executar `git clean`, reset destrutivo ou sobrescrita para retomar.

### Especialistas e resultados

| Papel / agente usado na continuidade | Resultado |
| --- | --- |
| Arquitetura — `f2_architect` | Revisou D45 e manutenção; confirmou conflito de produção + log e necessidade de decisão explícita para demo remota. Identificou que os bindings de desenvolvimento não garantem loopback. |
| QA — `f2_qa` | Conferiu contagens por candidata e diagnosticou a espera prematura dos testes de Minhas consultas; recomendou aguardar cada lista/botão, preservando assertivas. |
| Confiabilidade — `f2_reliability` | Revisou instalação de produção e a necessidade de geração/migrations/build reais; preservou limites dos ensaios e integridade transacional. |
| Segurança — `f2_security` | Revisões independentes de dependências sem achados adicionais; AUD-08 tem sink potencial, sem fonte real confirmada. Não tratou mensageria D16 como novo vazamento. |
| Qualidade/desempenho — `f2_quality` | Revisou grafo das atualizações e as três esperas da #49; sem defeitos acionáveis, sem asserções removidas. |
| DevOps — `f2_devops` | Revisou reinício/manutenção e analisou proxy Windows/Docker/Cloudflare; peer/NAT precisa de medição, não de CIDR presumido. Cloudflared não localizado no PATH da sessão. |
| SRE — `f2_sre` | Definiu limites do ensaio de reinício e carga local progressiva, critérios de parada e separação das métricas da API/gerador; não equiparou smoke a capacidade final. |
| Documentação — `f2_documentation` | Revisou estrutura desta fotografia, dependências entre PRs, resultados por candidata e pendências; preservação da auditoria histórica. |

As análises anteriores também aparecem sob nomes `devops`, `documentation_engineer`
e especialistas da auditoria. Nomes de agentes não garantem processos vivos após
`/clear`; recriar os oito papéis em rodadas, respeitando o limite de concorrência.

### Recursos, decisões e pendências para retomada

- Docker Desktop foi retomado normalmente, sem administrador. PostgreSQL próprio
  `dentagenda-sec05-eb17b0a7`, label `dentagenda.ensaio=sec05`, rede
  `dentagenda-sec05-eb17b0a7-rede`, ficou **exited** ao terminar. Não possui volumes
  persistentes; dados em tmpfs não devem ser considerados recuperáveis após parar.
  A fixture do ensaio de reinício também foi parada e teve a política desativada.
  Containers/imagens de outros projetos não foram alterados ou excluídos.
- A API/gerador de carga terminaram com código zero e fecharam a porta; nenhum
  túnel, publicação externa, login MCP ou deploy foi executado. Existe imagem local
  `cloudflare/cloudflared`; isso não comprova binário no host, configuração ou túnel ativo.
- D45 registra `unless-stopped` nos serviços contínuos, sem reiniciar migrations;
  runbook seleciona explicitamente banco/api/front, mesmo com perfil migrations ativo.
  D16 e a guarda produção + log foram preservadas. Não existe perfil remoto de demo
  aprovado nem implementação de provedor. Não inventar aprovação pelo prazo da apresentação.
- Nginx atual perde IP/scheme externos. Para o conector no host, o peer visto pelo
  container pode ser NAT/gateway. `CF-Connecting-IP` só pode ser usado após definir
  origem confiável; processo local também consegue atingir loopback e forjar headers.
  Falta validar cadeia, isolamento, limiter por cliente, HTTPS e cookies Secure.
- O harness e relatórios JSON estão em diretório temporário de artefatos da sessão;
  não dependem da instalação original. O JSON `runtime.json` contém credenciais
  efêmeras: **não imprimir nem copiar para docs/memória**. Não reutilizar URLs após
  reiniciar o container sem revalidar identidade/porta/bancos. Resultados relevantes
  estão resumidos aqui para sobreviver à perda dos temporários.
- HTTP 401 do `gh` no sandbox não exigiu novo login: a consulta com permissão normal
  fora do sandbox usou autenticação já existente e funcionou. Não reutilizar tokens
  antigos, ler credenciais ou autenticar servidores automaticamente.
- Após o pedido de checkpoint: nenhuma nova implementação, commit, push, merge ou
  abertura de PR. A tarefa em execução era finalizar os resultados da carga e esta
  documentação; ambas foram registradas para continuidade. A Fase 2 continua aberta.

### Próxima tarefa exata

1. Recuperar o handoff ai-memory no projeto `default/iagokoch-dentagenda`, ler este
   arquivo e as páginas de estado/retomada; reconferir branch, status, worktree e PRs.
   Preservar este arquivo local e os demais não rastreados antes de qualquer troca.
2. Apresentar ao usuário o plano de apresentação neste PC **com o resultado local de
   carga já concluído**, resolvendo explicitamente a decisão bloqueante D16/AUD-01:
   apresentação local com janela compartilhada, provedor real ou proposta de perfil
   remoto restrito com dados fictícios e tratamento de códigos aprovado. Obter decisão
   antes de alterar contrato/configuração; não abrir túnel para development/test.
3. Somente após essa decisão e autorização aplicável: planejar AUD-02 para a cadeia
   escolhida, medir peer/isolamento, definir arquivos/branch/testes e validar o stack.
   Downloads de imagens/dependências e publicação requerem autorização própria.

O usuário pediu encerrar após o checkpoint. Não iniciar a próxima tarefa nesta sessão.
