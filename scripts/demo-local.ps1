[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Preparar', 'Iniciar', 'Estado', 'Parar', 'ReiniciarApi', 'ReiniciarFront', 'Backup', 'Restaurar', 'Credenciais')]
  [string]$Acao,
  [string]$ArquivoBackup
)

$ErrorActionPreference = 'Stop'
$repoDemo = Split-Path $PSScriptRoot -Parent
$privadoDemo = Join-Path $repoDemo '.codex/demo-local'
$configDemo = Join-Path $privadoDemo 'config.xml'
$composeDemo = Join-Path $repoDemo 'deploy/local/compose.yaml'
$composeEnvDemo = Join-Path $repoDemo 'deploy/local/compose.env.example'
$containerDemo = 'dentagenda-demo-local-postgres'
$nodeDemo = (Get-Command node -ErrorAction Stop).Source
$backendDemo = Join-Path $repoDemo 'backend'
$tsxDemo = Join-Path $backendDemo 'node_modules/tsx/dist/cli.mjs'
$viteDemo = Join-Path $repoDemo 'node_modules/vite/bin/vite.js'
$envDemo = @{}

function Nova-SenhaDemo {
  $bytesDemo = New-Object byte[] 24
  $rngDemo = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rngDemo.GetBytes($bytesDemo) } finally { $rngDemo.Dispose() }
  return ([BitConverter]::ToString($bytesDemo)).Replace('-', '').ToLowerInvariant()
}

function Salvar-ConfigDemo($valoresDemo) {
  $protegidosDemo = @{}
  foreach ($chaveDemo in $valoresDemo.Keys) {
    $protegidosDemo[$chaveDemo] = ConvertTo-SecureString $valoresDemo[$chaveDemo] -AsPlainText -Force
  }
  # Export-Clixml protege SecureString com DPAPI CurrentUser no Windows.
  $protegidosDemo | Export-Clixml -LiteralPath $configDemo
}

function Carregar-ConfigDemo {
  if (-not (Test-Path -LiteralPath $configDemo)) { throw 'Execute Preparar primeiro.' }
  $protegidosDemo = Import-Clixml -LiteralPath $configDemo
  foreach ($chaveDemo in $protegidosDemo.Keys) {
    if ($protegidosDemo[$chaveDemo] -isnot [Security.SecureString]) { throw 'Configuracao privada invalida.' }
    $credencialDemo = New-Object Management.Automation.PSCredential('demo', $protegidosDemo[$chaveDemo])
    $envDemo[$chaveDemo] = $credencialDemo.GetNetworkCredential().Password
  }
  if ($envDemo.NODE_ENV -ne 'development' -or $envDemo.ENVIADOR_MENSAGEM -ne 'log' -or
      $envDemo.DATABASE_URL -notmatch '^postgresql://[^@]+@127\.0\.0\.1:5434/dentagenda_demo_(local|restore_[0-9]+)$') {
    throw 'Configuracao fora do ambiente exclusivo da demo.'
  }
}

function Com-AmbienteDemo([scriptblock]$ComandoDemo) {
  $anterioresDemo = @{}
  try {
    foreach ($chaveLimpaDemo in @('NODE_OPTIONS', 'NODE_PATH', 'NODE_EXTRA_CA_CERTS', 'DATABASE_URL_TESTE', 'COMPOSE_FILE', 'COMPOSE_PROFILES', 'COMPOSE_PROJECT_NAME', 'COMPOSE_ENV_FILES')) {
      $anterioresDemo[$chaveLimpaDemo] = [Environment]::GetEnvironmentVariable($chaveLimpaDemo, 'Process')
      [Environment]::SetEnvironmentVariable($chaveLimpaDemo, $null, 'Process')
    }
    foreach ($chaveDemo in $envDemo.Keys) {
      $anterioresDemo[$chaveDemo] = [Environment]::GetEnvironmentVariable($chaveDemo, 'Process')
      [Environment]::SetEnvironmentVariable($chaveDemo, $envDemo[$chaveDemo], 'Process')
    }
    & $ComandoDemo
  } finally {
    foreach ($chaveDemo in $anterioresDemo.Keys) {
      [Environment]::SetEnvironmentVariable($chaveDemo, $anterioresDemo[$chaveDemo], 'Process')
    }
  }
}

