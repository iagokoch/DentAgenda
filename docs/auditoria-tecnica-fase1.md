# Auditoria técnica — Fase 1

**Data da validação:** 14/11/2026. **Código auditado:** `main`, commit `443f0a8`.
**Liberação:** **NO-GO para exposição externa**.

A Fase 0 de reconhecimento e a Fase 1 de validação local foram concluídas. A suíte
versionada passou em 1.009 testes, mas foram identificados problemas funcionais,
fragilidades de testes e riscos de segurança e operação. A aprovação dos testes não
comprova ausência de bugs ou prontidão para produção.

Nenhuma correção foi implementada nesta auditoria. A próxima etapa, denominada
**Fase 2 — Correções e preparação do deploy** nesta continuidade, ainda não foi
iniciada. Cada entrega depende de aprovação individual e confirmação de branch.

Este registro consolida os artefatos finais da auditoria, com caminhos locais,
identidades de recursos temporários e informações desnecessárias de fixtures
removidos. Os [resultados estruturados](auditoria-tecnica-fase1-resultados.json)
preservam as contagens e medições. A [proposta SEC-05](proposta-sec05.md) é somente
planejamento. Não altera as decisões canônicas de [documentacao.md](documentacao.md)
nem reclassifica implementações históricas de [evolucao-auditoria.md](evolucao-auditoria.md).

## Escopo e coordenação

Oito subagentes reais fizeram análises coordenadas pelo Tech Lead, em rodadas
compatíveis com o limite de concorrência. As execuções de integração foram
centralizadas para evitar disputa pelo mesmo banco.

| Especialista | Escopo analisado |
| --- | --- |
| 01 — Software Architect | Módulos, fluxos, modelo de dados, dependências e fronteiras |
| 02 — QA Lead | Inventário de testes, fixtures, isolamento, asserções e lacunas |
| 03 — Reliability Engineer | Consultas, transações, pool, sessão e regras temporais |
| 04 — Security Engineer | Autenticação, autorização, códigos, cookies, logs e dependências |
| 05 — Qualidade e desempenho | Consultas, paginação, disponibilidade e medições limitadas |
| 06 — DevOps | Docker, Compose, proxy, configuração e planejamento do túnel |
| 07 — SRE | Saúde, encerramento, retenção, logs e recuperação |
| 08 — Documentation Engineer | Consistência entre contextos, decisões, roteiros e operação |

Ferramentas utilizadas incluíram Git em leitura, PowerShell, Node, npm, Vitest,
TypeScript, Oxlint, Vite, Prisma, Docker, ferramentas PostgreSQL e navegador Orca.
Foram consultados advisories e documentação oficial. Não houve publicação externa,
alteração de infraestrutura remota ou execução de correções.

## Arquitetura analisada

```text
Navegador: React + React Router + Vite
  páginas da clínica, paciente e administração
  cliente HTTP, token em memória e refresh em cookie
                     |
                     /api
                     |
Express: rota -> controller -> service -> Prisma
  auth, pacientes, funcionários, procedimentos,
  disponibilidade e consultas
                     |
PostgreSQL: domínio, grade, bloqueios, consultas,
  histórico versionado, contas, códigos e sessões
```

O backend é um monólito modular. O contexto injeta banco, relógio, logger e
mensageria. Transações, travas e constraints protegem operações de agenda. A
remarcação cancela e cria em uma transação; a autorização também considera a
propriedade do recurso e o estado atual da conta/sessão.

Stack observada: React 19, React Router 7, Vite 8, Node 24, TypeScript 7, Express 5,
Zod 4, Prisma 7.10.1 com adapter PostgreSQL e PostgreSQL 17. Testes usam Vitest 5,
Supertest, Testing Library, jsdom e axe. O ambiente restaurado usou Node 24.22.1,
npm 12.2.1, Docker 29.9.2 e PostgreSQL 17.11.

