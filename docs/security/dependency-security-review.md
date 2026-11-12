# Revisão de segurança das dependências — DentAgenda

Data: 2026-11-12. Base: `443f0a8cf64fd037f035495b5664137aacfd6439` (`origin/main`). Branch: `security/dependency-vulnerabilities`.

## Resumo executivo

A baseline reproduzível da main apresentou **5 pacotes sinalizados, correspondentes a 13 advisories**: 3 pacotes com severidade agregada alta e 2 moderada. Após a atualização, permanece **1 pacote moderado, com 4 advisories** (`fast-uri`). Foram removidos os avisos de body-parser, Zod, Vite e qs: 9 advisories. Não se trata de 13 caminhos de exploração confirmados.

O encerramento do processo causado por body-parser foi reproduzido duas vezes em subprocesso local com uma requisição pequena. A atualização elimina essa reprodução. A falha de rejeição tardia de coleções limitadas do Zod também foi reproduzida e corrigida. A presença de versões afetadas do Vite foi confirmada, mas não foi identificado servidor Vite exposto pela API. O consumo de memória em arrays Zod sem máximo continua sendo risco residual: atualizar a biblioteca não estabelece limites de domínio.

A sondagem inicial na branch da correção de overflow apresentou 22 pacotes sinalizados e incluía ferramentas da PR de QA. Essa árvore não é a base desta entrega. Consultas dentro do sandbox também produziram contagens propagadas diferentes; a comparação abaixo usa instalações limpas dos lockfiles e consultas ao npm com o mesmo acesso completo, sem tratar falhas de permissão como evidência de segurança.

Esta revisão não afirma segurança completa do sistema nem ausência de vulnerabilidades desconhecidas.

## Base, escopo e ambiente

As entregas descritas como “PR #1” e “PR #2” na solicitação correspondem à [PR #38, infraestrutura QA](https://github.com/iagokoch/DentAgenda/pull/38), aberta contra main, e à [PR #39, overflow](https://github.com/iagokoch/DentAgenda/pull/39), aberta contra `chore/break-it-qa`. Estados consultados antes de criar a branch. Nenhuma foi modificada ou incorporada nesta PR. A correção de overflow não é pré-requisito para atualizar as dependências.

O checkout é um worktree já isolado. Foram preservados `.serena/` e artefatos locais de Stryker/Playwright que passaram a aparecer como não rastreados ao sair da branch QA. Nenhum deles integra o diff. A tela, as regras de negócio, a configuração Express e a arquitetura não mudam.

Ambiente verificado: Windows, Node **24.19.0**, npm **12.1.0**, Docker Engine **29.8.0**, PostgreSQL **17** descartável. Manifests e lockfiles independentes: `package.json`/`package-lock.json` na raiz e em `backend/`. Node 24 satisfaz os engines das versões selecionadas. Não foram lidos arquivos `.env` ou credenciais.

Documentos consultados: `CLAUDE.md`, README, contratos em `docs/api.md`, decisões em `docs/documentacao.md`, relatório e referência de execução Break-It da branch QA. O runner descartável da PR #38 foi copiado para diretório temporário antes da troca de branch, ajustando apenas a localização do backend; não é uma dependência de build/execução desta PR.

## Comparação antes e depois

| Verificação | Antes, main | Depois |
|---|---|---|
| Frontend `npm audit --json` | 0 | 0 |
| Backend `npm audit --json` | 5 pacotes: 3 altos, 2 moderados | 1 moderado: fast-uri |
| Backend `npm audit --omit=dev --json` | 4 pacotes: 2 altos, 2 moderados | 1 moderado: fast-uri |
| Advisories únicos backend | 13 | 4 |
| Árvore backend, contagem do metadata do audit | 429 | 429 |
| Express / Vitest backend | 5.2.1 / 5.0.3 | sem alteração |
| Vite frontend | 8.2.4 | sem alteração; já contém os backports pertinentes |

O total do metadata inclui dependências opcionais e não corresponde ao número de diretórios instalados no Windows. `npm ci --ignore-scripts` instalou 342 pacotes no backend antes e depois. As contagens de audit são fotografias da base de advisories consultada nessa data. Exit 1 do audit com avisos remanescentes é esperado e não foi convertido em sucesso.