function Executar-NodeDemo([string[]]$ArgumentosDemo) {
  Push-Location $backendDemo
  try {
    Com-AmbienteDemo {
      & $nodeDemo @ArgumentosDemo
      if ($LASTEXITCODE -ne 0) { throw 'Comando Node da demonstracao falhou.' }
    }
  } finally { Pop-Location }
}

function Executar-ComposeDemo([string[]]$ArgumentosDemo) {
  Com-AmbienteDemo {
    & docker compose --env-file $composeEnvDemo --project-directory $repoDemo -f $composeDemo @ArgumentosDemo
    if ($LASTEXITCODE -ne 0) { throw 'Comando Compose da demonstracao falhou.' }
  }
}

function Conferir-ContainerDemo([switch]$Obrigatorio) {
  $nomesDemo = & docker container ls -a --filter "name=^/$containerDemo`$" --format '{{.Names}}'
  if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop indisponivel.' }
  if ($nomesDemo -contains $containerDemo) {
    $labelsDemo = & docker inspect --format '{{json .Config.Labels}}' $containerDemo | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0 -or $labelsDemo.'dentagenda.ambiente' -ne 'demo-local') { throw 'Container existente nao pertence a esta demo.' }
    $imagemDemo = & docker inspect --format '{{.Config.Image}}' $containerDemo
    $portasDemo = & docker inspect --format '{{json .HostConfig.PortBindings}}' $containerDemo | ConvertFrom-Json
    $mountsDemo = @((& docker inspect --format '{{json .Mounts}}' $containerDemo | ConvertFrom-Json))
    $pgPortasDemo = @($portasDemo.'5432/tcp')
    if ($imagemDemo -ne 'postgres:17' -or @($portasDemo.PSObject.Properties).Count -ne 1 -or
        $pgPortasDemo.Count -ne 1 -or $pgPortasDemo[0].HostIp -ne '127.0.0.1' -or $pgPortasDemo[0].HostPort -ne '5434' -or
        $mountsDemo.Count -ne 1 -or $mountsDemo[0].Type -ne 'volume' -or
        $mountsDemo[0].Name -ne 'dentagenda-demo-local-dados' -or $mountsDemo[0].Destination -ne '/var/lib/postgresql/data') {
      throw 'Imagem, portas ou volume do container divergem da demo; operacao recusada.'
    }
    return $true
  }
  if ($Obrigatorio) { throw 'Container da demo nao existe.' }
  return $false
}

function Conferir-VolumeDemo {
  $volumesDemo = & docker volume ls --filter name=^dentagenda-demo-local-dados$ --format '{{.Name}}'
  if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel conferir volumes.' }
  if ($volumesDemo -contains 'dentagenda-demo-local-dados') {
    $labelsDemo = & docker volume inspect --format '{{json .Labels}}' dentagenda-demo-local-dados | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0 -or $labelsDemo.'dentagenda.ambiente' -ne 'demo-local') { throw 'Volume existente nao pertence a esta demo.' }
  }
}

function Conferir-PortaLivreDemo([int]$PortaDemo) {
  $listenersDemo = @(Get-NetTCPConnection -State Listen -LocalPort $PortaDemo -ErrorAction SilentlyContinue)
  if ($listenersDemo.Count -gt 0) { throw "Porta $PortaDemo ocupada. Nenhum processo sera encerrado automaticamente." }
}

