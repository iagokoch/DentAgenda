# Baseline de performance — B13

Artefatos preparados; nenhuma meta abaixo é um resultado medido no servidor final.

## Ambiente e dados

Use somente ambiente isolado autorizado com dados fictícios. `DATABASE_URL_PERFORMANCE` deve terminar em
`_performance_test`, sem query ou fragmento. O gerador recusa `NODE_ENV=production`, confere o nome real do banco,
exige banco vazio e grava em transação. Não cria bancos, aplica migrations, limpa tabelas nem remove dados.
Migrations devem ser aplicadas separadamente ao destino validado, antes da semeadura.

O padrão é 5 dentistas, 5 mil pacientes e 50 mil consultas de 30 minutos, distribuídas de segunda a sexta,
09h–17h em São Paulo, a partir de 2030-01-07. Inclui recepção fictícia e 100 versões de observação na primeira
consulta. UUIDs variam por execução; a distribuição e os identificadores textuais são reproduzíveis.
Quantidades menores podem ser definidas em `PERFORMANCE_DENTISTAS`, `PERFORMANCE_PACIENTES` e
`PERFORMANCE_CONSULTAS`. Pacientes devem ser pelo menos tantos quanto dentistas.

Injete `PERFORMANCE_SENHA` por ambiente, com ao menos 12 caracteres. Ela é usada apenas para gerar o hash das
contas fictícias e não integra o arquivo de referências. Execute em `backend/`:

```powershell
node --import tsx scripts/performance/semear.ts
```

O arquivo `performance/resultados/dataset.json` contém somente IDs e contagens. A pasta está no `.gitignore`.
Uma falha ao escrever esse arquivo depois do commit não desfaz a semeadura: preserve o banco e recupere as
referências por consulta autorizada; não repita o gerador nem apague o banco automaticamente.

## Execução k6

Prepare `BASE_URL` para o ambiente fictício, `PERFORMANCE_SENHA` e, opcionalmente,
`PERFORMANCE_REFERENCIAS` para o caminho do JSON. A API precisa usar esse mesmo banco. Na raiz:

```powershell
k6 run --summary-export performance/resultados/smoke.json performance/baseline.js
```

`CENARIO` seleciona `smoke` (1 VU/20 s), `normal` (5/15 min), `pico` (20/10 min), `spike` (5→40),
`stress` (5→80) ou `resistencia` (10/2 h). Rode um por vez. O smoke valida a instrumentação; cenários longos
e stress exigem janela de execução, observação de recursos e limites do ambiente definidos pelo responsável.

O mix é busca parcial de pacientes, consultas diárias, horários livres, histórico e escrita de observação.
A sessão é renovada por login a cada dez minutos, preservando a expiração real e o limite de autenticação.
Não desabilite o rate limit para obter números melhores. Registre também o número de amostras de login;
amostra pequena não sustenta conclusão sobre autenticação sob carga.

`conflito` disputa o mesmo horário com duas iterações: exige exatamente uma reserva e um conflito 409.
O gerador exporta `inicioDisputa` no próximo dia útil após a última consulta, evitando conflitos com o próprio dataset.
Use banco recém-semeado ou `CONFLITO_INICIO` para um horário futuro livre na grade. Repetir o cenário no mesmo
horário reprova corretamente porque a reserva anterior permanece. Os testes PostgreSQL determinísticos continuam
responsáveis por reset/login, remarcação/cancelamento e autorização; percentis de k6 não comprovam essas regras.

## Metas hipotéticas e relatório

Leituras: p50 ≤200 ms, p95 ≤500 ms, p99 ≤1 s. Escritas/autenticação: p95 ≤1 s. Erros inesperados <1%.
409 previsto tem contador próprio no cenário de disputa. Threshold reprovado faz o k6 retornar erro.
Referência inicial de capacidade: 10 requisições/s no mix definido, a comprovar; o script não força essa taxa.

Para cada execução, registre commit/diff, versões, CPU/RAM/disco, limites de containers, dataset, cenário,
início/fim, amostras, RPS, percentis e erros por operação. Capture CPU, memória, disco, conexões, espera por pool,
locks e latência de banco durante a mesma janela. CPU >70% sustentada, memória/conexões >80% e crescimento contínuo
de memória após aquecimento são sinais iniciais para investigar, não limites universais.

Nunca declare capacidade do Home Server a partir de um smoke local. Critérios de integridade são absolutos:
sem reservas conflitantes, vazamento entre usuários ou perda de operação confirmada.
