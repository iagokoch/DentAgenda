# Roteiro da apresentação — 16/11/2026

Guia rápido para apresentar o DentAgenda no computador da faculdade (**só navegador, nada para instalar**), com o sistema rodando no computador de casa. Detalhes técnicos: `docs/operacao-remota.md`. **Nenhuma senha neste documento.**

Arquitetura: computador de casa → Docker Desktop (banco, API, Nginx) → Cloudflare Quick Tunnel → navegador da faculdade.

**Modo público:** quem tem a URL vê a tela de login, **sem e-mail nem PIN da Cloudflare**. Todas as funcionalidades exigem login do DentAgenda (dados e contas fictícios).

## 0. Hoje à noite: subir a versão com as telas novas (Consultas)

`RemotoCompilar` constrói as imagens a partir dos arquivos que estão na pasta **agora**: faça-o na branch que contém as telas novas (`feat/telas-consultas`, ou a `main` depois do merge). Não mexe no banco nem nos volumes.

```powershell
cd C:\Users\potat\orca\DentAgenda
git status --short                              # confira que está na branch certa e sem alterações soltas
git switch feat/telas-consultas
.\scripts\demo-local.ps1 RemotoPararTunel       # se houver túnel aberto (RemotoVerificar não roda com túnel ativo)
.\scripts\demo-local.ps1 RemotoCompilar         # reconstrói API e frontend (alguns minutos)
.\scripts\demo-local.ps1 RemotoIniciar          # recria os containers com a imagem nova; sem migrations nem seed
.\scripts\demo-local.ps1 RemotoEstado           # banco, API e frontend "healthy"
.\scripts\demo-local.ps1 RemotoVerificar        # 12 grupos pela cadeia compilada
```

Se algo falhar: `git switch demo/quick-tunnel-restrito`, depois `RemotoCompilar` e `RemotoIniciar` de novo (versão anterior, já ensaiada). Não rode `RemotoInicializarBanco`.

As telas novas só se conferem pelo navegador, com o túnel aberto (seção 3): menu **Consultas**, visões Dia e Lista, e um paciente sem consultas mostrando "Nenhuma consulta".

## 1. Em casa, antes de sair (PowerShell na raiz do projeto, Docker Desktop aberto)

```powershell
.\scripts\demo-local.ps1 RemotoIniciar     # sobe banco, API e frontend (sem túnel)
.\scripts\demo-local.ps1 RemotoEstado      # os 3 containers devem estar "healthy"
.\scripts\demo-local.ps1 RemotoVerificar   # roteiro automático (NÃO rodar com o túnel aberto)
.\scripts\demo-local.ps1 RemotoBackup      # backup privado
```

Nunca rodar `RemotoInicializarBanco` nem apagar volumes.

## 2. Abrir o túnel público (PowerShell INDEPENDENTE)

Abra **você mesmo** uma janela do PowerShell (não pelo Claude Code, senão o túnel morre quando a sessão do Claude terminar) e deixe-a aberta:

```powershell
cd C:\Users\potat\orca\DentAgenda
.\scripts\demo-local.ps1 RemotoIniciarTunel -Publico -ConfirmarExposicao
```

- Aparece `ATENCAO: tunel PUBLICO…` e uma caixa com `https://….trycloudflare.com`. Essa é a URL.
- Consultar a URL depois, em outra janela: `.\scripts\demo-local.ps1 RemotoUrl`
- Cada execução gera URL nova; a anterior morre.
- Modo restrito por e-mail (alternativa; teve falha de sessão, cloudflared issue #1752): `-EmailAutorizado seu@email -ConfirmarExposicao` sem `-Publico`.

## 3. Conferir antes de sair

- Abra a URL no celular com Wi-Fi desligado (4G/5G): deve aparecer **direto o login do DentAgenda**.
- Entre com um perfil, recarregue (a sessão deve continuar) e faça uma escrita (marcar e cancelar consulta).
- Repita depois de 5 minutos.
- Saúde: `.\scripts\demo-local.ps1 RemotoEstado`.
- Windows: desative a suspensão **manualmente** (Configurações → Sistema → Energia e bateria → Tela e suspensão → "Nunca" ligado na tomada). O projeto não altera configurações globais.
- Mantenha o notebook/PC na tomada, com internet estável. Não feche a janela do túnel.

## 4. Na faculdade (só navegador)

1. Abra a URL HTTPS (janela anônima ajuda a evitar cookies antigos).
2. Entre no DentAgenda. Credenciais: **em casa**, em terminal privado, `.\scripts\demo-remota.ps1 Credenciais` (pede confirmação; não grave a tela). Leve as senhas anotadas só para uso privado, nunca em Git ou chat.
3. Paciente entra com **CPF**; funcionários com **e-mail**.
4. O administrador é uma das quatro contas fictícias pré-ativadas.

## 5. Sequência sugerida (≈10 min)

1. **Administração:** equipe, procedimentos, disponibilidade e **Consultas** (se a conta de administração for de recepção, vê todos os dentistas).
2. **Recepção:** menu **Consultas** (visão Dia por dentista e Lista com filtros; remarcar, cancelar e marcar realizada), busca de pacientes, perfil (dados, alertas, histórico), novo agendamento, conflito de horário, remarcação, cancelamento.
3. **Dentista:** **Minhas consultas** (só a agenda dele, Dia e Lista), detalhes, realizar consulta, observação com histórico, bloqueios próprios.
4. **Paciente:** `/minha-conta` (paciente sem consulta vê "Nenhuma consulta" e o botão para agendar), marcar, cancelar (justificativa obrigatória a menos de 24 h).
5. Mostre que cadastro e recuperação ficam indisponíveis neste perfil (sem SMS/e-mail real, D16).

Alternar perfis: **Sair** (no celular fica no topo) e entrar com outra conta.

## 6. Se o link deixar de funcionar

Sem acesso ao computador de casa:
1. Recarregue; confira se a rede da faculdade não bloqueia `trycloudflare.com` (teste pelo celular em 4G).
2. Se alguém estiver em casa: feche a janela do túnel (Ctrl+C), rode o comando da seção 2 de novo, e envie a nova URL.
3. Sem isso, apresente com capturas de tela ou vídeo gravado antes.

Com acesso ao computador de casa:
1. Ctrl+C no túnel (ou `RemotoPararTunel`), `RemotoEstado`, repita a seção 2 e redistribua a URL.
2. Plano B local no computador de casa: `.\scripts\demo-local.ps1 Iniciar` → `http://127.0.0.1:5173` (contas e banco separados).

Quick Tunnel não tem garantia de disponibilidade.

## 7. Encerrar

```powershell
.\scripts\demo-local.ps1 RemotoPararTunel   # ou Ctrl+C na janela do túnel
.\scripts\demo-local.ps1 RemotoParar        # para o stack, preservando banco e volume
```

Depois da apresentação, troque ou invalide as senhas fictícias.

## Checklist de pré-apresentação

- [ ] Docker Desktop aberto; banco/API/frontend `healthy`
- [ ] `RemotoVerificar` aprovado e `RemotoBackup` feito (antes de abrir o túnel)
- [ ] Credenciais anotadas em local privado
- [ ] Túnel aberto num PowerShell próprio, janela mantida aberta
- [ ] URL copiada e testada pelo celular em 4G/5G (login, recarga, escrita, após 5 min)
- [ ] Suspensão do Windows desativada manualmente; tomada e internet estáveis
- [ ] Plano B local testado (`Iniciar`) e capturas de tela salvas
- [ ] Nada para instalar na faculdade: só o navegador