function Conferir-DependenciasDemo {
  $versaoNodeDemo = Com-AmbienteDemo {
    & $nodeDemo --version
    if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel consultar Node.' }
  }
  if ($versaoNodeDemo -notmatch '^v(\d+)\.' -or [int]$Matches[1] -lt 24) {
    throw 'Node 24 ou superior e necessario; nenhuma instalacao sera feita.'
  }
  $gruposDemo = @(
    @{ Pasta = $repoDemo; Nomes = @('vite', 'vitest', 'react', 'react-dom') },
    @{ Pasta = $backendDemo; Nomes = @('prisma', '@prisma/client', 'zod', 'body-parser', 'tsx') }
  )
  # JSON do lockfile possui chave vazia packages['']; o parser do Windows
  # PowerShell 5.1 nao aceita essa chave. Node extrai somente dados publicos.
  $lerVersoesDemo = @'
const fs = require('node:fs');
const path = require('node:path');
try {
  const pasta = process.argv[1];
  const lock = JSON.parse(fs.readFileSync(path.join(pasta, 'package-lock.json'), 'utf8'));
  const versoes = process.argv[2].split(',').map(nome => {
    const instalada = JSON.parse(fs.readFileSync(path.join(pasta, 'node_modules', nome, 'package.json'), 'utf8')).version;
    const registrada = lock.packages['node_modules/' + nome]?.version;
    return { nome, instalada, registrada };
  });
  process.stdout.write(JSON.stringify(versoes));
} catch {
  process.stderr.write('Nao foi possivel conferir dependencias locais.\n');
  process.exitCode = 1;
}
'@
  foreach ($grupoDemo in $gruposDemo) {
    $jsonVersoesDemo = Com-AmbienteDemo {
      & $nodeDemo -e $lerVersoesDemo $grupoDemo.Pasta ($grupoDemo.Nomes -join ',')
      if ($LASTEXITCODE -ne 0) { throw 'Dependencias ausentes; autorize/execute npm ci na raiz e backend antes de continuar.' }
    }
    foreach ($pacoteDemo in ($jsonVersoesDemo | ConvertFrom-Json)) {
      if (-not $pacoteDemo.registrada -or $pacoteDemo.instalada -ne $pacoteDemo.registrada) {
        throw "Dependencia $($pacoteDemo.nome) difere do lockfile; autorize/execute npm ci na raiz e backend."
      }
    }
  }
}

function Ler-ProcessoDemo([string]$NomeDemo) {
  $arquivoPidDemo = Join-Path $privadoDemo "$NomeDemo.pid.xml"
  if (-not (Test-Path -LiteralPath $arquivoPidDemo)) { return $null }
  $registroDemo = Import-Clixml -LiteralPath $arquivoPidDemo
  $processoDemo = Get-CimInstance Win32_Process -Filter "ProcessId = $($registroDemo.Id)" -ErrorAction Stop
  if (-not $processoDemo) { return $null }
  $inicioDemo = (Get-Process -Id $registroDemo.Id -ErrorAction Stop).StartTime.ToUniversalTime().Ticks
  if ($inicioDemo -ne $registroDemo.Inicio -or $processoDemo.ExecutablePath -ne $nodeDemo -or
      -not $processoDemo.CommandLine.Contains($registroDemo.Marcador)) {
    throw "PID de $NomeDemo foi reutilizado ou nao pertence a este checkout; operacao recusada."
  }
  return $registroDemo
}

function Parar-ProcessoDemo([string]$NomeDemo) {
  $registroDemo = Ler-ProcessoDemo $NomeDemo
  if ($registroDemo) {
    Stop-Process -Id $registroDemo.Id -ErrorAction Stop
    Wait-Process -Id $registroDemo.Id -Timeout 15 -ErrorAction SilentlyContinue
  }
}

