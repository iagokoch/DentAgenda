# Operação da demonstração remota restrita (D47)

Pacote de apresentação com dados fictícios. **Sem autorização de exposição e e-mail exato do operador, não iniciar túnel.** O stack privado não comprova HTTPS/Access. GO remoto depende do roteiro externo ao fim deste documento.

## Preparar uma vez

PowerShell na raiz, Docker Desktop aberto, mesmo usuário Windows que gerou a configuração DPAPI. Não usar administrador. Downloads oficiais da demonstração foram autorizados; os Dockerfiles e o Compose fixam bases por digest. Não reutilizar `.env` real. Instalação cria banco/volume próprios; não tocar em `dentagenda-demo-local-dados`.

```powershell
.\scripts\demo-local.ps1 RemotoPreparar
.\scripts\demo-local.ps1 RemotoCompilar
.\scripts\demo-local.ps1 RemotoInicializarBanco
.\scripts\demo-local.ps1 RemotoIniciar
.\scripts\demo-local.ps1 RemotoVerificar
.\scripts\demo-local.ps1 RemotoBackup
```

`RemotoInicializarBanco` é uma operação administrativa explícita: banco → quatro migrations → quatro contas fictícias pré-ativadas. Não executar durante a apresentação. Retomadas comuns usam somente `RemotoIniciar`, sem migrations/seed. Uma falha preserva os dados; não apagar volume para tentar novamente. Configuração ausente com recursos existentes exige recuperação da configuração, não geração de novas senhas sobre o banco antigo.

Dados/configuração privados: `.codex/demo-remota/config.xml` protegido com DPAPI CurrentUser e ignorado pelo Git. As quatro senhas são novas, distintas das locais e não aparecem nos comandos. Banco: `dentagenda_demo_remota`; papéis separados `app_demo` (runtime sem DDL) e `migrations_demo`. Nenhuma porta remota é publicada no host. Rede do conector usa subnet exclusiva `172.30.247.0/29`: colisão deve interromper operação. Não alterar somente o IP do conector: Compose, proxy e fixtures precisam acompanhar.

Frontend compilado no Nginx, `/api` mesma origem, API produção com enviador explicitamente indisponível. Cadastro/recuperação respondem 503 neste perfil. Nenhum SMS/e-mail real é enviado pela aplicação. PIN Cloudflare é serviço separado, enviado ao e-mail autorizado do participante.

## Conferir e retomar

```powershell
.\scripts\demo-local.ps1 RemotoEstado
.\scripts\demo-local.ps1 RemotoIniciar
.\scripts\demo-local.ps1 RemotoVerificar
```

Estado exibe saúde dos containers; exigir banco/API/frontend `healthy`. `RemotoVerificar` executa um cliente Docker temporário na posição exclusiva do conector, com headers sintéticos. Testa assets, quatro perfis, permissões, disponibilidade, criação/conflito/remarcação/cancelamento e sessões. Escreve apenas reservas fictícias do próprio ensaio e tenta cancelá-las, encerrando suas sessões. Não roda com túnel ativo: ambos disputam o IP confiável e devem ser exclusivos.

Esse verificador confirma a cadeia HTTP interna e os atributos de cookie; não comprova aceitação de cookies pelo navegador sob TLS, Access, rede externa ou dois clientes físicos. Se falhar, investigar a etapa indicada sem imprimir configuração/logs completos ou credenciais. Não expor endpoint temporário de diagnóstico.

## Credenciais dos quatro perfis

Em terminal privado, fora de gravação, transcrição e compartilhamento:

```powershell
.\scripts\demo-remota.ps1 Credenciais
```

A ação exige confirmação interativa antes de exibir os quatro logins fictícios. Distribuir somente aos participantes autorizados pelo canal acordado. Nunca colocar senhas/PIN em documentação, Git, conversa pública ou HAR. Login do paciente usa CPF; funcionários usam e-mail.

## Modo público temporário (decisão de 15/11/2026)

