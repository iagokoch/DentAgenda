## Summary

Preparar uma demonstração remota temporária com frontend compilado, dados fictícios e dois modos de acesso (restrito por e-mail ou público temporário, ambos explícitos), preservando a apresentação local.

```text
Cloudflare (PIN só no modo restrito) → cloudflared → Nginx (frontend + /api) → API → PostgreSQL exclusivo
```

Perfil explícito de demonstração desabilita cadastro/recuperação, não envia mensagens e mantém a rejeição de production + log. Proxy valida o peer/IP/protocolo e normaliza headers; serviços não publicam portas. Operação PowerShell separa inicialização administrativa, retomada e exposição externa.

Dependência: base `demo/local-apresentacao` (#50), HEAD original `6cd7b81`. Entrega em `demo/quick-tunnel-restrito`; nenhuma PR anterior é substituída ou integrada automaticamente. D47 e contrato do erro 503 documentados.

## Evidence

- **Before:** produção bloqueada por mensageria log; proxy perdia IP/HTTPS e cookies locais não tinham Secure. Novos testes inicialmente tiveram oito falhas esperadas.
  **After:** 81 testes isolados aprovados (28 novos); lint raiz/backend, tipos e build backend aprovados; frontend compilado no Docker.
- **Before:** cadeia de proxy ainda não ensaiada.
  **After:** fixture Docker aprovou IPv4/IPv6/mapped, normalização de headers e rejeição de peer/IP/protocolo/duplicações inválidos.
- **After:** 12 grupos de fluxos reais pelo Nginx privado, com quatro perfis, cookies, refresh/logout, permissões, pacientes, disponibilidade e criação/conflito/remarcação/cancelamento. Backup validado, parada/retomada sem migrations e novamente 12 grupos aprovados. Contingência local SAUDAVEL.
- **After:** bases oficiais fixadas por digest (Node 24.22.3, Nginx 1.30.6, PostgreSQL 17.12, cloudflared 2026.11.0); --allowed-mail confirmado sem rede; PowerShell 5.1 testado com stderr sintético e fixture de parada sem túnel.

- **Ensaio restrito:** após e-mail e PIN o navegador mostrou `Forbidden`; o log do cloudflared registrou `authorization failed before origin selection` e o Nginx não recebeu requisição (compatível com a issue #1752). Foi adicionado `-Publico` (exige `-ConfirmarExposicao`, sem e-mail, nunca fallback) e a ação `RemotoUrl`. O túnel público abriu, mas a validação externa (login, 4 perfis, sessão, 5 min) foi feita manualmente pelo autor e **não está registrada neste PR**.

Comandos e limites completos: `docs/estado-fase2.md` e `docs/operacao-remota.md`. Não foram repetidas auditoria completa nem carga.

## Merge Danger

**Door:** two-way

Mudanças de aplicação/configuração e pacote separado; sem migration nova. Parar a demonstração preserva volume/banco. Reversão de código não recupera segredos DPAPI perdidos; preservar backup e configuração privada.

**Blast Radius:** demonstração

Runtime de produção normal mantém guardas; modo demo exige confirmação adicional e banco exclusivo. O modo público remove a autenticação Cloudflare: qualquer pessoa com a URL vê o login (dados fictícios; todo o resto exige o login do DentAgenda). Não há evidência externa neste PR; tratar como não validado até o autor registrar os resultados. Quick Tunnel é temporário e roda em PowerShell próprio. Issue cloudflared #1752 é o risco do modo restrito. Dispositivo externo/dois IPs reais e restauração do backup remoto pendentes. A decisão D47 e `docs/estado-fase2.md` ainda descrevem principalmente o modo restrito.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