function Iniciar-ProcessoDemo([string]$NomeDemo) {
  if (Ler-ProcessoDemo $NomeDemo) { Write-Host "$NomeDemo ja esta em execucao."; return }
  $portaDemo = if ($NomeDemo -eq 'api') { 3000 } else { 5173 }
  Conferir-PortaLivreDemo $portaDemo
  $marcadorDemo = if ($NomeDemo -eq 'api') { Join-Path $backendDemo 'src/server.ts' } else { $viteDemo }
  $argsDemo = if ($NomeDemo -eq 'api') {
    '--import tsx "' + $marcadorDemo + '"'
  } else { '"' + $viteDemo + '" --host 127.0.0.1 --port 5173 --strictPort' }
  $pastaDemo = if ($NomeDemo -eq 'api') { $backendDemo } else { $repoDemo }
  $sufixoDemo = Get-Date -Format yyyyMMddHHmmssfff
  $processoDemo = Com-AmbienteDemo {
    Start-Process -FilePath $nodeDemo -ArgumentList $argsDemo -WorkingDirectory $pastaDemo -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $privadoDemo "$NomeDemo-$sufixoDemo.log") -RedirectStandardError (Join-Path $privadoDemo "$NomeDemo-$sufixoDemo.erro.log")
  }
  $registroDemo = @{ Id = $processoDemo.Id; Inicio = $processoDemo.StartTime.ToUniversalTime().Ticks; Marcador = $marcadorDemo }
  $registroDemo | Export-Clixml -LiteralPath (Join-Path $privadoDemo "$NomeDemo.pid.xml")
  $urlDemo = if ($NomeDemo -eq 'api') { 'http://127.0.0.1:3000/api/saude/pronta' } else { 'http://127.0.0.1:5173' }
  for ($tentativaDemo = 0; $tentativaDemo -lt 30; $tentativaDemo++) {
    if (-not (Get-Process -Id $registroDemo.Id -ErrorAction SilentlyContinue)) { throw "$NomeDemo encerrou; consulte os logs privados." }
    try {
      $respostaDemo = Invoke-WebRequest -UseBasicParsing -Uri $urlDemo -TimeoutSec 2
      if ($respostaDemo.StatusCode -eq 200) { Write-Host "$NomeDemo pronto em $urlDemo"; return }
    } catch { }
    Start-Sleep -Seconds 1
  }
  throw "$NomeDemo nao ficou pronto; processo preservado para diagnostico."
}

function Iniciar-BancoDemo {
  $existeDemo = Conferir-ContainerDemo
  Conferir-VolumeDemo
  if (-not $existeDemo) { Conferir-PortaLivreDemo 5434 }
  Executar-ComposeDemo @('up', '-d', '--no-build', '--pull', 'never', 'postgres')
  for ($tentativaDemo = 0; $tentativaDemo -lt 30; $tentativaDemo++) {
    & docker exec $containerDemo pg_isready -U $envDemo.POSTGRES_USER -d dentagenda_demo_local *> $null
    if ($LASTEXITCODE -eq 0) { return }
    Start-Sleep -Seconds 2
  }
  throw 'Banco nao ficou pronto. Container preservado.'
}

function Banco-AtualDemo { return ($envDemo.DATABASE_URL -split '/')[-1] }

