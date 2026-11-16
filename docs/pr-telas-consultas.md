## Summary

Tela **Consultas** da clínica (visões Dia por dentista e Lista, com ações) e estado vazio do paciente, aprovados em mockups (D48). Só front-end: a API, o `docs/api.md` e as permissões não mudam.

```text
Recepção / admin → /consultas (todos os dentistas)
Dentista         → /consultas ("Minhas consultas", só a própria agenda, pela API)
Paciente         → /minha-conta (sem consulta: "Nenhuma consulta" + Agendar consulta)
```

Dependência: base `demo/quick-tunnel-restrito` (PR #51, que depende da #50). Sem merge automático.

## Evidence

- **Before:** só "Consultas de hoje" no Início e o histórico por paciente; paciente sem consulta via só uma linha de texto.
  **After:** `/consultas` com Dia e Lista; paciente vazio com botão para agendar.
- **Testes:** front 317/317 (12 de tela e 6 de funções novos, axe nas visões Dia e Lista); lint sem alertas; `vite build` ok. Teste do paciente vazio escrito antes do código.
- **Carga (k6, local, dados fictícios, 50 mil consultas):** smoke, conflito (exatamente 1 reserva e 1 conflito 409), tela de consultas (5.044 req., 0 erros, p95 ≤ 69 ms) e pico de 20 usuários por 10 min (21.274 req., 0 erros, leitura p95 403 ms). Detalhes e limites em `docs/performance-resultados-2026-11-15.md`; não é capacidade do servidor final nem do túnel.
- Documentação: D47 (modo público) e D48 em `docs/documentacao.md`, README, CLAUDE.md, roteiros, `docs/operacao-remota.md`, guia completo, `docs/estado-fase2.md` e matriz de papéis (rota `/consultas`).

## Merge Danger

**Door:** two-way

Mudança só de interface e documentação; reverter a branch devolve o front anterior sem tocar em dados. Para a demonstração, `RemotoCompilar` constrói da pasta atual: compile na branch certa.

**Blast Radius:** demonstração e área da clínica

Limitações: sem visão Semana; busca por nome do paciente sobre até 100 consultas carregadas; administrador que também é dentista só vê a própria agenda (D10); carga só local. Menu da clínica ganha o item Consultas.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