O lockfile altera somente **body-parser 2.3.0 → 2.4.0**, **Zod 4.6.5 → 4.6.6**, **Vite 8.3.2 → 8.3.3** e **qs 6.16.0 → 6.16.1**, incluindo metadados de versão, integridade e requisitos do body-parser. Não adiciona nem remove nós. Não há overrides. Somente Zod é alterado no manifesto: body-parser, Vite e qs permanecem transitivos.

Para selecionar versões mínimas com o resolvedor normal do npm, foram usados `npm install --package-lock-only --ignore-scripts --save-exact` e requisitos diretos temporários, removidos com `npm pkg delete` antes da reconciliação. O npm inicialmente escolheu qs 6.17.1; a resolução final foi reduzida a 6.16.1 para evitar uma atualização minor desnecessária. O lockfile final foi instalado por `npm ci --ignore-scripts`. Não foi usado `npm audit fix`.

## 1. body-parser — prioridade de produção

| Campo | Informação |
|---|---|
| Pacote | body-parser, transitivo de produção |
| Versão anterior / corrigida | 2.3.0 / 2.4.0 |
| CVE/GHSA | CVE-2026-111181 / [GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828) |
| Severidade oficial | Alta, CVSS 3.1 7,5; CWE-248 |
| Faixas afetadas | `>=2.0.0 <2.4.0`; linha 1.x `<1.20.9`, corrigida em 1.20.9 |
| Caminho | API → express@5.2.1 → body-parser@2.3.0 |
| Ambiente afetado | Processo Node da API, antes da autenticação |
| Exploração possível? | Reprodução local confirmada; disponibilidade externa depende do proxy/ingress |
| Correção aplicada? | Sim, atualização transitiva; Express permanece 5.2.1 |
| Testes executados | Subprocesso gzip/deflate com bytes tardios; parsing/limites/erros; suíte completa da API |
| Risco residual | Não substitui limites de conexão, proteção de ingresso ou monitoramento |

`backend/src/app.ts` registra `express.json()` globalmente antes das rotas, autenticação e rate limit de `/api/auth`. Defaults instalados: `inflate: true`, `limit: 102400` bytes, modo estrito de objetos/arrays e Content-Type JSON. Não há chamada de produção a `express.urlencoded()`. Helmet e rate limit não impedem esta falha de descompressão anterior às rotas.

O ataque relevante é uma exceção assíncrona não tratada quando bytes extras atingem o descompressor depois do término do frame válido. Não depende de JSON inválido, grandes corpos, login ou rota válida. O limite JSON de 100 KiB não evita um frame pequeno com bytes tardios. O middleware centralizado não captura um evento `error` emitido fora da cadeia Express. Impacto: indisponibilidade por encerramento do processo; probabilidade relevante se requisições comprimidas chegam ao Node. O comportamento do proxy real não foi testado.

