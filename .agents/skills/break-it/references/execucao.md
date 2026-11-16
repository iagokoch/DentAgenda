# Instalação e execução

Use Node 24, Docker Desktop e os lockfiles locais. No PowerShell com bloqueio de scripts, use `npm.cmd`/`npx.cmd`, sem alterar política global. Dependências são locais; não instalar Playwright CLI e MCP adicionais sem necessidade concreta. Playwright Test já oferece execução por comandos e API de automação com melhor reprodutibilidade neste projeto.

## Preparação

Na raiz: `npm ci`. No backend: `npm ci --ignore-scripts`, depois `node --import ./scripts/qa/ignorar-env-real.mjs node_modules/prisma/build/index.js generate` para gerar Prisma sem carregar `.env`. Não crie nem leia `.env` para a auditoria descartável. Navegador padrão: `npx playwright install chromium`. Alternativa verificada no Windows: definir `BREAK_IT_BROWSER_CHANNEL=msedge` no ambiente do processo, usando o Edge instalado. O servidor Vite exclusivo usa `127.0.0.1:4178`; não reutiliza servidor existente.

## Comandos por escopo

| Escopo | Diretório | Comando |
|---|---|---|
| Frontend baseline | raiz | `npm run lint`, `npm test`, `npm run test:embaralhado`, `npm run build` |
| Frontend propriedades | raiz | `npm run qa:propriedades` |
| E2E sintético | raiz | `npm run qa:e2e` |
| Backend verificações | backend | `npm run lint`, `npm run typecheck`, `npm run test:seguranca`, `npm run conferir:codigos` |
| Backend baseline isolada | backend | `npm run qa:isolado -- baseline` |
| Backend embaralhado isolado | backend | `npm run qa:isolado -- embaralhado` |
| Backend propriedades e regras puras | backend | `npm run qa:propriedades` |
| Agenda/concorrência/extremos | backend | `npm run qa:isolado -- integracao` |
| Mutation testing puro | backend | `npm run qa:mutacao` |
| Carga descartável controlada | raiz | `npm run qa:carga` |

Auditoria completa executa as linhas na ordem rápidos, persistência, mutação, navegador, carga. Autenticação/permissões usa baseline isolada existente (inclui matriz e corridas); seleções futuras devem manter a guarda do runner e o setup sequencial. Não execute `qa:integracao:interno` diretamente em ambiente desconhecido: é o comando delegado pelo runner após verificar o banco real.

Para focar um arquivo existente da suíte normal, use `npm run qa:isolado -- baseline src/modulos/procedimentos/procedimentos.test.ts`. O runner aceita somente um caminho `src/...test.ts`, sem flags adicionais, e preserva a guarda de segurança. A suíte de segurança de 32 testes ainda roda antes do arquivo selecionado.

## Reprodução e limitações

Propriedades usam seed `20261112`; backend 300 execuções por propriedade, frontend 250. Ao falhar, fast-check registra seed/path; acrescente `path` temporariamente aos parâmetros para reproduzir o caso reduzido, sem alterar produção. Não publique contraexemplos de credenciais ou identificadores pessoais.

Integração cria um contêiner novo, publica porta aleatória somente em loopback, confirma `current_database`, injeta URLs/segredos em memória e impede `loadEnvFile` nas configs legadas durante aquela execução. O contêiner específico é removido no `finally`; interrupções forçadas podem deixá-lo ativo. Identifique nome e label `dentagenda.qa=break-it` antes de removê-lo manualmente; nunca use limpeza ampla.

Stryker 10.1.1 aceita Vitest >=2 e Node >=22. TypeScript 7 removeu a API usada pelo preprocessor: `tsconfigFile: ""` dispensa reescrita desnecessária de caminhos neste projeto sem references/extends; Vitest transforma TS e `npm run typecheck` continua obrigatório. Mutações rodam no sandbox do Stryker, nunca `inPlace`; `.env*` excluídos. Relatórios locais em `backend/reports/break-it/`; confira JSON para sobreviventes e equivalentes.

API sintética do navegador falha em chamadas não previstas e não valida backend/banco. Uma execução verde não comprova todos os fluxos completos. k6 não substitui benchmark representativo de produção; preserve limites de 5 VUs/30 s mesmo se scripts históricos oferecerem cenários maiores.

Durante uma investigação, achados de produção podem manter a suíte opt-in vermelha. Na entrega por PRs separadas, mantenha as evidências históricas e transporte regressões que falham junto com a correção, explicando a separação. BUG-001 é reproduzido pela suíte `src/modulos/procedimentos/procedimentos.limites.test.ts` na branch de correção; a PR de infraestrutura conserva 11 integrações aprovadas. Registre HTTP, código de erro, campo/valor-limite não sensível e ausência de persistência parcial; não registre payload completo nem logs crus do Prisma. Não use `npm audit fix` para ocultar avisos: compare com o lockfile original e relate alcance/explorabilidade separadamente.