Referências principais: [App.jsx](../src/App.jsx), [app.ts](../backend/src/app.ts),
[schema.prisma](../backend/prisma/schema.prisma) e
[Compose de demonstração](../deploy/demonstracao/compose.yaml).
As decisões D16, D17, D23, D40 e D42–D44 orientaram a análise: mensageria,
organização e testes, preparação operacional, logout, observações e canais de acesso.
Não foi justificada uma migração arquitetural ampla.

## Ambiente seguro e instalação

- Os arquivos rastreados e dependências foram copiados para diretório descartável,
  sem `.git` ou `.env` real. A instalação ocorreu apenas nessa cópia.
- O PostgreSQL usou container e rede exclusivos, sem volumes persistentes e com
  dados em `tmpfs`. A porta foi vinculada somente a loopback.
- Antes das migrations, inspeções confirmaram armazenamento temporário, identidade
  do banco e ausência de tabelas de aplicação. Bancos auxiliares também foram
  criados exclusivamente nessa instância.
- Os processos receberam ambiente definido por lista permitida, descartando
  configurações herdadas de banco, segredos e `NODE_OPTIONS`. A instalação
  restaurada usou home, cache e arquivos npmrc vazios exclusivos.
- `npm ci --ignore-scripts --include=dev --no-audit --no-fund` restaurou as duas
  instalações, sem alterar os lockfiles. Não houve `npm update` ou `npm audit fix`.
- Os scripts de instalação foram revisados. Bcrypt e esbuild funcionaram com os
  binários incluídos. A telemetria de instalação do Scarf permaneceu ignorada.
- `prisma generate` foi executado explicitamente na cópia, após backup individual
  validado dos arquivos gerados. Nenhum lifecycle foi habilitado indiscriminadamente.

A rodada inicial com dependências ausentes não foi usada como resultado final.
Uma rodada de integração sobreposta à inicialização de um harness foi invalidada;
a integração foi repetida serialmente. Ao encerrar, os 264 arquivos rastreados da
cópia continuavam idênticos aos originais. O container foi parado, os servidores
HTTP encerrados e a aba exclusiva do navegador fechada.

## Resultados de testes e verificações

| Suíte versionada | Arquivos | Coletados | Aprovados | Falhos | Ignorados | Bloqueados |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Frontend | 25 | 290 | 290 | 0 | 0 | 0 |
| Backend isolado | 4 | 32 | 32 | 0 | 0 | 0 |
| Backend em `src/`, incluindo integração | 46 | 687 | 687 | 0 | 0 | 0 |
| **Total** | **75** | **1.009** | **1.009** | **0** | **0** | **0** |

Os três processos terminaram com código zero e os relatórios JSON indicaram
sucesso. O grupo backend em `src/` também inclui testes puros: não são 687 casos
individualmente classificados como integração de banco.

| Verificação | Resultado |
| --- | --- |
| Lint frontend/backend | Passou, sem erros ou avisos |
| Typecheck e build backend | Passaram |
| Build frontend | Passou com Vite 8.2.4; aviso de chunk acima de 500 kB |
| Conferência de códigos | Passou: 33 códigos com presença textual |
| E2E versionado da API | Seis casos passaram, incluídos nos 687 |
| Concorrência e papéis | Suítes de auth, redefinição, canais, grade e matriz passaram |

Os runners invocaram os binários correspondentes a `lint`, `build`, `typecheck`,
`test` e `conferir:codigos` com ambiente controlado. Não se afirma que todos os
scripts npm foram chamados literalmente. Não houve repetição desses testes para
a preparação desta documentação.

### Limitações da suíte

- Cobertura percentual não foi obtida: o provider não está declarado nos lockfiles
  aprovados. Nenhuma ferramenta adicional foi instalada para produzir estimativas.
- O gate de códigos verifica presença textual; não comprova cobertura comportamental.
- Os ensaios de injeção abaixo não equivalem a uma execução completa de mutação.
- Jsdom emitiu avisos de canvas; a validação de contraste/layout não é comprovada
  pela execução de axe nesse ambiente. A execução padrão fixa o fuso da clínica.