O [patch do mantenedor](https://github.com/expressjs/body-parser/commit/1260c38) encerra o consumo do descompressor com proteção para erros tardios. A [release 2.4.0](https://github.com/expressjs/body-parser/releases/tag/v2.4.0) é aceita pelo requisito `^2.2.1` do Express atual. Não há necessidade de trocar Express, introduzir override ou desabilitar compressão.

Evidência: um subprocesso abre servidor em `127.0.0.1` e porta efêmera; o cliente só envia 1024 bytes restantes depois que o parser entrega o JSON. Na versão antiga, gzip encerrou o processo com `Z_DATA_ERROR`, exit 1, em duas execuções. Na corrigida, o subprocesso retorna exit 0, HTTP 200 e o mesmo JSON; o controle deflate também passa. Nenhum processo compartilhado foi atacado.

Os controles preservam objetos aninhados, Unicode, arrays, campos extras encaminhados à validação, JSON malformado/primitivo, Content-Type incorreto, charset/encoding não suportados, gzip válido e limite após descompressão. O middleware continua traduzindo erros de corpo reconhecidos para **HTTP 400 / ENTRADA_INVALIDA**, inclusive `entity.too.large`; o status bruto 413 da biblioteca não altera esse contrato.

## 2. Zod — correção compatível e limite da mitigação

| Campo | Informação |
|---|---|
| Pacote | Zod, dependência direta de produção |
| Versão anterior / corrigida | 4.6.5 / 4.6.6 |
| CVE/GHSA | CVE-2023-54404 / [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) |
| Severidade oficial | Alta; CVSS 4.0 8,2 na página GitHub; feed npm informa CVSS 3.1 7,5 |
| Faixa afetada | `<4.6.6`; primeira versão corrigida 4.6.6 |
| Ambiente afetado | Validação de entrada no backend; geração de contratos OpenAPI |
| Exploração possível? | Falha de rejeição antecipada confirmada com coleção limitada; OOM na aplicação não demonstrado |
| Correção aplicada? | Sim, patch da biblioteca; sem mudanças nos schemas de negócio |
| Testes executados | Ordem de validação, schemas de todos os domínios e suíte existente da API |
| Risco residual | Arrays de disponibilidade sem máximo continuam percorrendo os elementos |

O texto do advisory menciona coleções sem limite, mas o [commit a0ebf97](https://github.com/colinhacks/zod/commit/a0ebf97) corrige especificamente o custo antes de limites superiores existentes (`max`, `length`, `size`). Portanto não se infere que o upgrade imponha um teto global ao número de erros.

Os arrays de produção encontrados estão em `disponibilidade.schemas.ts`: grade sem máximo e `dentistaIds` com mínimo de 1. As rotas exigem autenticação e papéis de administração/recepção/dentista. Há limite HTTP de 100 KiB também após descompressão, mas vários erros podem ser gerados por elemento e novamente serializados pelo middleware. Impacto potencial: amplificação de CPU/memória. Acesso restrito e limite de corpo reduzem exposição; não comprovam impossibilidade de esgotamento.

Reprodução pequena: um schema de teste com `max(2)` recebe três strings e uma validação instrumentada. Em 4.6.5, o callback roda três vezes antes da rejeição; em 4.6.6 não é chamado. Os schemas da aplicação não receberam máximos arbitrários, pois isso mudaria regras de negócio. Recomenda-se tarefa separada para definir limites justificáveis para grade e bloqueios em lote.

A mudança observável da biblioteca é que erros/refinamentos dos elementos podem deixar de ocorrer quando uma coleção já excede um máximo. Não foram encontradas coleções com limite superior que dependam desse comportamento na aplicação. Foram preservados: normalização de e-mail, CPF, senha em bytes UTF-8, trim, UF em maiúsculas, opcionais/nulos, coercion de paginação, ausência de coerção numérica nos procedimentos, descarte de campos extras e privilégio enviado pelo cliente, datas com fuso e refinamento de início/fim. As mensagens e códigos existentes continuam cobertos pela suíte. Não foi necessária migração major ou adaptação de código de produção.

## 3. Vite no backend — desenvolvimento e CI

| Campo | Informação |
|---|---|
| Pacote | Vite, transitivo dev/peer de Vitest@5.0.3 e @vitest/mocker@5.0.3 |
| Versão anterior / corrigida | 8.3.2 / 8.3.3 |
| CVE/GHSA | Seis advisories discriminados abaixo |
| Severidade | Uma alta, quatro moderadas, uma baixa |
| Faixa na linha instalada | `>=8.3.0 <=8.3.2`; primeira corrigida 8.3.3 |
| Ambiente afetado | Desenvolvimento/testes; depende de servidor e funcionalidades expostos |
| Exploração possível? | Versão afetada confirmada; pré-condições não identificadas nos scripts/configs usados |
| Correção aplicada? | Sim, patch transitivo aceito por Vitest, sem mudar a infraestrutura |
| Testes executados | Suíte de segurança e suíte completa, incluindo execução embaralhada |
| Risco residual | Não expor servidores/ferramentas de desenvolvimento a entradas não confiáveis |

| Advisory / CVE | Severidade oficial | Pré-condições e impacto |
|---|---|---|
| [GHSA-698v-4r3x-3vcv](https://github.com/advisories/GHSA-698v-4r3x-3vcv), CVE-2026-112943 | Moderada, 6,3 | Windows, argumento controlado em launch-editor e expansão de `%`; possível execução de comando |
| [GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm), CVE-2026-112942 | Alta, 7,5 | Windows, contorno da verificação de existência de arquivo; combinado com escaping incorreto permite injeção |
| [GHSA-r825-w8mm-5pxw](https://github.com/advisories/GHSA-r825-w8mm-5pxw), CVE-2026-112944 | Moderada, 6,3 | No Vite, WSL e arquivo começando com `+`/`-`, editor compatível interpreta caminho como flags |
| [GHSA-9jrq-w75r-8gcw](https://github.com/advisories/GHSA-9jrq-w75r-8gcw), CVE-2026-112945 | Baixa, 2,1 | Site malicioso e integração customizada de transformIndexHtml com URL original e módulo inline; script cross-origin |
| [GHSA-rq7h-c2jc-7f22](https://github.com/advisories/GHSA-rq7h-c2jc-7f22), CVE-2026-112946 | Moderada, 6,3 | Não Windows, servidor acessível, coincidência entre caminho relativo do projeto e absoluto do host; leitura fora de fs.allow |
| [GHSA-vfpm-58rq-9qcg](https://github.com/advisories/GHSA-vfpm-58rq-9qcg), CVE-2026-112947 | Moderada, 6,3 | Servidor acessível em Node/Deno, consulta vite-wasm-instance e arquivo pertinente; vazamento de quatro bytes via erro |

Os scripts backend executam `vitest run`; não há API/UI/browser/host público habilitados nos configs. API de produção inicia Express em `dist/server.js`, não Vite. O lock marca Vite como `dev: true`/`peer: true`; as faixas do Vitest aceitam 8.3.3. O [patch release](https://github.com/vitejs/vite/releases/tag/v8.3.3) resolve os seis avisos sem atualizar Vitest. A ausência de configuração pública reduz exposição, mas não torna dependências dev automaticamente seguras.

O frontend já usa 8.2.4, versão que recebeu os backports; não foi atualizado. O risco de desenvolvimento/CI foi reduzido por uma mudança pequena e compatível, em vez de adiar uma migração major inexistente.

## 4. qs — atualização requerida pelo parser

| Campo | Informação |
|---|---|
| Pacote | qs, transitivo de Express, body-parser e Superagent/Supertest |
| Versão anterior / corrigida | 6.16.0 / 6.16.1 |
| CVE/GHSA | CVE-2026-110816 / [GHSA-6pq8-jhm2-2vcw](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw) |
| Severidade / faixa | Moderada, 5,3; `>=6.7.0 <=6.16.0`; corrigida em 6.16.1 |
| Ambiente / exploração | Exige stringify com arrayFormat comma e elemento com toString próprio não chamável; uso não encontrado na API |
| Correção aplicada? | Sim; body-parser 2.4.0 exige `qs ^6.16.1`; resolução deduplicada |
| Testes / risco residual | Parsing e regressões existentes; nenhuma exploração desse caminho demonstrada |

Essa mudança é necessária para satisfazer o parser atualizado e remove também um advisory confirmado. Não houve ampliação para atualização geral de transitivas.

## 5. Pendência: fast-uri / ferramenta Prisma

`fast-uri 3.1.8` permanece. Todos os quatro advisories têm correção em **3.1.9** na linha 3.x.

| Advisory / CVE | Severidade | Faixa afetada | Condição |
|---|---|---|---|
| [GHSA-w74x-v6f9-j3xg](https://github.com/advisories/GHSA-w74x-v6f9-j3xg), CVE-2026-110306 | Moderada, 6,1 | `>=3.0.0 <3.1.9` | Decodificação de esquema percent-encoded usada em contexto sensível |
| [GHSA-xhq7-xmqj-769h](https://github.com/advisories/GHSA-xhq7-xmqj-769h), CVE-2026-110095 | Baixa, 3,7 | `>=3.0.0 <3.1.9` | Equivalência incorreta de caminhos relativos |
| [GHSA-wjr9-j795-jxcr](https://github.com/advisories/GHSA-wjr9-j795-jxcr), CVE-2026-110180 | Moderada, 4,8 | `>=3.1.3 <3.1.9` | Canonicalização de host usada como decisão de confiança |
| [GHSA-333x-w4r6-6crp](https://github.com/advisories/GHSA-333x-w4r6-6crp), CVE-2026-110725 | Baixa, 3,7 | `>=3.0.0 <3.1.9` | Injeção de esquema com opção não padrão reference suffix |

Cadeia: `@prisma/client` → peer opcional `prisma@7.10.1` → `@prisma/dev@0.24.17` → `@prisma/streams-local@0.1.11` → `ajv@8.20.0` → `fast-uri@3.1.8`. Por esse peer, pacotes `devOptional` aparecem mesmo no audit com `--omit=dev`; não se afirma que estejam ausentes da imagem de produção.

`banco.ts` usa PrismaPg e cliente gerado, que importa `@prisma/client/runtime/client`. A inspeção desse runtime não identificou uso de fast-uri/Ajv/streams. O import foi encontrado no servidor local de desenvolvimento do Prisma; [prisma dev é documentado como ferramenta local](https://www.prisma.io/docs/cli/v7/dev). O Docker separa os alvos de compilação/migrations e execução da API.

Classificação: biblioteca afetada, exposição relevante em ferramentas caso URIs não confiáveis alcancem as operações descritas; exploração pela API não demonstrada. Impactos dependem do consumidor: confusão de esquema/host e integridade de resolução, não um DoS presumido. Probabilidade pelo caminho HTTP atual parece baixa por ausência de fonte até o consumidor, mas isso é inferência estática.

Não foi atualizada porque é uma árvore independente das três prioridades aprovadas, e a missão proíbe ampliar automaticamente o escopo para todo alerta. Recomenda-se PR específica de atualização transitiva `fast-uri >=3.1.9`, mantendo Prisma 7.10.1 se compatível, validando geração, migração e testes. Não é necessário saltar para Prisma 8 RC, embora npm outdated o apresente como latest.

## Validação e reprodução

Os testes adicionados ficam em `backend/testes/dependencias-http.test.ts` e `dependencias-zod.test.ts`, incluídos pelo script existente `test:seguranca`, sem banco ou leitura de ambiente real. Não foram adicionadas ferramentas.

| Comando / contexto | Baseline | Após correção |
|---|---|---|
| Raiz: npm run lint | Exit 0; avisos em artefato antigo Stryker | Aprovado, com exclusão apenas desses artefatos locais |
| Raiz: npm test | 290 aprovados | Sem alteração frontend; baseline executada nesta branch |
| Raiz: npm run build | Aprovado | Sem alteração frontend; baseline executada nesta branch |
| Raiz: npm run test:embaralhado | Não repetido na baseline | 290 aprovados; seed 1794513574399 |
| Backend: npm run test:seguranca | 32 aprovados; novos testes vermelhos antes do patch | 54 aprovados |
| Backend: npm run typecheck / lint / build | Não registrados como baseline completa da main | Aprovados |
| Backend: npm run conferir:codigos | 33 códigos cobertos | 33 códigos cobertos |
| Backend: npm test em runner descartável | 32 segurança + 687 aplicação aprovados | 54 segurança + 687 aplicação aprovados |
| Backend: npm run test:embaralhado em runner descartável | Não repetido na baseline | 54 segurança + 687 aplicação aprovados; seed 1794513844397 |

O runner cria contêiner PostgreSQL novo, em loopback e tmpfs, confirma `SELECT current_database()` antes de executar migrations, gera segredos em memória, injeta banco de teste, bloqueia `process.loadEnvFile` e remove somente o contêiner criado. O banco de apresentação não foi usado. O cliente Prisma foi gerado com o mesmo bloqueio de loadEnvFile.

Comandos de integração efetivamente usados nesta máquina, a partir de backend (PowerShell):

```powershell
$env:npm_execpath = 'C:/Users/iago/AppData/Roaming/npm/node_modules/npm/bin/npm-cli.js'
node C:/Users/iago/AppData/Local/Temp/dentagenda-security-20261112/executar-isolado.mjs baseline
node C:/Users/iago/AppData/Local/Temp/dentagenda-security-20261112/executar-isolado.mjs embaralhado
```

O helper e seu preload correspondem a `backend/scripts/qa/executar-isolado.mjs` e `ignorar-env-real.mjs` no commit `8305892` da PR #38; somente a constante `backend` do helper temporário foi apontada ao checkout auditado. Os caminhos locais acima são evidência de execução, não requisitos do produto. Em outra máquina, extrair esses dois arquivos desse commit para um diretório temporário, ajustar essa constante e o caminho do npm CLI e manter todas as guardas. Não é preciso integrar a PR #38. O lint final usou `--ignore-pattern backend/.stryker-tmp --ignore-pattern backend/reports` na raiz e os mesmos caminhos relativos no backend, preservando esses artefatos anteriores; nenhum arquivo fonte/teste foi excluído.

Para repetir as regressões puras, em backend, sem qualquer PostgreSQL:

```cmd
npm.cmd ci --ignore-scripts
npm.cmd run test:seguranca
npm.cmd run typecheck
npm.cmd run lint
npm.cmd audit --json
npm.cmd audit --omit=dev --json
```

Typecheck/build de um checkout limpo requerem gerar previamente o Prisma Client, sem carregar `.env` real nesta auditoria. Os comandos comuns de teste da API carregam ambiente e banco por padrão: **não executar npm test diretamente contra configuração desconhecida**. Nesta revisão foram encapsulados no runner descartável preservado da PR #38. Para reproduzir integrações sem incorporar essa PR, o revisor deve usar esse runner com caminhos ajustados ao checkout e o preload de bloqueio de ambiente, ou um PostgreSQL novo equivalente cuja identidade seja conferida antes das migrations.

Limitações: scripts de propriedades, E2E sintético, mutação e carga da PR #38 não existem na main e não foram trazidos para esta entrega. Suítes normais cobrem autorização, concorrência, autenticação e agendamentos; não há alegação de cobertura E2E de navegador nesta PR. Não foram executados carga, ataques contra ambientes compartilhados ou testes com dados reais. Warnings de canvas/jsdom e de uso concorrente de pg são preexistentes e não equivalem a falhas de assertions. A fixture gzip inicial com Supertest foi corrigida para HTTP nativo, pois o cliente serializava Buffer como JSON; as expectativas permaneceram HTTP 200/400 e conteúdo correspondente.

## Riscos residuais e acompanhamento

Prioridade próxima: revisar e atualizar fast-uri na árvore Prisma. Depois, definir limites superiores de coleções de disponibilidade com a clínica, testes de contrato e avaliação do volume de erros. Não introduzir máximos arbitrários nesta correção de dependências. Manter ferramentas dev/CI sem exposição pública e rever o processamento de corpos comprimidos no ingresso real. Dependências transitivas corrigidas apenas no lockfile continuam aceitando versões antigas pelas faixas dos pais: instalações devem usar `npm ci` e preservar o lockfile.

Atualizações diretas disponíveis foram consultadas com `npm outdated`, incluindo Express 5.3.0, Vitest 5.1.0 e Zod 4.6.7. Não foram aplicadas porque versões mínimas corrigidas satisfazem esta missão. Nenhuma vulnerabilidade nova foi apontada no conjunto atualizado; isso não cobre riscos desconhecidos nem garante segurança de toda a aplicação.

Revisão independente: pesquisa de advisories e alcance, rastreamento da árvore Prisma e revisão final do candidato foram delegados em modo somente leitura. O revisor final conferiu compatibilidade dos peers, parser, schemas, testes e escopo; executou os 54 testes de segurança e `npm ls`, sem reportar achados concretos. A revisão não equivale a aprovação humana da PR. A comparação programática dos dois lockfiles confirmou zero nós adicionados/removidos e somente as quatro versões acima modificadas. `git diff --check` foi aprovado.