O modo restrito por e-mail falhou em ensaio: após e-mail e PIN o navegador mostrou `Forbidden`. A origem foi o cloudflared (`HTTP request authorization failed before origin selection … token issued in the…`, asserção do Access rejeitada); o Nginx não registrou nenhuma requisição 4xx. Compatível com a issue #1752. O usuário autorizou, só para a demonstração com dados fictícios, um Quick Tunnel **sem `--allowed-mail`**: qualquer pessoa com a URL vê o login, e todo o resto exige o login do DentAgenda (matriz de papéis, CSRF, cookies seguros, limite por IP e D16 preservados; cadastro e recuperação em 503; PostgreSQL e API sem porta publicada).

```powershell
# Em um PowerShell PRÓPRIO e mantido aberto (não pela sessão do Claude Code: o túnel recebe SIGTERM quando ela termina)
.\scripts\demo-local.ps1 RemotoIniciarTunel -Publico -ConfirmarExposicao
.\scripts\demo-local.ps1 RemotoUrl            # consulta a URL do último túnel (log privado)
.\scripts\demo-local.ps1 RemotoEstado         # saúde
.\scripts\demo-local.ps1 RemotoPararTunel     # encerra imediatamente
```

`-Publico` exige `-ConfirmarExposicao` e não aceita e-mail; nunca é acionado como fallback de erro. O modo restrito continua disponível.

Validação externa (a ser registrada com evidências sanitizadas): login direto sem PIN; JS/CSS; anônimo em `/api/pacientes` e `/api/consultas` → 401; `/api/docs` indisponível; quatro perfis; sessão após recarregar; marcar, remarcar, cancelar; ausência de CORS/mixed content; ≥ 5 min. **Até esses resultados existirem, o estado é NO-GO; só as validações locais (12 grupos de `RemotoVerificar`) estão comprovadas.**

## Abrir o túnel restrito por e-mail — somente após autorização específica

O usuário ainda fornecerá um e-mail exato de operador. Não usar endereço fictício, wildcard, domínio inteiro ou lista nesta versão. O script exige confirmação explícita, frontend saudável e suporte efetivo a `--allowed-mail`. A imagem oficial cloudflared foi verificada em execução sem rede; não depende de instalação no PATH do Windows.

Após autorização, em PowerShell privado, inserir o endereço real:

```powershell
$emailOperadorDemo = Read-Host 'E-mail exato autorizado'
.\scripts\demo-local.ps1 RemotoIniciarTunel -EmailAutorizado $emailOperadorDemo -ConfirmarExposicao
```

O processo fica em primeiro plano e imprime a URL temporária HTTPS. O participante abre a URL, informa o e-mail permitido e digita o PIN recebido. Depois entra com a conta fictícia DentAgenda. PIN não substitui o login do sistema.

Logs do conector ficam no diretório privado, em nível info; nunca habilitar debug, exportar headers completos ou anexar logs brutos a PRs. Atualização automática e diagnósticos de gerenciamento são desabilitados nessa operação. Não há fallback sem restrição.

## Encerrar e recuperar

Ctrl+C no terminal do túnel; ou, em outro PowerShell:

```powershell
.\scripts\demo-local.ps1 RemotoPararTunel
```

Para parar também o stack remoto, preservando banco e volume:

```powershell
.\scripts\demo-local.ps1 RemotoParar
```

Não executar `down -v`, limpar volumes ou apagar configuração. Se a internet cair, interromper o conector, conferir stack/rede e iniciar outro túnel somente dentro da autorização vigente. Uma nova execução cria outra URL; a anterior deixa de funcionar. Redistribuir o endereço novo e repetir PIN, login, assets, reload e operação real antes de anunciar recuperação. Não há garantia de disponibilidade do Quick Tunnel.

Backup privado:

```powershell
.\scripts\demo-local.ps1 RemotoBackup
```

Dump é criado com nome próprio, catálogo validado e checksum SHA256. Preservar o original. Isso não comprova restauração; ensaio de restauração deve usar destino novo separado. DPAPI exige o mesmo usuário Windows, não é solução de recuperação em outro computador. Não remover o banco original durante recuperação.

