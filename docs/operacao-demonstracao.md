# Operação da demonstração — B14 e B15

Pacote local para revisão. **A implantação completa está bloqueada pela mensageria:** o backend aceita apenas
o enviador por log e o recusa em produção. O Compose preserva essa proteção; não use `development` ou `test`
para contorná-la. Nenhum serviço foi publicado ou declarado pronto para dados reais.

## Empacotamento e instalação

Dockerfiles usam build em estágios, runtime sem usuário root e sem arquivos de ambiente. `.dockerignore`
exclui segredos locais e resultados. Build usa os lockfiles; fixe os digests das imagens base e identifique a
revisão da imagem antes de instalar em ambiente compartilhado.

```powershell
docker compose -f deploy/demonstracao/compose.yaml config --no-interpolate --quiet
docker compose -f deploy/demonstracao/compose.yaml build
```

O banco não publica porta; a API só é acessível pela rede do proxy; a única borda é `127.0.0.1:8080`.
Há volume exclusivo para PostgreSQL e logs limitados a 3 arquivos de 10 MB por serviço. Recursos de CPU,
memória e disco ainda precisam ser dimensionados para o hardware final. Não copie o Compose de desenvolvimento.

Variáveis exigidas por ambiente, sem valores no repositório:

| Nome | Finalidade |
| --- | --- |
| `BANCO_ADMIN_SENHA` | Inicialização da conta administrativa PostgreSQL; não usar na API |
| `DATABASE_URL` | Usuário restrito da aplicação, host `banco`, banco `dentagenda` |
| `DATABASE_URL_MIGRATIONS` | Conta de migrations com permissão de DDL, separada do runtime |
| `JWT_SEGREDO`, `CODIGO_HMAC_SEGREDO` | Segredos distintos geridos por ambiente |
| `ENVIADOR_MENSAGEM` | Provedor aprovado para produção; suporte ainda não implementado |

Provisionar os usuários e permissões de aplicação/migrations é um passo administrativo separado. A imagem do
banco só inicializa o administrador; o pacote não concede superusuário à API nem embute senhas para criar contas.
O responsável deve validar permissões mínimas, codificação de credencial na URL e rotação antes de operar.
Não renderize `docker compose config` com segredos interpolados em logs ou capturas.

Depois de resolver mensageria e credenciais, a sequência de instalação é banco → migrations pelo perfil
`migrations` → API → frontend. Uma migration falha interrompe a instalação; não iniciar a aplicação sobre schema
incompleto. Atualização exige backup validado antes da migration e smoke de saúde e negócio após subir a imagem.
Voltar a imagem não desfaz schema: migration incompatível precisa de plano próprio de recuperação.
Ao recriar a API, reinicie também o proxy: o exemplo resolve o nome do upstream na inicialização.

O proxy entrega frontend e `/api` na mesma origem. A borda de instalação ainda exige HTTPS e acesso privado/VPN;
os cookies são Secure em produção. Configure explicitamente a cadeia de proxy e o endereço de origem do cliente
ao adicionar TLS ou VPN. O exemplo HTTP em loopback não constitui publicação externa nem configuração TLS pronta.

## Saúde e encerramento

`/api/saude/viva` não consulta banco. `/api/saude/pronta` limita espera a um segundo e responde 503 se o banco
falhar ou o processo estiver encerrando. Readiness não substitui teste de login, autorização ou agendamento.
SIGTERM/SIGINT retiram readiness, param novas conexões, drenam as existentes e desconectam Prisma. O prazo total
é dez segundos; o Compose concede quinze. Sinais repetidos compartilham o mesmo encerramento.

Conferir no ambiente final: reinício, falha/retorno de banco, requisição em andamento durante parada, isolamento
efetivo de portas e comportamento de cookies sob HTTPS. Uma indisponibilidade deve gerar alerta externo ao host.
CPU, memória, disco, latência, erros, conexões, locks e idade do último backup precisam de coleta e alertas definidos.

## Backup e restauração

Os scripts Bash exigem clientes PostgreSQL 17 e parâmetros `PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE` e autenticação
por ambiente. Não passam senha por argumento. Execute em ambiente com conexão autorizada e armazenamento protegido:

```bash
bash scripts/operacao/backup.sh /caminho/exclusivo/backups
bash scripts/operacao/restaurar-ensaio.sh /caminho/do/banco.dump ensaio_restore_test
```

O backup cria diretório exclusivo com permissões restritas, usa `pg_dump` custom, confere o catálogo e só então
promove o arquivo `.incompleto`. Grava checksum e manifesto com duração. Falhas preservam artefatos incompletos;
não os tratem como backups válidos. Checksum detecta alteração do arquivo; não substitui criptografia/autenticidade.

A restauração confere checksum, exige nome terminado em `_restore_test` e cria banco novo. Banco existente é recusado.
Não há limpeza, exclusão nem sobrescrita automáticas. Falha preserva o destino para diagnóstico; a restauração de
dados ocorre em transação única. O resumo expõe só contagens de pacientes, consultas e histórico.

Após restaurar, compare contagens, constraints e índices; execute login, consulta, histórico e operação de agenda
na API apontada exclusivamente à cópia. Registre início/fim, tamanho, origem, destino, integridade e resultado do
smoke. Dump criado e catálogo legível não comprovam restauração, nem o acesso da aplicação com usuário restrito.

Proposta de demonstração: backup diário, 7 diários e 4 semanais, cópia externa criptografada e ensaio mensal ou antes
de mudança relevante. Os scripts não apagam cópias: retenção e destino externo exigem política aprovada. Metas
iniciais de RPO 24 h/RTO 4 h precisam ser demonstradas com recuperação da cópia externa, não inferidas do script.
Uma falha de backup, idade excessiva da cópia ou erro no ensaio precisa notificar um responsável; integração de
alertas e agendamento dependem do ambiente e ainda não estão instalados.

## Critérios pendentes

Hardware/rede e CGNAT; provedor de mensagens; usuários restritos; TLS/VPN; digests e imagens identificáveis;
monitoramento externo; cópia externa criptografada; restauração cronometrada e smoke; aprovação clínica para dados
reais. Queda de energia, disco e internet do Home Server também exigem procedimento de continuidade.
