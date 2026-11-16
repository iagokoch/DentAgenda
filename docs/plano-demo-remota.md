# Quick Tunnel restrito — plano para aprovação

Diagnóstico de 15/11/2026; **implementação aprovada posteriormente pelo usuário e concluída com validação local**. Abertura externa permanece pendente de e-mail exato e autorização específica: **NO-GO remoto até ensaio HTTPS/Access**.
A demonstração local continua como contingência saudável. Operação atual: [operacao-remota.md](operacao-remota.md). O desenho abaixo registra a proposta que originou D47; as evidências confirmadas estão em [estado-fase2.md](estado-fase2.md).

## Estado confirmado

- Worktree única: `C:/Users/potat/orca/DentAgenda`; branch `demo/local-apresentacao`, HEAD `6cd7b8115a5a3374f05a5a0e771b4ac51e75a98f`.
- Antes deste documento: nenhuma alteração rastreada ou staged; `.codex/` e `AGENTS.md` não rastreados preservados.
- PR #50 OPEN, base `fix/deploy-reinicio-servicos`; checks front/backend SUCCESS consultados no GitHub. PRs #41–49 permanecem abertas, sem merge nesta sessão.
- Os 1.039 testes e fluxos locais são evidência anterior registrada em `estado-fase2.md`; nenhuma suíte/carga foi repetida no diagnóstico.
- D46 autoriza operação local; D16 continua recusando production + log. Remoto precisa de decisão específica antes do código.

## Bloqueios

1. Nginx atual substitui IP externo por `$remote_addr` e protocolo por `$scheme`.
2. Cookies locais não usam Secure; publicar o processo development não resolve o requisito.
3. Só existe enviador log, recusado em production; contas pré-preparadas evitam precisar de códigos, mas não desabilitam as rotas que os emitem.
4. cloudflared não localizado no PATH da sessão; versão de imagem/executável e suporte efetivo a allowed-mail dependem da inspeção do ambiente.
5. Acesso restrito, dois clientes, spoofing, HTTPS e fluxos completos ainda não foram ensaiados pela cadeia remota.

## Solução recomendada

Reaproveitar Dockerfiles e padrão Compose existentes em pacote separado de demonstração remota:

```text
Participante HTTPS → Cloudflare/PIN e-mail → cloudflared
  → Nginx (frontend compilado + /api) → API → PostgreSQL exclusivo
```

Conector com rede de saída; conector/proxy numa rede privada exclusiva; proxy/API em outra rede; API/banco em rede de dados interna. Não publicar portas de proxy, API ou banco. Não presumir que rede internal permite ao conector alcançar a Cloudflare: sua rede de saída deve ser explícita. Isolamento não protege contra administrador do host/Docker, parte da fronteira de confiança.

Proxy aceita identidade somente pelo caminho exclusivo do conector; valida CF-Connecting-IP único IPv4/IPv6, normaliza XFF/XFP/XFH, remove headers alternativos e recusa metadados inválidos. Não concatenar XFF fornecido pelo visitante nem confiar em CIDR Docker amplo. API confia apenas no último proxy da topologia isolada. HTTPS deve ser validado e cookies devem ter Secure, HttpOnly e SameSite preservados.

Cloudflared deve suportar `--allowed-mail`, falhando sem lista explícita de e-mails exatos. Nunca retentar sem restrição. Conferir versão/help e versão oficial corrigida antes da aquisição. Downloads de imagens/binários e instalações somente após aprovação. Não fazer login Cloudflare/MCP ou alterar domínio/conta automaticamente.

Banco remoto próprio, com dados fictícios e quatro contas preparadas; preservar container, volume, configuração DPAPI e bancos locais. Reutilizar os procedimentos de preparação/backup por adaptação explícita, sem imprimir credenciais. API usa conta de banco com permissões mínimas e migrations usam credencial separada. Nenhuma limpeza de volume ou restauração sobre banco existente.

## Mensageria — aprovação específica necessária

Propor opção explícita de demonstração com NODE_ENV=production e enviador indisponível para demo, habilitado somente por guardas de demo e banco fictício exclusivo. Production + log permanece rejeitado; produção normal não seleciona esse modo automaticamente.

O enviador não transmite nem registra destino/texto/código e sinaliza indisponibilidade, sem fingir entrega. As seis rotas de cadastro/recuperação devem ser bloqueadas no perfil demo com erro explícito documentado e testado. Login/refresh/logout e fluxos de consultas usam contas pré-ativadas. Notificações posteriores ao commit não desfazem consultas, como já previsto; logs só registram evento operacional sanitizado.

Registrar decisão em documentacao.md antes de implementar. Não criar provedor real ou devolver códigos HTTP. PIN Cloudflare e login DentAgenda são autenticações independentes.

## Branch e escopo propostos

