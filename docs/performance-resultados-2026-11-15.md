# Resultados dos testes de carga — 15/11/2026

Execução local, com dados fictícios, para conferir a tela nova de consultas (D48) e o baseline de `docs/performance-baseline.md`. **Não representa a capacidade do servidor final nem do túnel**: tudo rodou na mesma máquina, sem rede real entre cliente e API. Não foi feita carga pelo Cloudflare Quick Tunnel nem contra o banco da demonstração.

## Ambiente

| Item | Valor |
|---|---|
| Código | branch `feat/telas-consultas`, base `cd8a2db` (+ as mudanças desta PR) |
| API | `tsx src/server.ts`, Node 24.22.1, `NODE_ENV=development`, porta 3100, rate limit de `/api/auth` **mantido** |
| Banco | PostgreSQL 17.12 em container descartável (`--cpus 2`, `--memory 1g`), banco `dentagenda_performance_test`, migrations aplicadas com `prisma migrate deploy` |
| Dataset | `backend/scripts/performance/semear.ts`: 5 dentistas, 5.000 pacientes, 50.000 consultas de 30 min (segunda a sexta, 9h–17h a partir de 2030-01-07), 100 versões de observação |
| Ferramenta | k6 v2.4.0 (imagem oficial `grafana/k6`, digest `sha256:3d8e5c7f1d53ec59408c2ffbd9943602a0985ffcbd4a2430ec00f3ffca89796e`), em container, chegando à API por `host.docker.internal` |
| Máquina | Windows 11, Docker Desktop (12 CPUs, 7,6 GB), cliente, API e banco juntos |

O banco, o container e a API de carga eram só deste ensaio e foram removidos ao final. Os resultados brutos ficam em `performance/resultados/` (ignorado pelo Git).

## Cenários e resultados

Metas do baseline: leituras p50 ≤ 200 ms, p95 ≤ 500 ms, p99 ≤ 1 s; escritas e autenticação p95 ≤ 1 s; erros inesperados < 1%.

| Cenário | Carga | Requisições | Erros inesperados | Latência | Resultado |
|---|---|---|---|---|---|
| `smoke` (baseline.js) | 1 usuário virtual, 20 s | 40 | 0% | leitura p50 12 ms, p95 26 ms, p99 33 ms; escrita p95 24 ms | aprovado |
| `conflito` (baseline.js) | 2 reservas simultâneas do mesmo horário | 3 | 0% | escrita p95 226 ms | **aprovado: exatamente 1 reserva e 1 conflito 409** |
| `consultas-tela.js` | 10 usuários virtuais, 3 min | 5.044 (≈ 28/s) | 0% | Dia (≤ 100 consultas) p95 53 ms, p99 80 ms; Lista de 30 dias p95 69 ms, p99 93 ms; `/api/dentistas` p95 36 ms | aprovado |
| `pico` (baseline.js) | 20 usuários virtuais, 10 min | 21.274 (≈ 35/s) | 0% | leitura p50 11 ms, p95 403 ms, p99 658 ms; escrita p95 364 ms; auth 246 ms | aprovado |

`consultas-tela.js` simula as duas consultas da tela nova: `GET /api/consultas` de um dia e de 30 dias (`porPagina=100`) e `GET /api/dentistas`, com login de recepção.

No `pico`, o banco usou ≈ 112 MiB de memória ao final, e todos os thresholds do k6 passaram.

## Limitações e leitura honesta

- **Autenticação sob carga:** o baseline renova o login a cada 10 minutos; cada cenário gerou **uma** amostra de login. Ela só sustenta que o login respondeu bem (246 ms); não diz nada sobre muitos logins simultâneos, que o rate limit de `/api/auth` (200 pedidos por IP a cada 15 min, D32) limita de propósito.
- **Local não é o servidor final nem a internet:** na apresentação o tráfego passa pelo túnel da Cloudflare e pela conexão de casa; a latência real será maior. Para 5 a 10 pessoas navegando, o ensaio local indica folga grande no backend e no banco; o gargalo provável é a rede.
- **Sem amostras de CPU e memória da API** durante a janela, apenas o banco ao final; cenários `normal` (15 min), `spike`, `stress` (80 usuários) e `resistencia` (2 h) **não foram executados**.
- **A lista de 30 dias traz no máximo 100 consultas** (`porPagina=100`) e a busca por nome do paciente é feita na tela sobre essas 100; períodos com mais consultas precisam de paginação (fora desta entrega).
- O cenário de conflito garante a regra de um agendamento por horário, e os testes com PostgreSQL continuam sendo a fonte da regra; percentis do k6 não substituem essas provas.

## Como repetir

Ambiente isolado, banco terminando em `_performance_test`, dados fictícios (detalhes em `docs/performance-baseline.md`):

```powershell
# banco descartável e migrations (senha gerada na hora; não gravar no Git)
docker run -d --name dentagenda-carga-pg -e POSTGRES_PASSWORD=<senha> -e POSTGRES_DB=dentagenda_performance_test -p 127.0.0.1:5440:5432 --memory 1g --cpus 2 postgres:17.12
# em backend/, com DATABASE_URL, DATABASE_URL_PERFORMANCE, PERFORMANCE_SENHA, JWT_SEGREDO, CODIGO_HMAC_SEGREDO,
# NODE_ENV=development, PORTA=3100 e ENVIADOR_MENSAGEM=log definidos no ambiente:
npx prisma migrate deploy
node --import tsx scripts/performance/semear.ts
npx tsx src/server.ts
# na raiz:
docker run --rm -e BASE_URL=http://host.docker.internal:3100 -e PERFORMANCE_SENHA -e CENARIO=smoke -v "${PWD}/performance:/perf" -w /perf grafana/k6 run baseline.js
docker run --rm -e BASE_URL=http://host.docker.internal:3100 -e PERFORMANCE_SENHA -v "${PWD}/performance:/perf" -w /perf grafana/k6 run consultas-tela.js
```

Ao terminar: `docker rm -f -v dentagenda-carga-pg`.