## Contingência local

```powershell
.\scripts\demo-local.ps1 Estado
.\scripts\demo-local.ps1 Iniciar
```

URL: `http://127.0.0.1:5173`. Contas e banco locais são separados dos remotos. Se o remoto não cumprir os critérios, apresentar localmente e compartilhar somente a janela da aplicação. Não enfraquecer a D16 ou remover allowed-mail para contornar uma falha.

## Ensaio HTTPS/Access e checklist de 16/11

- Docker Desktop, energia/internet e contingência local disponíveis; backup privado validado.
- Banco/API/frontend saudáveis; e-mail exato autorizado e permissão específica de exposição confirmados.
- Sem autenticação Cloudflare, frontend e API não acessíveis; e-mail não permitido não entra.
- Após PIN: JS/CSS carregam, navegar por rotas internas, GET e POST chegam corretamente.
- Permanência: testar imediatamente, após 1 minuto e após pelo menos 5 minutos; manter navegação e executar login/consulta POST após a espera. Não se limitar a carregar HTML ou receber PIN.
- Login dos quatro perfis, sessão após reload, refresh e logout/revogação; atributos Secure/HttpOnly/SameSite no navegador.
- Pacientes, disponibilidade, agendamento, conflito tratado, remarcação/cancelamento e permissões; sem mixed content ou erros CORS.
- Dispositivo externo, preferencialmente celular com Wi-Fi desligado; dois IPs reais distintos devem continuar distinguíveis na cadeia. Registrar somente metadados/resultados sanitizados, nunca tokens/cookies/PIN.
- Encerrar o túnel revoga a URL; nova URL exige revalidação. Não rodar carga na Cloudflare.

[Issue #1752](https://github.com/cloudflare/cloudflared/issues/1752): há relatos de perda prematura da sessão, inclusive Windows/2026.11.0 em 15/11. Não é reprodução neste projeto nem existe correção confirmada nesta entrega. Se houver redirects para login nos assets/GET ou 401 sem JSON nos POST após PIN, parar o ensaio e identificar a camada antes de alterar aplicação/CSP. Preservar restrição. Alternativa: proposta separada de túnel nomeado + Cloudflare Access, dependente de conta/domínio e autorização; ou apresentação local.

Referências: [Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/), [advisories Nginx](https://nginx.org/en/security_advisories.html), [PostgreSQL suportado](https://www.postgresql.org/support/versioning/).

## Git — somente execução manual após autorização

Rascunho de descrição: `docs/pr-quick-tunnel.md`. Revisar o diff, os arquivos novos e as evidências antes de preparar commit; não incluir `.codex/` ou `AGENTS.md` locais.

```powershell
git status --short --branch
git diff --check
git diff --stat
git add .gitattributes .gitignore backend/src/config/env.ts backend/src/compartilhado/mensageria.ts backend/src/server.ts backend/src/modulos/auth/auth.rotas.ts backend/scripts/preparar-demo-remota.ts backend/testes/demo-remota.test.ts backend/testes/proxy-auth-demo.test.ts deploy/remoto scripts/demo-local.ps1 scripts/demo-remota.ps1 scripts/verificar-demo-remota.mjs scripts/verificar-proxy-demo.mjs docs/documentacao.md docs/api.md docs/estado-fase2.md docs/plano-demo-remota.md docs/operacao-remota.md docs/pr-quick-tunnel.md
git diff --cached --check
git diff --cached --stat
git commit -m "feat: preparar demonstracao remota restrita por Quick Tunnel"
git push -u origin demo/quick-tunnel-restrito
gh pr create --base demo/local-apresentacao --head demo/quick-tunnel-restrito --title "Preparar demonstracao remota restrita por Quick Tunnel" --body-file docs/pr-quick-tunnel.md
```

Os comandos de commit/push/PR não foram executados nesta entrega. Não fazer merge automático. A PR tem alteração independente para revisão sobre #50; depende dessa base até integração aprovada.