Após aprovação, criar `demo/quick-tunnel-restrito` a partir de `6cd7b81` (#50). Preferir mesma worktree sequencial para reaproveitar dependências instaladas, sem alterar a branch original nem os arquivos privados. Worktree separada somente se necessária; uma cópia não recebe automaticamente dependências/configuração DPAPI. PR futura teria base `demo/local-apresentacao`; não abrir, publicar, fazer commit ou merge sem autorização.

Comando manual de preparação, após conferir status:

```powershell
git switch -c demo/quick-tunnel-restrito 6cd7b81
```

Arquivos previstos: config/server/mensageria/rotas e testes focados backend; pacote deploy remoto; integração de ações remotas ao script PowerShell sem alterar ações locais; documentação de decisão, operação e estado. Backup individual com checksum antes de cada alteração em arquivo existente.

## Validação aprovada junto do escopo de implementação

- TDD backend para guardas de produção/demo, emissor indisponível, rotas bloqueadas e normalização/spoofing de headers; limite por cliente/IPv4/IPv6.
- Lint, tipos e builds pertinentes; suites de regressão afetadas, integração em banco de teste exclusivo, nunca no banco de apresentação.
- Parser PowerShell, Compose sem interpolação de segredos, revisão de diff e checks de saúde/readiness.
- Ensaio local da cadeia compilada, isolamento de portas, quatro perfis, cookies, backup, parada e retomada; não iniciar túnel nesta etapa.
- Após autorização específica de exposição: rejeição sem autenticação Cloudflare, e-mail não autorizado e PIN autorizado em navegador; validar duração da sessão, não só login inicial.
- Pelo domínio HTTPS: assets/rotas internas, /api mesma origem, login dos quatro perfis, reload/refresh/logout, permissões, pacientes, disponibilidade, agendamento/conflito, remarcação, cancelamento, erros, Secure/HttpOnly/SameSite e ausência de CORS/mixed content.
- Dois clientes de IPs distintos e headers falsificados não devem alterar identidade nem compartilhar limite indevidamente. Não executar carga Cloudflare.
- Celular com Wi-Fi desligado: jornada real, registrando somente resultado/dispositivo/rede/horário. Se dispositivo não estiver disponível, manter pendência explícita.
- Parar túnel revoga URL; preservar banco e contingência local. Reiniciar cria outra URL, exigindo nova verificação e distribuição.

## Operação prevista, ainda sem comandos remotos implementados

Integrar preparar/iniciar/estado/parar remoto ao script local, com estado separado e túnel opcional. O início do stack não deve iniciar túnel automaticamente. PID/container e URL devem ser registrados sem cookies/tokens/códigos. Encerramento não usa down -v ou remoção de bancos. Readiness não substitui jornada funcional.

Comandos locais já existentes:

```powershell
.\scripts\demo-local.ps1 Estado
.\scripts\demo-local.ps1 Iniciar
```

Antes da apresentação: Docker/energia/internet, backup validado, saúde, lista exata de participantes, túnel restrito, PIN e sessão durável, login/reload e fluxo de consulta externo, contingência local disponível. Não declarar GO remoto antes das evidências.

## Especialistas deste diagnóstico

- DevOps e SRE: `devops_sre`, inventário cloudflared/Docker/processos e operação.
- Segurança: `security`, confirmou bloqueios IP/HTTPS/cookies/D16; CSRF de refresh já existe e deve ser preservado.
- Arquitetura e QA: `architecture_qa`, contas pré-ativadas, indisponibilidade explícita da mensageria e matriz de jornadas HTTPS.
- Tech Lead: Git/PRs, memória, fontes oficiais e consolidação. Papéis agrupados por limite de três subagentes simultâneos.

## Fontes e riscos conhecidos

- [Quick Tunnels oficial](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/): allowed-mail, PIN, URL temporária, navegador interativo e ausência de garantia de disponibilidade.
- [Changelog oficial workers-utils](https://github.com/cloudflare/workers-sdk/blob/main/packages/workers-utils/CHANGELOG.md): proteção por e-mail requer cloudflared 2026.9.2 ou posterior.
- [Release oficial atual consultada](https://github.com/cloudflare/cloudflared/releases/tag/2026.11.0): verificar artefato/plataforma/integridade antes de instalar; não foi adquirido no diagnóstico.
- [Relato aberto #1752](https://github.com/cloudflare/cloudflared/issues/1752): expiração rápida de sessão por e-mail relatada por usuário; risco a ensaiar, não falha confirmada neste ambiente.
- [Express e proxies](https://expressjs.com/en/guide/behind-proxies/), [headers Cloudflare](https://developers.cloudflare.com/fundamentals/reference/http-headers/): confiança depende da topologia e reescrita correta.

Se houver bloqueio crítico, manter NO-GO remoto e apresentação local com janela compartilhada. Não criar túnel irrestrito como alternativa.