- Houve avisos de consultas concorrentes no mesmo client `pg`; não causaram falhas
  nem foram corrigidos nesta fase.

## Achados consolidados

P0 significa bloqueador crítico; P1, correção importante antes da exposição; P2,
impacto limitado ou mitigável; P3, manutenção ou melhoria opcional. Não foi
confirmado P0 no escopo examinado.

Os identificadores AUD-11 e AUD-12 preservam a consolidação inicial: correspondem
a OPS01 e DOC01/DOC02, respectivamente, no relatório temporário final. Essa
equivalência não representa novos achados independentes.

| ID | Prioridade | Estado e evidência | Recomendação / próxima ação |
| --- | --- | --- | --- |
| AUD-01 | P1 | Limitação operacional confirmada: `env.ts` aceita apenas `log` e rejeita sua combinação com produção; o Compose exige produção. Teste existente passou. | Decidir provedor ou perfil explícito de demonstração; preservar a proteção e validar antes de operar. |
| AUD-02 | P1 antes do túnel | Confirmado por inspeção: Nginx substitui XFF/XFP pelo peer e scheme local. Cadeia real ainda não reproduzida. | Definir remetentes confiáveis; testar dois clientes, headers forjados, IPv4/IPv6, limites e HTTPS. |
| AUD-03 | P2 | Fragilidade de QA reproduzida: quatro HTTP 500 injetados e os cinco testes selecionados da matriz passaram. | Fortalecer asserções e fixtures; comprovar que a injeção passa a reprovar o teste. |
| AUD-04 | P2 | Fragilidade de QA reproduzida: cinco escritas concluídas e cinco HTTP 500 injetados; o teste concorrente de grade passou. | Verificar ambas as respostas e controlar intercalação com barreiras. |
| AUD-05 | P2 | Confiabilidade reproduzida com pool reduzido: reserva falha com uma conexão e conclui com duas. A grade é lida pelo Prisma global durante a transação. | Passar a conexão transacional à leitura; preservar ordem das checagens, travas e rollback. |
| AUD-06 | P2 | Bug de interface reproduzido: botão de cancelar permanece após início, foco e visibilidade. O HTTP 422 do harness foi simulado. | Atualizar relógio/classificação temporal e testar início, foco, visibilidade e fronteira de 24 horas. |
| AUD-07 | P2 | Limitação operacional: Compose não define política de reinício. | Definir política proporcional e ensaiar processo, dependências e reboot no destino. |
| AUD-08 | P2, investigação | Campos estruturados foram ocultados; uma sentinela artificial em `Error.message` permaneceu. Vazamento por fluxo real não foi confirmado. | Investigar se informações sensíveis chegam a erros reais antes de propor sanitização. |
| AUD-09 | P3, candidato | Microbenchmark mediu custo de ocupações mensais; gargalo no endpoint não foi demonstrado. | Medir disponibilidade/SQL com dataset representativo antes de otimizar. |
| AUD-10 | P2, validação parcial | E2E da API e smoke de navegador passaram; Nginx/túnel/TLS e stack final permanecem pendentes. | Executar ensaio integrado de implantação após os bloqueadores. |
| AUD-11 | P2 | Limitações operacionais: hardware, usuários restritos, alertas, backup externo e recuperação de desastre não comprovados. | Preparar servidor e runbook; validar permissões, cópia externa e recuperação no ambiente final. |
| AUD-12 | P2/P3 | Contextos e resumos não acompanham decisões/contagens atuais. Checkout Windows converte scripts shell para CRLF, mas o índice Git usa LF. | Atualizar contexto após decisões e documentar transporte LF. Preservar registros históricos corretos. |
| SEC-05 | P1 | Dependência afetada e caminho confirmados: Express 5.2.1 resolve body-parser 2.3.0, antes da autenticação. Crash não reproduzido nos ensaios preliminares. | PR independente para resolução corrigida e regressões; ver [planejamento](proposta-sec05.md). |
| SEC-07 | P2 no contexto | Zod 4.6.5 sinalizado; arrays autenticados sem teto e corpo limitado a 100 KiB. OOM não reproduzido. | Atualizar patch e avaliar limites técnicos aprovados, sem inventar regra de negócio. |