function Confirmar-EstadoDemo {
  $saudavelDemo = $true
  foreach ($componenteDemo in @(
    @{ Nome = 'api'; Porta = 3000; Url = 'http://127.0.0.1:3000/api/saude/pronta' },
    @{ Nome = 'front'; Porta = 5173; Url = 'http://127.0.0.1:5173' }
  )) {
    $registroDemo = $null
    try { $registroDemo = Ler-ProcessoDemo $componenteDemo.Nome } catch { }
    $listenersDemo = @(Get-NetTCPConnection -State Listen -LocalPort $componenteDemo.Porta -ErrorAction SilentlyContinue)
    $localDemo = $listenersDemo.Count -gt 0 -and
      @($listenersDemo | Where-Object { $_.LocalAddress -ne '127.0.0.1' }).Count -eq 0
    $proprioDemo = $null -ne $registroDemo -and $listenersDemo.Count -gt 0 -and
      @($listenersDemo | Where-Object { $_.OwningProcess -ne $registroDemo.Id }).Count -eq 0
    $httpDemo = $false
    try {
      $respostaDemo = Invoke-WebRequest -UseBasicParsing -Uri $componenteDemo.Url -TimeoutSec 3 -MaximumRedirection 0
      $httpDemo = $respostaDemo.StatusCode -eq 200
    } catch { }
    $okDemo = $proprioDemo -and $localDemo -and $httpDemo
    $situacaoDemo = if ($okDemo) { 'saudavel' } else { 'indisponivel ou configuracao divergente' }
    Write-Host "$($componenteDemo.Nome): $situacaoDemo (processo proprio=$proprioDemo; somente 127.0.0.1=$localDemo; HTTP 200=$httpDemo)."
    $saudavelDemo = $saudavelDemo -and $okDemo
  }
  $bancoOkDemo = $false
  try {
    if (Conferir-ContainerDemo) {
      $saudeBancoDemo = & docker inspect --format '{{.State.Health.Status}}' $containerDemo
      $listenersDemo = @(Get-NetTCPConnection -State Listen -LocalPort 5434 -ErrorAction SilentlyContinue)
      $localBancoDemo = $listenersDemo.Count -gt 0 -and
        @($listenersDemo | Where-Object { $_.LocalAddress -ne '127.0.0.1' }).Count -eq 0
      $bancoOkDemo = $LASTEXITCODE -eq 0 -and $saudeBancoDemo -eq 'healthy' -and $localBancoDemo
    }
  } catch { }
  $situacaoBancoDemo = if ($bancoOkDemo) { 'saudavel, container proprio e somente 127.0.0.1:5434' } else { 'indisponivel ou configuracao divergente' }
  Write-Host "postgres: $situacaoBancoDemo."
  $saudavelDemo = $saudavelDemo -and $bancoOkDemo
  $situacaoGeralDemo = if ($saudavelDemo) { 'SAUDAVEL' } else { 'INCOMPLETO/INDISPONIVEL' }
  Write-Host "Estado geral: $situacaoGeralDemo."
  return $saudavelDemo
}

function Salvar-BackupBancoDemo([string]$DestinoDemo) {
  $null = Conferir-ContainerDemo -Obrigatorio
  if ((Test-Path -LiteralPath $DestinoDemo) -or (Test-Path -LiteralPath "$DestinoDemo.sha256")) {
    throw 'O destino do backup ja existe; nenhuma copia sera sobrescrita.'
  }
  $sufixoDemo = Get-Date -Format yyyyMMddHHmmssfff
  $remotoDemo = "/tmp/demo-$sufixoDemo.dump"
  & docker exec $containerDemo pg_dump -U $envDemo.POSTGRES_USER -d (Banco-AtualDemo) -Fc -f $remotoDemo
  if ($LASTEXITCODE -ne 0) { throw 'Backup falhou.' }
  & docker cp "${containerDemo}:$remotoDemo" $DestinoDemo
  if ($LASTEXITCODE -ne 0) { throw 'Copia de backup falhou; arquivo parcial preservado.' }
  (Get-FileHash -LiteralPath $DestinoDemo -Algorithm SHA256).Hash | Set-Content -LiteralPath "$DestinoDemo.sha256" -Encoding Ascii
  Write-Host "Backup ficticio: $DestinoDemo"
}

