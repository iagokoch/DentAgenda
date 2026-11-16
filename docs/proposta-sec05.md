# SEC-05 — Planejamento da correção do parser

**Estado:** aguardando aprovação individual e confirmação da branch.
**Prioridade:** P1. **Responsável:** Security Engineer, com revisão do Tech Lead.
Nenhuma atualização, teste novo de regressão ou correção desta proposta foi
implementado. Este documento acompanha o [relatório da Fase 1](auditoria-tecnica-fase1.md).

## Problema e evidências

O [app](../backend/src/app.ts) monta `express.json()` com opções padrão antes da
autenticação e do limite de requisições de auth. O lockfile e a instalação
restaurada da auditoria confirmaram:

```text
Express 5.2.1
  body-parser: ^2.2.1
    resolução instalada: 2.3.0
```

O [advisory GHSA-27r3-jxmh-p828](https://github.com/expressjs/body-parser/security/advisories/GHSA-27r3-jxmh-p828)
abrange versões 2.x anteriores a 2.4.0 e descreve encerramento do processo ao
processar determinados corpos comprimidos. Versão afetada e caminho foram
confirmados estaticamente. Dois pedidos preliminares em subprocessos descartáveis
retornaram 400/200 sem queda: **a exploração não foi reproduzida localmente**.

A suíte verde não elimina o advisory. O caso preliminar também não permite alegar
uma regressão determinística pronta para demonstrar falha antes e sucesso depois.

## Solução proposta

Atualizar a resolução transitiva para 2.4.0 ou outra versão corrigida explicitamente
aprovada, mantendo Express 5.2.1 se os testes confirmarem compatibilidade. A faixa
`^2.2.1` admite 2.4.0; não há necessidade demonstrada de adicionar body-parser como
dependência direta.

Revisar o diff completo do lockfile e suas transitivas. Alterar
`backend/package.json` somente se for aprovada uma fixação/override explícito.
Não mudar a ordem de parsing, autenticação ou autorização sem justificativa própria.
Não misturar Zod, tooling Prisma/Vite ou mudanças não relacionadas nesta entrega.
Uma atualização necessária de qs pode acompanhar a própria cadeia corrigida.

`inflate: false` é uma alternativa descrita no advisory para aplicações sem corpos
comprimidos, mas muda a aceitação de entradas e exige decisão própria. Não foi
adotada nem aprovada nesta auditoria.

## Compatibilidade e riscos

A compatibilidade semver não substitui a validação. O
[changelog 2.4.0](https://github.com/expressjs/body-parser/blob/v2.4.0/HISTORY.md)
inclui suporte a `zstd`, correção de mutação de opções e mudanças em `content-type`,
`iconv-lite` e `qs`.

O parser afeta requisições JSON públicas e autenticadas antes dos controllers.
Uma mudança de descompressão, charset, limites ou classificação de erro pode
alterar respostas. A autenticação deve continuar sendo aplicada na mesma ordem;
não há alteração planejada de papéis, sessão ou regra de negócio.

Não há migration. O rollback consiste em reverter a entrega e reconstruir a imagem
compatível; isso restabelece a versão anterior afetada e não é solução permanente.

## Arquivos potencialmente afetados

- [backend/package-lock.json](../backend/package-lock.json).
- `backend/testes/corpo-comprimido.test.ts`, novo teste isolado, se esse for o seam validado.
- `backend/testes/fixtures/servidor-corpo-comprimido.ts`, fixture de subprocesso, se necessária.
- [backend/package.json](../backend/package.json), apenas mediante decisão explícita de fixação.

Os dois arquivos de teste acima são propostas e ainda não existem. A seleção final
deve respeitar a [configuração dos testes isolados](../backend/vitest.seguranca.config.ts).

## Testes e critérios de aceitação

1. Preparar reprodução controlada com o app real em processo exclusivo, bind em
   loopback e contexto sem banco real. Validar o cenário do mantenedor ou minimizar
   um caso que falhe na versão afetada antes de alegar uma prova de antes/depois.
2. Verificar que uma requisição comprimida inválida recebe tratamento controlado,
   que o processo permanece vivo e que liveness responde depois.
3. Preservar JSON normal/inválido, limite de corpo, charset/encoding não suportado,
   gzip válido e novos encodings quando aplicáveis ao contrato aprovado.
4. Executar lint, typecheck, testes isolados, integração em PostgreSQL exclusivo,
   build e auditoria npm completa/produção após a alteração.
5. Confirmar resolução corrigida, transitivas esperadas e ausência de alterações
   não relacionadas. Registrar limitações se o crash não for reproduzido.

O baseline da auditoria atual teve 1.009 testes aprovados, builds, lint e typecheck
aprovados. **São resultados anteriores à correção**, não validação da candidata.
Não houve instalação ou teste de body-parser 2.4.0 nesta fase.

## CONTROLE DE GIT E PULL REQUEST

| Item | Planejamento |
| --- | --- |
| ID | SEC-05 |
| Título recomendado | `fix: atualizar parser de corpos comprimidos` |
| Branch | `fix/body-parser-corpos-comprimidos` |
| Origem / destino | `main` após reconferência / `main` |
| Independência | Revisável sem mensageria, proxy ou migrations |
| Dependências | Aprovação, branch confirmada e ambiente de teste exclusivo |
| Worktree | Dispensável na execução sequencial; necessária se houver paralelismo autorizado |
| Ordem | Primeira entrega de código recomendada; demais PRs de dependências usam o lock resultante |
| Estado | Aguardando aprovação; não implementada; PR de correção não aberta |

Comandos futuros de preparação, não executados:

```powershell
git branch --show-current
git status
git worktree list
git switch -c fix/body-parser-corpos-comprimidos main
```

A revisão auditada foi `443f0a8`; não presumir que continuará sendo o HEAD da
próxima sessão. Preservar alterações locais e criar/validar backup individual dos
arquivos existentes antes de editá-los. Os comandos de atualização e publicação
serão definidos depois da aprovação do escopo; nenhum está autorizado agora.

## Checklist da futura entrega

- [ ] Escopo aprovado e branch correta confirmados.
- [ ] Backup individual validado antes de editar arquivos existentes.
- [ ] Resolução e transitivas revisadas, sem mudanças não relacionadas.
- [ ] Regressões de parsing e sobrevivência executadas.
- [ ] Suítes, build, typecheck, lint e audit posteriores registrados.
- [ ] Limitações e riscos residuais documentados.
- [ ] Diff revisado pelo Tech Lead.
- [ ] Descrição e comandos manuais da PR preparados.
- [ ] PR pronta para revisão humana.

Não existe autorização para commit, push, abertura ou merge automáticos. Esta
proposta não muda o estado **NO-GO para exposição externa**.