Referências para investigação: [ambiente](../backend/src/config/env.ts),
[proxy](../deploy/demonstracao/nginx.conf),
[matriz](../backend/src/matriz-de-papeis.test.ts),
[grade concorrente](../backend/src/modulos/disponibilidade/grade.concorrencia.test.ts),
[criação](../backend/src/modulos/consultas/criacao.service.ts),
[leitura da grade](../backend/src/modulos/disponibilidade/grade.service.ts),
[tela do paciente](../src/pages/MinhasConsultas.jsx) e
[logger](../backend/src/compartilhado/logger.ts).

### Evidências de reprodução

- AUD-03: respostas observadas `[401, 500, 500, 500, 500]`; quatro falhas injetadas.
  Cinco casos passaram e 212 ficaram deliberadamente fora do filtro. Essa seleção
  não altera o total da suíte principal nem comprova fraqueza de toda a suíte.
- AUD-04: cinco falhas e cinco sucessos controlados; o único teste original passou.
- AUD-05: pool de uma conexão, timeout de 300 ms, erro em cerca de 340 ms e nenhuma
  reserva parcial. Controle com duas conexões concluiu a mesma reserva. Não mede
  capacidade do pool padrão ou do servidor final.
- AUD-06: tela aberta imediatamente antes do início; relógio avançado até o início,
  com timer/foco/visibilidade. Botão persistiu inclusive após erro simulado. O
  harness comprova a UI, não a rejeição do backend.

Os harnesses foram arquivos adicionais descartáveis. Não modificaram serviços ou
testes originais. Nenhum achado foi considerado corrigido.

## Segurança e dependências

| Auditoria npm | Pacotes sinalizados | Altos | Moderados | Críticos |
| --- | ---: | ---: | ---: | ---: |
| Frontend completo | 0 | 0 | 0 | 0 |
| Frontend produção | 0 | 0 | 0 | 0 |
| Backend completo | 5 | 3 | 2 | 0 |
| Backend produção | 4 | 2 | 2 | 0 |

Esses números são pacotes sinalizados pela base consultada em 14/11/2026, não
explorações confirmadas da aplicação. Foram executados `npm audit --json` e sua
variante `--omit=dev`, sem correções automáticas.

| Pacote | Alcance e classificação contextual |
| --- | --- |
| body-parser 2.3.0 | SEC-05, P1: parser JSON padrão antes de auth. Dois pedidos preliminares retornaram 400/200 e não derrubaram os processos descartáveis. |
| Zod 4.6.5 | SEC-07, P2: caminhos de coleções autenticados e limite de corpo reduzem a exposição observada; stress/OOM não executado. |
| qs 6.16.0 | P3: uso vulnerável de `stringify` com formato `comma` não encontrado; pode ser resolvido pela transitiva necessária de SEC-05. |
| fast-uri 3.1.8 | P3: cadeia Prisma/Prisma Dev/streams/Ajv, sem caminho hostil da API identificado. Pode aparecer em produção devido à cadeia de peer. |
| Vite 8.3.2 | P3: transitivo de Vitest/mocker no backend; não é servidor de produção. O Vite direto do frontend resolve 8.2.4. |

