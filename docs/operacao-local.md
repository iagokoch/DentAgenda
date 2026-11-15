# Apresentação local — Windows / Docker Desktop

Uso exclusivo neste computador, com dados fictícios e janela do aplicativo compartilhada (D46).
Não iniciar Cloudflare. O pacote `deploy/demonstracao` continua reservado ao deploy futuro.
API e frontend no Windows em desenvolvimento; apenas PostgreSQL em Docker. A D16 permanece intacta.

## Comandos do operador

Na raiz `C:\Users\potat\orca\DentAgenda`, com Docker Desktop aberto:

```powershell
.\scripts\demo-local.ps1 Preparar
.\scripts\demo-local.ps1 Iniciar
.\scripts\demo-local.ps1 Estado
```

Abra **http://127.0.0.1:5173**. Mantenha esse endereço durante toda a apresentação.
Compartilhe somente a janela do aplicativo. Não compartilhe terminal, logs ou a consulta de credenciais.

```powershell
.\scripts\demo-local.ps1 Credenciais
```

As contas disponíveis são administração, recepção, dentista e paciente. As senhas são fictícias,
geradas para esta instalação, persistidas fora do Git e protegidas por DPAPI do usuário Windows.
Não há dependência de SMS/e-mail real. Mensagens/códigos simulados ficam nos logs privados do operador.

## Contingência

```powershell
.\scripts\demo-local.ps1 ReiniciarApi
.\scripts\demo-local.ps1 ReiniciarFront
.\scripts\demo-local.ps1 Estado
```

Se a máquina reiniciar, abra Docker Desktop e execute `Iniciar` novamente. A configuração e o volume
do banco são preservados. Não execute `docker compose down -v`, `docker volume rm` ou limpezas globais.
Uma porta ocupada por outro processo deve ser investigada; o script não deve encerrá-lo automaticamente.

`Preparar` guarda automaticamente uma cópia inicial (`baseline.dump`) com checksum,
sem sobrescrevê-la nas preparações seguintes. Para guardar também o estado atual:

```powershell
.\scripts\demo-local.ps1 Backup
```

Para voltar à cópia inicial sem recriar todo o ambiente:

```powershell
.\scripts\demo-local.ps1 Restaurar
.\scripts\demo-local.ps1 Iniciar
.\scripts\demo-local.ps1 Estado
```

A restauração deve criar outro banco dentro do container exclusivo e preservar o banco anterior.
Para escolher uma cópia adicional, use `Restaurar -ArquivoBackup <caminho mostrado por Backup>`.
As cópias são privadas e contêm somente dados fictícios. DPAPI é vinculado ao usuário Windows;
copiar apenas a configuração para outra conta/máquina não permite recuperar os segredos.

Para encerrar:

```powershell
.\scripts\demo-local.ps1 Parar
```

Isso encerra os processos próprios e para o container da demonstração, preservando o volume.

## Roteiro curto

1. Antes de compartilhar, consulte as credenciais e confirme `Estado`.
2. Entre como recepção: busque/abra um paciente, consulte agenda e horários livres.
3. Crie uma consulta futura, remarcá-la e depois cancelá-la; confira os estados.
4. Entre como dentista e paciente para mostrar a separação de acessos.
5. Mostre administração de funcionários com o perfil administrador.
6. Recarregue a página para confirmar restauração da sessão e use Sair.

Não altere o relógio do Windows para simular realização ou passagem de prazo. O seed usa datas relativas
à preparação inicial e não reescreve consultas existentes. Ensaios automáticos usam banco de testes separado.

## Limites

Esta é uma demonstração local de desenvolvimento, não um deploy de produção. Não comprova TLS, proxy,
acesso externo, reinício completo do host ou entrega de mensagens reais. AUD-02, Cloudflare, mensageria
remota e validação integral do deploy ficam no backlog.

Os 1.038 testes combinados e as 619 respostas HTTP 200 do checkpoint anterior são evidência histórica
de outro ensaio; nenhuma nova carga foi executada. Esta candidata passou em **1.039 testes**, lint,
tipos/builds, roteiro HTTP real, jornada da recepção no navegador, reinícios e restauração em banco novo.
Evidências e limites estão em `docs/estado-fase2.md`. `Estado` deve mostrar **SAUDAVEL**;
quando incompleto, a consulta informa o problema sem encerrar o terminal com erro.
