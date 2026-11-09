# Proteção de main — B11

Configuração aplicada em `iagokoch/DentAgenda`, após autorização do responsável, em 2026-11-09.
A configuração foi relida pela API: `main` protegida e regras conferidas; a validação funcional com PR continua pendente.

| Regra | Valor aplicado |
| --- | --- |
| Integração | Pull request obrigatório para `main` |
| Aprovação | Pelo menos uma aprovação de outra pessoa; invalidar após novos commits |
| Checks | `front` e `backend` obrigatórios, vinculados ao GitHub Actions (`app_id: 15368`), com branch atualizada antes do merge |
| Histórico | Impedir force-push e exclusão da branch |
| Discussões | Exigir resolução das conversas do PR |
| Administradores | Sujeitos às mesmas exigências |
| Exceções | Sem bypass de rotina; qualquer exceção deve registrar responsável, motivo e evidência |

Os nomes dos checks e sua origem foram conferidos na CI de `7153fab`. A configuração usa proteção de branch;
não havia rulesets adicionais antes da aplicação. Não foram exigidos CODEOWNERS, histórico linear ou aprovação
específica do último push. A aprovação exigida é de uma pessoa diferente do autor e é invalidada por novos commits.

O PR de verificação deve demonstrar que um check reprovado e a falta de aprovação impedem a integração,
que novos commits invalidam aprovações e que uma base desatualizada precisa ser atualizada.
Não usar force-push, exclusão de `main` ou alteração de regra como teste destrutivo. Conflitos de interesse na
aprovação não são resolvidos por aprovação do próprio autor.

## Rastreabilidade — B12

A CI executa `conferir:codigos`, que compara presença **textual** dos códigos de erro do contrato com arquivos de
teste. O gate não executa os cenários e não comprova cobertura comportamental. Os testes de integração continuam
necessários. O template de PR registra problema, comportamento resultante, vínculo, validação e limitações.

Issues existentes devem ser reconciliadas por critério de aceitação. Um commit relacionado não comprova que todos
os critérios foram entregues e não autoriza fechar uma issue. A publicação de issues, labels, milestones ou PRs
permanece uma ação separada da preparação local.
