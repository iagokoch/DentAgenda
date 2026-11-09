# Evidências da implementação — 2026-11-09

Base: `7153fab`. Alterações locais sem commit na branch `fix/testes-validar-banco`.
Este relatório cobre o trabalho implementado; não declara o roadmap completo nem prontidão para produção.

## Checks de código

| Comando | Resultado |
| --- | --- |
| Frontend: `npm run lint`, `npm test`, `npm run build` | Passaram; 208 testes em 21 arquivos |
| Backend: `npm run lint`, `npm run typecheck`, `npm run build` | Passaram |
| Backend: `npm run conferir:codigos` | Passou; 33 códigos com presença textual |
| Backend: `npm run test:embaralhado` | Passou; 32 testes isolados e 642 de integração em 45 arquivos |
| `git diff --check`, sintaxe Bash e JavaScript k6 | Passaram |

Seed da execução embaralhada após aprovação: `1794242147268`. Total: 882 testes. Integração usou PostgreSQL 17 descartável, sem volumes,
publicado exclusivamente em `127.0.0.1:15433`; nenhum banco preexistente foi usado. As configurações reais de
ambiente não foram lidas. Segredos dos ensaios foram gerados em memória e não integram relatórios.

Os avisos preexistentes de `pg` sobre consultas concorrentes no mesmo client e de canvas não implementado no
jsdom continuam aparecendo. Não causaram falhas e não foram tratados como correções incluídas nesta entrega.

## Regressões e revisão

B02: oito cenários inicialmente permitiam iniciar o subprocesso com URL não autorizada; falharam antes da correção
e passaram depois. A guarda existente antes do TRUNCATE foi mantida.

B01: login de paciente e funcionário foi pausado após verificar bcrypt; reset concluiu e o login antigo criava
sessão nos dois casos. As regressões falharam antes da correção e passaram depois. Reset/refresh também foram
exercitados nas duas ordens com barreiras controladas.

B06: expiração durante o consumo foi reproduzida antes da correção; emissão/consumo foram verificados nas duas
ordens, preservando uso único e tentativas. B10 foi verificado contra o JSON OpenAPI gerado. B12 teve falha
controlada com código ausente e sucesso após sua presença textual, em fixture temporária fora do repositório.

A revisão somente leitura encontrou um horário fixo inadequado no cenário k6 de disputa. O gerador agora fornece
horário posterior ao dataset; o caso de 1 dentista/50 mil consultas foi revalidado em memória. Não restou achado
importante nas alterações revisadas. Isso não substitui a aprovação de outra pessoa no PR.

## Aprovação A + versão sequencial — B03/B05/B07/B08/B09

O usuário aprovou a opção A e a versão sequencial. B03 reproduziu dois envios ao trocar o horário durante a
requisição; agora as duas telas mantêm uma trava independente da seleção. B07 foi verificado atravessando o início
sem remontagem e recuperando foco. B09 teve observação e cancelamento/realização nas duas ordens de resposta,
preservando ambos os resultados. Timestamps iguais deixaram de causar colisão de chave no histórico.

B08 teve testes de escrita concorrente com barreiras, relógio recuando, rollback de texto/contador/histórico e
observação inicial. O SQL real da migration foi aplicado a uma estrutura legada em schema isolado, revertido ao
fim do ensaio: numeração com empates, contador zero sem histórico e preservação do texto atual foram confirmados.

B05 teve regressões de rede/500, recarga, storage indisponível ou somente leitura, refresh e `/eu` atrasados,
pedido antigo após nova entrada, coordenação entre abas e cadastro durante logout. A revisão encontrou e corrigiu
duas ordens adicionais de login em outra aba enquanto o refresh anterior estava atrasado. A saída agora reserva
sua posição imediatamente, identifica o cookie dentro da trava e aceita somente 204 como confirmação. Não declara
revogação confirmada a partir de refresh 401 nem quando falta coordenação entre abas.