if ($env:OS -ne 'Windows_NT') { throw 'Este roteiro usa DPAPI CurrentUser e requer Windows.' }
if ($Acao -eq 'Preparar' -and -not (Test-Path -LiteralPath $configDemo)) {
  New-Item -ItemType Directory -Path $privadoDemo -Force | Out-Null
  # Nao adotar um container/volume preexistente sem a configuracao privada correspondente.
  if (Conferir-ContainerDemo) { throw 'Container preexistente sem configuracao privada; recuperar config antes de continuar.' }
  $volumesDemo = & docker volume ls --filter name=^dentagenda-demo-local-dados$ --format '{{.Name}}'
  if ($LASTEXITCODE -ne 0 -or $volumesDemo) { throw 'Volume preexistente ou Docker indisponivel; nao sera reutilizado sem configuracao.' }
  $senhaBancoDemo = Nova-SenhaDemo
  $envDemo = @{
    NODE_ENV = 'development'; PORTA = '3000'; ENVIADOR_MENSAGEM = 'log'; PROXY_CONFIAVEL = '0'; RETENCAO_DIAS = '90'
    POSTGRES_USER = 'demo_local'; POSTGRES_PASSWORD = $senhaBancoDemo
    DATABASE_URL = "postgresql://demo_local:$senhaBancoDemo@127.0.0.1:5434/dentagenda_demo_local"
    JWT_SEGREDO = (Nova-SenhaDemo); CODIGO_HMAC_SEGREDO = (Nova-SenhaDemo)
    DEMO_ADMIN_SENHA = (Nova-SenhaDemo); DEMO_RECEPCAO_SENHA = (Nova-SenhaDemo)
    DEMO_DENTISTA_SENHA = (Nova-SenhaDemo); DEMO_PACIENTE_SENHA = (Nova-SenhaDemo)
  }
  Salvar-ConfigDemo $envDemo
} else { Carregar-ConfigDemo }