A correção upstream do Zod antecipa recusa de coleções com teto; arrays atuais sem
limite superior continuam exigindo avaliação. Atualizar a biblioteca, sozinho,
não comprova mitigação desses arrays. Fontes: [advisory Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)
e [correção do mantenedor](https://github.com/colinhacks/zod/pull/6652).
As referências dos demais advisories constam no JSON consolidado.

Não foi confirmado novo bypass de autorização nos caminhos examinados. Não houve
scan de imagens nem prova de ausência de vulnerabilidades. Os resultados não
dispensam atualização e validação dos componentes alcançáveis.

## Validações integradas, desempenho e recuperação

O E2E versionado da API percorreu login, equipe, recuperação, grade, pacientes,
agendamento, conflito, remarcação, cancelamento, observações e realização, com
PostgreSQL real e mensageria em memória.

Um smoke no navegador Orca usou API e frontend reais em loopback e hostname
exclusivo para isolar cookies. Passaram login fictício, restauração após recarga,
leitura de paciente fictício, logout com recarga e redirecionamento de rota
protegida. Não foram inspecionados valores de tokens/cookies. O ensaio local em
`NODE_ENV=test` não é modo de demonstração pública nem valida cookies em produção.

| Medição | Resultado e limite |
| --- | --- |
| Smoke HTTP de leitura | 20 pedidos, concorrência 2, 20 HTTP 200, zero erros; p50 8,43 ms e p95 23,93 ms |
| Login desse smoke | Uma amostra de 411,05 ms; insuficiente para conclusão sob carga |
| Saúde com PostgreSQL pausado | Liveness 200; readiness 503 em 1.005 ms |
| Saúde após retomar PostgreSQL | Liveness 200; readiness 200, medido em 5 ms |
| Microbenchmark puro | Com 20 dentistas e fixture mensal, mediana 170,827 ms contra 12,173 ms com entradas diárias |

O microbenchmark teve sete amostras, 23 dias e 184 ocupações por dentista;
equivalência foi verificada para durações de 15/30/60 minutos. O endpoint pode
encerrar cálculos antecipadamente: isso não demonstra ganho equivalente na API.
Nenhuma otimização foi aplicada. Não houve stress, resistência ou medição de
capacidade do servidor final.

A primeira confirmação de recuperação HTTP foi interrompida pelo timeout do
harness, não por falha demonstrada do produto. A repetição com prazo adequado
passou e encerrou o servidor normalmente. Contagens fictícias foram preservadas
durante pausa e retomada; isso não comprova persistência após perda de host/disco.

### Backup e restauração

Os [scripts existentes](../scripts/operacao/backup.sh) de
[restauração](../scripts/operacao/restaurar-ensaio.sh) foram exercitados no container
exclusivo, com dump custom, catálogo e checksum. A primeira tentativa falhou por
CRLF do checkout Windows. Novas cópias operacionais LF foram usadas, sem alterar
os originais ou sua lógica.

A restauração em banco novo preservou inicialmente dois pacientes, uma consulta e
zero históricos, além de 23 constraints CHECK/exclusion e 33 índices. Sete operações
pela API da cópia restaurada passaram: login, leituras, agendamento, observação,
histórico e cancelamento. A origem continuou com uma consulta e a cópia terminou
com duas, demonstrando isolamento da escrita.

O script reportou zero segundos com resolução de um segundo. Fixture pequena e
mesmo host não comprovam RPO/RTO, backup externo, criptografia ou recuperação de
desastre. Não houve sobrescrita ou exclusão de bancos preexistentes.

## Infraestrutura e limitações restantes

O Compose demonstrativo publica apenas o frontend em loopback; API e banco ficam
nas redes do pacote. A sintaxe passou com `config --no-interpolate --quiet`, sem
renderizar segredos. Nenhum stack demonstrativo completo foi iniciado nesta fase.

- Imagens Node/Nginx/projeto e binário Nginx não estavam disponíveis localmente.
  A autorização de `npm ci` não foi ampliada para baixar imagens. AUD-02 permanece
  fundamentado em configuração, sem reprodução no Nginx real.
- A proteção da mensageria impede iniciar o pacote em produção. Não foi contornada
  usando desenvolvimento, teste ou configuração injetada para publicação.
- O `cloudflared` local era 2026.6.1, consultado sem rede. Nenhum túnel, login ou
  atualização foi executado. A [documentação atual consultada](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)
  oferece restrição por e-mail; confirmar versão e ajuda após atualização aprovada.
- Não foram validados TLS, identidade do cliente e limites na cadeia externa,
  imagens/OS, reboot ou hardware/rede final. Não foi inventado dimensionamento.
- Usuários mínimos, política clínica, retenção aprovada, cópia externa e alertas
  dependem de preparação própria. O restore local não encerra essas pendências.
- O smoke de navegador não percorreu todos os papéis, múltiplas abas, dispositivo
  físico ou leitor de tela desta rodada.

Cada limitação foi registrada como pendência; nenhuma foi convertida em aprovação.

## Backlog e estratégia da próxima fase

A ordem abaixo é proposta, não autorização nem sequência definitiva. Reavaliar
criticidade, dependências, revisão atual e conflitos antes de executar.

| Ordem | Entrega e branch proposta | Arquivos potenciais | Validação e dependências |
| --- | --- | --- | --- |
| 1 | SEC-05: `fix/body-parser-corpos-comprimidos` | Lock backend e teste/fixture isolados; package somente se fixação aprovada | Parsing, sobrevivência do processo, suítes, build e audit; independente de migrations |
| 2 | AUD-01: branch após decidir provedor ou modo demo | Decisão canônica, configuração, enviador e testes | Preservar proteção de produção; validar isolamento, destinatários e entrega |
| 3 | AUD-02/AUD-07: `fix/deploy-proxy-recuperacao` | Nginx, Compose, testes e operação | Dois clientes, spoofing, limites, HTTPS e reinício; depende da topologia |
| 4 | AUD-05: `fix/leitura-grade-na-transacao` | Serviços de criação/grade e regressões | Mesma reserva com pool reduzido, rollback e concorrência |
| 5 | AUD-03/AUD-04: `test/auditoria-assertivas-criticas` | Matriz de papéis e teste concorrente de grade | Injeções devem reprovar; comportamento normal e ambos os sucessos preservados |
| 6 | AUD-06: `fix/atualizacao-temporal-minhas-consultas` | Tela e testes do paciente | Início, foco, visibilidade, classificação e fronteira de 24 horas |
| 7 | SEC-07: `fix/validacao-colecoes-seguranca` | Package/lock, schemas e testes se limites aprovados | Patch corrigido, entradas limitadas e preservação do contrato; após lock de SEC-05 |
| 8 | Ferramentas residuais: `chore/dependencias-ferramentas-auditoria` | Lock e versões dev pertinentes | Geração, migrations, suítes e builds; após dependências runtime, sem major desnecessária |
| 9 | AUD-11/AUD-12: documentação operacional autorizada | Contextos, README, operação e roteiros | Correspondência com decisões e validação no destino |

AUD-08 continua investigação; não há justificativa para uma correção baseada
apenas em mensagem de erro artificial. AUD-09 e divisão de chunks são opcionais e
dependem de benefício medido. Evitar uma entrega separada para qs se SEC-05 já
resolver a cadeia necessária.

As entregas de dependências compartilham o lockfile e devem ser sequenciais.
Pool, QA e interface podem ser revisados independentemente. Implementações
paralelas exigem worktrees isoladas e autorizadas; execução sequencial dispensa
worktree por formalidade. Toda decisão nova de produto/contrato deve ser aprovada
e registrada antes do código.

## Controle de Git e estado de liberação

Este registro pertence à branch documental `docs/auditoria-tecnica-fase1`, destino
`main`. Não registra número, abertura ou integração de PR ainda não confirmados.
O estado de cada correção é **aguardando aprovação e confirmação da branch**.

Continuam obrigatórios: preservar alterações locais, validar backups de arquivos
existentes, confirmar branch/worktree, TDD no backend, revisão e testes pertinentes,
PRs pequenas e comandos manuais de Git. Não há autorização para commits, pushes,
abertura automática de PR ou merge.

**Critério atual: NO-GO para exposição externa.** Antes da liberação, resolver
SEC-05; decidir e validar mensageria/demo; comprovar cadeia confiável de IP,
limites e cookies HTTPS; construir e operar o stack final com reinício; restringir
acesso; validar permissões mínimas, backup/recuperação e alertas proporcionais.
Esta documentação não autoriza nem inicia a Fase 2.
