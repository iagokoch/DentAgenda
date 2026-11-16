# Triagem dos três avisos altos de dependências

Data: 12/11/2026. Base de publicação: `443f0a8`; árvore de QA ainda não integrada. Análise estática com a skill `codex-security:triage-finding`, sem PoC, ataque, alteração de dependências ou alegação de scan completo. Não há `SECURITY.md` aplicável; foram usados contratos, código e Dockerfiles. Versões corrigidas consultadas no registro npm, sem instalação.

## Resultado e prioridade

| Ordem | Pacote e cadeia instalada | Aviso | Parecer no DentAgenda | Atualização recomendada | Regressão / ação |
|---:|---|---|---|---|---|
| 1 | `express@5.2.1 → body-parser@2.3.0`, transitiva de produção | GHSA-27r3-jxmh-p828 / CVE-2026-111181 | **confirmed**, confiança alta, somente evidência estática: parser comprimido antes de autenticação | Resolver `body-parser >=2.4.0`; Express aceita `^2.2.1` | Baixo a moderado: preservar erros de corpo e contratos; PR de segurança própria prioritária |
| 2 | `zod@4.6.5`, direta de produção | GHSA-mrhx-c7xc-m3w5 / CVE-2023-54404 | **needs_review**, confiança média: arrays alcançáveis, mas autorização e limite de corpo reduzem alcance | Atualizar para ao menos `4.6.6`, patch compatível | Moderado: mudanças na coleta de erros; validar schemas, OpenAPI e respostas; PR separada |
| 3 | `vitest@5.0.3 → vite@8.3.2`, transitiva de desenvolvimento no backend | GHSA-587h-7wmj-h5pm / CVE-2026-112942 | **not_actionable** nos caminhos atuais, confiança alta: endpoint não exposto e Vite ausente do runtime | Atualizar árvore dev para `vite >=8.3.3` em manutenção própria | Baixo a moderado: integração Vitest/Stryker; sem urgência de runtime |

Ranks do contrato de triagem: body-parser é 1 na fila `confirmed`; Zod é 1 na fila `needs_review`; Vite não recebe rank. Severidade do advisory não substitui análise de alcance. Não existe instância pública comprovada por esta inspeção.

## 1. body-parser — parser acessível antes da autenticação

`backend/src/app.ts:31` usa `express.json()` sem opções antes das rotas e do limitador de auth. A dependência instalada habilita `inflate` e limite de corpo de 102400 bytes. O caminho de sucesso de `backend/node_modules/body-parser/lib/read.js` deixa o stream de descompressão ligado após ler o corpo, compatível com a condição do aviso; erro posterior pode escapar do middleware Express. Autenticação, helmet e o tamanho do JSON não eliminam esse caminho. A exposição efetiva depende de acesso à API; o Compose publicado é loopback e produção ainda depende do provedor de mensagens.

O [advisory oficial](https://github.com/advisories/GHSA-27r3-jxmh-p828) indica correção em 2.4.0. Abrir PR separada para atualizar o lockfile pela faixa aceita pelo Express, verificar árvore e adicionar regressão isolada em processo filho. Desligar `inflate` seria alternativa com mudança de compatibilidade a avaliar, não aplicada aqui. Não executar a reprodução em API ou banco compartilhados.

## 2. Zod — arrays inválidos e acúmulo de erros

`backend/src/modulos/disponibilidade/disponibilidade.schemas.ts:12` usa array de grade sem máximo; `:19` usa array de IDs com mínimo, sem máximo. Rotas exigem admin para grade e recepção/dentista para bloqueios antes de validar. O parser limita o corpo a 100 KiB, portanto a presença da versão afetada não prova esgotamento da memória disponível. Falta determinar se payloads permitidos e concorrência autorizada atingem o limite real do processo. As rotas anônimas de autenticação não têm esse sink de coleções nos schemas analisados.

O [advisory oficial](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) aponta correção em 4.6.6. Recomenda-se atualização patch em PR de segurança própria, com testes dos detalhes de `ENTRADA_INVALIDA`, schemas e OpenAPI. Limites clínicos novos para grade/lotes exigem decisão de domínio; não inventar máximos para silenciar o audit.

## 3. Vite — condição Windows ausente dos caminhos publicados

Backend Vite 8.3.2 pertence ao Vitest de desenvolvimento. As configs não habilitam `api`; o Vitest instalado usa por padrão `api:false` e middleware mode. O `backend/Dockerfile` instala runtime com `--omit=dev`, em Linux, e executa apenas Express. O frontend usa Vite **8.2.4**, já corrigido para este aviso, e publica estáticos Nginx. Não há caminho configurado que exponha o `__open-in-editor` afetado do Vite backend em Windows.

O [advisory oficial](https://github.com/advisories/GHSA-587h-7wmj-h5pm) condiciona a falha a Windows e controle do argumento de arquivo no middleware de editor; 8.3.3 corrige a linha backend. Uma futura configuração que exponha esse servidor em Windows exige nova análise. A manutenção dev é recomendada separadamente, sem alegar execução de comandos explorável na API atual.

## Escopo da próxima PR de segurança

Atualizar body-parser pela cadeia Express e Zod em commits próprios, preservando o contrato e executando as suítes completas com PostgreSQL descartável. A atualização Vite dev pode ser outro commit ou PR delimitada, verificando Vitest e Stryker. Não foi realizado `npm audit fix`, override disruptivo, atualização major ou correção de segurança nas PRs de QA/BUG-001.

O resultado normalizado `triage-finding/v0` foi salvo também no armazenamento gerenciado do Codex Security; este documento é o resumo destinado à revisão no repositório.
