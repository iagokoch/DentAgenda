# Execução da auditoria técnica

Plano de origem: auditoria de `main` em `7153fab`, fornecida pelo usuário nesta conversa.
Este registro acompanha a implementação; não declara aprovação para produção.

| Item | Estado | Evidência ou dependência |
| --- | --- | --- |
| B01 | Implementado e verificado | Hash relido sob trava; reset e refresh coordenados; regressões com barreiras |
| B02 | Implementado e verificado | Guarda antes do subprocesso; testes isolados sem banco; guarda do TRUNCATE preservada |
| B03 | Implementado e verificado | Trava independente da seleção nas duas telas; regressões reproduziram dois envios e agora verificam um |
| B04 | Implementado | README orienta diagnosticar P1000 e preservar volumes |
| B05 | Implementado e verificado | Opção A aprovada; aviso no login, saída local imediata, marcador, coordenação entre abas e retry explícito |
| B06 | Implementado e verificado | Emissão/consumo coordenados; expiração revalidada; tentativas persistidas |
| B07 | Implementado e verificado | Atualização no início da consulta, ao recuperar foco e visibilidade |
| B08 | Implementado e verificado | Versão sequencial aprovada; migration, backfill, IDs estáveis e ordenação de novas escritas |
| B09 | Implementado e verificado | Respostas invertidas preservam status e observação; estado separado por consulta |
| B10 | Implementado e verificado | Header obrigatório de refresh e corpo opcional do cancelamento no OpenAPI |
| B11 | Proteção remota aplicada | Configuração autorizada em 2026-11-09; validação funcional por PR ainda pendente |
| B12 | Implementado e verificado localmente | Gate textual na CI e template de PR; falha/sucesso controlados verificados; CI remota não acionada |
| B13 | Artefatos e smoke local verificados | k6 com 2 dentistas/20 pacientes/200 consultas; carga completa e servidor final pendentes |
| B14 | Pacote e verificações locais prontos | Saúde, encerramento, imagens e proxy; mensageria impede iniciar produção |
| B15 | Scripts e ensaio local verificados | Restore com fluxos da API; cópia externa, alertas e RPO/RTO ainda não comprovados |

## Decisões de execução

- As alterações permanecem sem commit na branch local `fix/testes-validar-banco`. Como commits pertencem ao
  usuário, a separação nas branches por item do plano deve ocorrer durante a integração; não há commits artificiais
  para movimentar trabalho entre branches.
- PostgreSQL de verificação exclusivo, sem volumes persistentes, publicado somente em `127.0.0.1:15433`.
  Nenhum banco ou arquivo de credenciais preexistente foi usado pelo agente.
- B14 preserva `NODE_ENV=production` e a rejeição da mensageria por log. O pacote pode ser construído, mas não
  será declarado operável antes de resolver a issue de mensageria. Usar modo de desenvolvimento para contornar
  a proteção foi descartado.
- As metas de carga e recuperação são hipóteses do plano, não resultados. O teste de longa duração e a prova
  em hardware final devem ser registrados com data, ambiente e resultados reais.

## Validação

Após aprovação de A + versão sequencial em 2026-11-09: 642 testes PostgreSQL em ordem embaralhada, 32 testes isolados
e 208 testes de frontend passaram, totalizando 882. Aviso de logout e duas abas foram verificados no Edge headless,
com API fictícia e cookie HttpOnly, em 390/768/1280px. A migration foi aplicada somente ao banco descartável.
Lint, typecheck, conferência dos 33 códigos e builds passaram. As execuções anteriores reproduziram as regressões
antes das correções e confirmaram os testes selecionados depois delas. A revisão final não apontou defeito
importante remanescente no escopo implementado.

Evidências, limites e ensaios operacionais estão em [validacao-auditoria.md](validacao-auditoria.md).

Pendências externas: provedor/orçamento de mensagens; servidor e rede; TLS/VPN; armazenamento externo de backup;
políticas da clínica e revisão humana. A proteção remota de `main` foi aplicada com autorização específica.
Não houve commit, push, publicação de PR, merge ou deploy pelo agente.