switch ($Acao) {
  'Preparar' {
    Conferir-DependenciasDemo
    foreach ($arquivoDemo in @($tsxDemo, $viteDemo, (Join-Path $backendDemo 'node_modules/prisma/build/index.js'))) {
      if (-not (Test-Path -LiteralPath $arquivoDemo)) { throw 'Dependencia local ausente; nenhuma instalacao sera feita.' }
    }
    Iniciar-BancoDemo
    Executar-NodeDemo @((Join-Path $backendDemo 'node_modules/prisma/build/index.js'), 'migrate', 'deploy')
    Executar-NodeDemo @($tsxDemo, (Join-Path $backendDemo 'scripts/preparar-demo-local.ts'))
    $baselineDemo = Join-Path $privadoDemo 'baseline.dump'
    if (-not (Test-Path -LiteralPath $baselineDemo)) {
      Salvar-BackupBancoDemo $baselineDemo
    } elseif (-not (Test-Path -LiteralPath "$baselineDemo.sha256")) {
      throw 'Baseline preexistente sem checksum; preservada para diagnostico, nao sera sobrescrita.'
    } else {
      $hashBaselineDemo = (Get-Content -LiteralPath "$baselineDemo.sha256" -Raw).Trim()
      if ((Get-FileHash -LiteralPath $baselineDemo -Algorithm SHA256).Hash -ne $hashBaselineDemo) {
        throw 'Baseline preexistente com checksum invalido; preservada para diagnostico.'
      }
      Write-Host 'Baseline preexistente preservada.'
    }
    Write-Host 'Banco ficticio preparado. Credenciais protegidas por DPAPI; nenhum .env foi alterado.'
  }
  'Iniciar' {
    Conferir-DependenciasDemo
    Iniciar-BancoDemo
    Iniciar-ProcessoDemo 'api'
    Iniciar-ProcessoDemo 'front'
    Executar-NodeDemo @($tsxDemo, (Join-Path $backendDemo 'scripts/verificar-demo-local.ts'))
    if (-not (Confirmar-EstadoDemo)) { throw 'Demo sem prontidao ou listeners fora do loopback; processos preservados para diagnostico.' }
  }
  'Estado' {
    # Consulta informativa: ambiente parado reporta INCOMPLETO sem erro/exit1.
    $null = Confirmar-EstadoDemo
  }
  'Parar' {
    Parar-ProcessoDemo 'front'
    Parar-ProcessoDemo 'api'
    if (Conferir-ContainerDemo) { Executar-ComposeDemo @('stop', 'postgres') }
    Write-Host 'Processos proprios parados; dados e volume preservados.'
  }
  'ReiniciarApi' { Conferir-DependenciasDemo; Parar-ProcessoDemo 'api'; Iniciar-ProcessoDemo 'api' }
  'ReiniciarFront' { Conferir-DependenciasDemo; Parar-ProcessoDemo 'front'; Iniciar-ProcessoDemo 'front' }
  'Credenciais' {
    Write-Host 'SENHAS FICTICIAS LOCAIS: execute somente fora de gravacao/compartilhamento de tela.'
    Write-Host "Admin admin@exemplo.dev: $($envDemo.DEMO_ADMIN_SENHA)"
    Write-Host "Recepcao carla.souza@exemplo.dev: $($envDemo.DEMO_RECEPCAO_SENHA)"
    Write-Host "Dentista ana.costa@exemplo.dev: $($envDemo.DEMO_DENTISTA_SENHA)"
    Write-Host "Paciente CPF 12345678909: $($envDemo.DEMO_PACIENTE_SENHA)"
  }
  'Backup' {
    $sufixoDemo = Get-Date -Format yyyyMMddHHmmssfff
    $destinoDemo = Join-Path $privadoDemo "demo-$sufixoDemo.dump"
    Salvar-BackupBancoDemo $destinoDemo
  }
  'Restaurar' {
    if (-not $ArquivoBackup) { $ArquivoBackup = Join-Path $privadoDemo 'baseline.dump' }
    $origemDemo = (Resolve-Path -LiteralPath $ArquivoBackup).Path
    $prefixoDemo = [IO.Path]::GetFullPath($privadoDemo).TrimEnd('\') + '\'
    if (-not $origemDemo.StartsWith($prefixoDemo, [StringComparison]::OrdinalIgnoreCase) -or
        -not (Test-Path -LiteralPath "$origemDemo.sha256")) { throw 'Use somente backups privados desta demo com checksum.' }
    $esperadoDemo = (Get-Content -LiteralPath "$origemDemo.sha256" -Raw).Trim()
    if ((Get-FileHash -LiteralPath $origemDemo -Algorithm SHA256).Hash -ne $esperadoDemo) { throw 'Checksum invalido.' }
    $null = Conferir-ContainerDemo -Obrigatorio
    Parar-ProcessoDemo 'front'
    Parar-ProcessoDemo 'api'
    $sufixoDemo = Get-Date -Format yyyyMMddHHmmssfff
    $novoBancoDemo = "dentagenda_demo_restore_$sufixoDemo"
    $remotoDemo = "/tmp/restore-$sufixoDemo.dump"
    & docker cp $origemDemo "${containerDemo}:$remotoDemo"
    if ($LASTEXITCODE -ne 0) { throw 'Copia para restauracao falhou.' }
    & docker exec $containerDemo createdb -U $envDemo.POSTGRES_USER $novoBancoDemo
    if ($LASTEXITCODE -ne 0) { throw 'Criacao do banco novo falhou.' }
    & docker exec $containerDemo pg_restore -U $envDemo.POSTGRES_USER -d $novoBancoDemo --exit-on-error --single-transaction $remotoDemo
    if ($LASTEXITCODE -ne 0) { throw 'Restauracao falhou; banco original e destino preservados.' }
    $envDemo.DATABASE_URL = $envDemo.DATABASE_URL -replace '/dentagenda_demo_(local|restore_[0-9]+)$', "/$novoBancoDemo"
    $configAnteriorDemo = Join-Path $privadoDemo "config-antes-restore-$sufixoDemo.xml"
    Copy-Item -LiteralPath $configDemo -Destination $configAnteriorDemo
    if ((Get-FileHash -LiteralPath $configDemo).Hash -ne (Get-FileHash -LiteralPath $configAnteriorDemo).Hash) { throw 'Backup da configuracao DPAPI falhou; original preservado.' }
    Salvar-ConfigDemo $envDemo
    Write-Host 'Restaurado em banco novo; original preservado. Execute Iniciar para validar a aplicacao.'
  }
}