No Edge headless com perfil novo e API fictícia, foram verificados aviso de falha, retry, recargas sem restauração
automática e ausência de overflow em 390, 768 e 1280px. Em duas abas reais, Web Locks nativo serializou um refresh
com resposta atrasada e a saída: o cookie HttpOnly sucessor foi revogado e removido, sem reinstalar access token.
Esse ensaio usa servidor simulado; integração com PostgreSQL e backfill foram verificados separadamente.

As capturas e o script de navegador estão em `C:/Users/iago/AppData/Local/Temp/dentagenda-browser/`; a instalação
temporária de Playwright não alterou manifests ou lockfiles do projeto. A API e o frontend foram reconstruídos
em imagens locais após as correções. Não foram publicados ou implantados.

## Carga local

Validação SQL com 2 dentistas, 20 pacientes, 200 consultas e 100 versões iniciais de observação. A segunda
semeadura no mesmo banco foi recusada, preservando as contagens. O gerador exige destino exclusivo e vazio.

| Ensaio k6 | Resultado local |
| --- | --- |
| Smoke: 1 VU/20 s | 39 iterações; 40 checks incluindo login; zero erros inesperados; thresholds passaram |
| Leituras do smoke | p95 36,24 ms |
| Escritas do smoke | p95 37,53 ms |
| Autenticação do smoke | Uma única amostra de 280,77 ms; insuficiente para conclusão sob carga |
| Disputa em fixture nova | Uma reserva 201 e um conflito 409; zero erros inesperados; thresholds passaram |

Detalhes locais ficam em `performance/resultados/`, ignorado pelo Git. Esses ensaios confirmam a instrumentação,
não a capacidade do Home Server. Não foram executados o dataset SQL padrão de 5 mil pacientes/50 mil consultas,
normal/pico, stress, resistência de duas horas, observação de saturação ou coleta de CPU/memória/pool/locks.

## Imagens e operação

Compose foi validado com `config --no-interpolate --quiet`, sem expor valores de ambiente. As imagens da API e
frontend foram construídas localmente. API usa usuário `node`; frontend usa `nginx`. O frontend respondeu 200
em `/saude` e `/agenda` com filesystem somente leitura, `/tmp` temporário e capabilities removidas.

A imagem da API carregou seus módulos e recusou corretamente produção com enviador por log. O stack de produção
completo não foi iniciado. Testes isolados verificaram liveness, readiness, falha e timeout do banco, consulta
pendente compartilhada, retirada de readiness, drenagem, prazo e sinais repetidos.

O dump custom de uma fixture após o smoke foi restaurado em banco novo com 20 pacientes, 200 consultas e 107
versões de histórico. Banco existente e nome fora do escopo foram recusados; checksum alterado foi recusado antes
de criar destino. Um segundo ensaio restaurou uma fixture limpa com 100 versões e passou login real, leitura da
consulta, histórico, novo agendamento e cancelamento pela API apontada à cópia.

Os ensaios de restore levaram menos de dois segundos no relógio com resolução de um segundo. Volume pequeno,
origem local e mesmo host: não comprovam RTO/RPO de operação nem recuperação a partir de cópia externa.

## O que continua pendente

Os cinco itens aprovados estão implementados. B11 teve a proteção remota aplicada com autorização específica
em 2026-11-09: checks `front`/`backend` do GitHub Actions, branch atualizada, uma aprovação com invalidação após
novos commits, resolução de conversas e aplicação aos administradores; force-push e exclusão desabilitados.
Nova leitura confirmou as regras e `protected: true`; o commit de `main` permaneceu `7153fab`.
A validação funcional dessas exigências por PR continua pendente. B13–B15 precisam dos critérios e
ensaios no ambiente final, mensageria, usuários restritos, TLS/VPN, cópia externa e alertas. Não houve publicação
de issue/PR, commit, push, merge ou deploy pelo agente.
