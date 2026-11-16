[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Preparar', 'Compilar', 'InicializarBanco', 'Iniciar', 'Estado', 'Verificar', 'Parar', 'IniciarTunel', 'PararTunel', 'Url', 'Backup', 'Credenciais')]
  [string]$Acao,
  [string]$EmailAutorizado,
  [switch]$ConfirmarExposicao,
  [switch]$Publico
)
$ErrorActionPreference = 'Stop'
$repoRemoto = Split-Path $PSScriptRoot -Parent
$privadoRemoto = Join-Path $repoRemoto '.codex/demo-remota'
$configRemota = Join-Path $privadoRemoto 'config.xml'
$composeRemoto = Join-Path $repoRemoto 'deploy/remoto/compose.yaml'
$envRemoto = @{}

function Nova-SenhaRemota {
  $bytesRemoto = New-Object byte[] 24
  $rngRemoto = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rngRemoto.GetBytes($bytesRemoto) } finally { $rngRemoto.Dispose() }
  return ([BitConverter]::ToString($bytesRemoto)).Replace('-', '').ToLowerInvariant()
}
function Salvar-ConfiguracaoRemota {
  $valoresRemoto = @{}
  foreach ($chaveRemota in $envRemoto.Keys) { $valoresRemoto[$chaveRemota] = ConvertTo-SecureString $envRemoto[$chaveRemota] -AsPlainText -Force }
  $valoresRemoto | Export-Clixml -LiteralPath $configRemota
}
function Ler-ConfiguracaoRemota {
  if (-not (Test-Path -LiteralPath $configRemota)) { throw 'Execute Preparar primeiro.' }
  $valoresRemoto = Import-Clixml -LiteralPath $configRemota
  foreach ($chaveRemota in $valoresRemoto.Keys) {
    if ($valoresRemoto[$chaveRemota] -isnot [Security.SecureString]) { throw 'Configuracao privada invalida.' }
    $credencialRemota = New-Object Management.Automation.PSCredential('demo', $valoresRemoto[$chaveRemota])
    $envRemoto[$chaveRemota] = $credencialRemota.GetNetworkCredential().Password
  }
  if ($envRemoto.DATABASE_URL -notmatch '^postgresql://app_demo:[a-f0-9]{48}@banco:5432/dentagenda_demo_remota$' -or
      $envRemoto.DATABASE_URL_MIGRATIONS -notmatch '^postgresql://migrations_demo:[a-f0-9]{48}@banco:5432/dentagenda_demo_remota$') {
    throw 'Destino fora do banco ficticio exclusivo; operacao recusada.'
  }
}
function Com-AmbienteRemoto([scriptblock]$ComandoRemoto) {
  $anterioresRemoto = @{}
  try {
    foreach ($chaveRemota in @('COMPOSE_FILE', 'COMPOSE_PROFILES', 'COMPOSE_PROJECT_NAME', 'COMPOSE_ENV_FILES')) {
      $anterioresRemoto[$chaveRemota] = [Environment]::GetEnvironmentVariable($chaveRemota, 'Process')
      [Environment]::SetEnvironmentVariable($chaveRemota, $null, 'Process')
    }
    foreach ($chaveRemota in $envRemoto.Keys) {
      $anterioresRemoto[$chaveRemota] = [Environment]::GetEnvironmentVariable($chaveRemota, 'Process')
      [Environment]::SetEnvironmentVariable($chaveRemota, $envRemoto[$chaveRemota], 'Process')
    }
    & $ComandoRemoto
  } finally {
    foreach ($chaveRemota in $anterioresRemoto.Keys) { [Environment]::SetEnvironmentVariable($chaveRemota, $anterioresRemoto[$chaveRemota], 'Process') }
  }
}
function Executar-ComposeRemoto([string[]]$ArgumentosRemoto) {
  Com-AmbienteRemoto {
    & docker compose --env-file (Join-Path $repoRemoto 'deploy/local/compose.env.example') -f $composeRemoto @ArgumentosRemoto
    if ($LASTEXITCODE -ne 0) { throw 'Operacao Docker remota falhou; dados preservados.' }
  }
}
function Parar-TunelRemoto {
  $idRemoto = & docker ps -aq --filter 'name=^/dentagenda-demo-remota-tunel$'
  if ($LASTEXITCODE -ne 0) { throw 'Docker indisponivel.' }
  if ($idRemoto) {
    $labelsRemoto = & docker inspect --format '{{json .Config.Labels}}' $idRemoto | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0 -or $labelsRemoto.'com.docker.compose.project' -ne 'dentagenda-demo-remota' -or
        $labelsRemoto.'com.docker.compose.service' -ne 'conector') { throw 'Container divergente; parada recusada.' }
    & docker stop $idRemoto
    if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel encerrar o tunel.' }
  }
}
if ($env:OS -ne 'Windows_NT') { throw 'A configuracao privada usa DPAPI CurrentUser no Windows.' }
if ($Acao -eq 'Preparar' -and -not (Test-Path -LiteralPath $configRemota)) {
  $existentesRemoto = & docker ps -aq --filter 'label=com.docker.compose.project=dentagenda-demo-remota'
  if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop indisponivel.' }
  $volumesRemoto = & docker volume ls -q --filter 'label=com.docker.compose.project=dentagenda-demo-remota'
  if ($LASTEXITCODE -ne 0 -or $existentesRemoto -or $volumesRemoto) { throw 'Recursos remotos existentes sem configuracao privada; recuperar configuracao primeiro.' }
  New-Item -ItemType Directory -Path $privadoRemoto -Force | Out-Null
  foreach ($chaveRemota in @('BANCO_ADMIN_SENHA','BANCO_RUNTIME_SENHA','BANCO_MIGRATIONS_SENHA','JWT_SEGREDO','CODIGO_HMAC_SEGREDO','DEMO_ADMIN_SENHA','DEMO_RECEPCAO_SENHA','DEMO_DENTISTA_SENHA','DEMO_PACIENTE_SENHA')) { $envRemoto[$chaveRemota] = Nova-SenhaRemota }
  $envRemoto.DATABASE_URL = "postgresql://app_demo:$($envRemoto.BANCO_RUNTIME_SENHA)@banco:5432/dentagenda_demo_remota"
  $envRemoto.DATABASE_URL_MIGRATIONS = "postgresql://migrations_demo:$($envRemoto.BANCO_MIGRATIONS_SENHA)@banco:5432/dentagenda_demo_remota"
  Salvar-ConfiguracaoRemota
} else { Ler-ConfiguracaoRemota }

switch ($Acao) {
  'Preparar' { Write-Host 'Configuracao ficticia DPAPI preparada. Nenhum tunel foi iniciado.' }
  'Compilar' {
    Executar-ComposeRemoto @('build', 'migrations', 'api', 'front')
    Executar-ComposeRemoto @('--profile', 'preparacao', 'build', 'preparar')
  }
  'InicializarBanco' {
    Executar-ComposeRemoto @('up', '-d', '--no-build', '--pull', 'never', '--wait', 'banco')
    Executar-ComposeRemoto @('run', '--rm', '--no-deps', 'migrations')
    Executar-ComposeRemoto @('--profile', 'preparacao', 'run', '--rm', '--no-deps', 'preparar')
    Write-Host 'Banco ficticio inicializado. Execute Iniciar para subir a aplicacao; nao repetir em retomadas comuns.'
  }
  'Iniciar' {
    Executar-ComposeRemoto @('up', '-d', '--no-build', '--pull', 'never', '--wait', 'banco', 'api', 'front')
    Write-Host 'Stack remoto privado iniciado; nenhum tunel foi aberto.'
  }
  'Estado' {
    Executar-ComposeRemoto @('ps', '--all')
    Write-Host 'Readiness e fluxos completos: execute Verificar. O front remoto nao publica portas no host.'
  }
  'Verificar' { Executar-ComposeRemoto @('--profile', 'verificacao', 'run', '--rm', '--no-deps', 'verificar') }
  'Parar' { Parar-TunelRemoto; Executar-ComposeRemoto @('stop', 'front', 'api', 'banco'); Write-Host 'Stack parado; banco e volume preservados.' }
  'PararTunel' { Parar-TunelRemoto }
  'Url' {
    $ultimoLog = Get-ChildItem -LiteralPath $privadoRemoto -Filter 'tunel-*.log' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $ultimoLog) { throw 'Nenhum log de tunel encontrado.' }
    $urlTunel = Select-String -LiteralPath $ultimoLog.FullName -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -AllMatches | ForEach-Object { $_.Matches.Value } | Select-Object -Last 1
    if (-not $urlTunel) { throw 'URL nao encontrada no ultimo log.' }
    Write-Host $urlTunel
  }
  'IniciarTunel' {
    # Dois modos explicitos. Publico exige -Publico E -ConfirmarExposicao e nunca e fallback do restrito.
    if ($Publico) {
      if (-not $ConfirmarExposicao -or $EmailAutorizado) { throw 'Modo publico exige -Publico -ConfirmarExposicao e nenhum e-mail.' }
    } elseif (-not $ConfirmarExposicao -or -not $EmailAutorizado -or
        $EmailAutorizado -notmatch '^[A-Za-z0-9.!#$%&''+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$' -or
        $EmailAutorizado -match '[*,;\s]') { throw 'Exige autorizacao explicita e exatamente um e-mail, sem lista ou wildcard.' }
    $frontRemoto = @(Executar-ComposeRemoto @('ps', '--quiet', 'front'))
    if ($frontRemoto.Count -ne 1 -or -not $frontRemoto[0]) { throw 'Frontend remoto indisponivel; exposicao recusada.' }
    $saudeFrontRemoto = & docker inspect --format '{{.State.Health.Status}}' $frontRemoto[0]
    if ($LASTEXITCODE -ne 0 -or $saudeFrontRemoto -ne 'healthy') { throw 'Frontend remoto sem prontidao; exposicao recusada.' }
    if (-not $Publico) {
      $ajudaRemota = Executar-ComposeRemoto @('--profile', 'tunel', 'run', '--rm', '--no-deps', 'conector', 'tunnel', '--help')
      if (($ajudaRemota -join "`n") -notmatch '--allowed-mail') { throw 'cloudflared nao oferece allowed-mail; exposicao recusada.' }
    }
    $argumentosAcesso = if ($Publico) { @() } else { @('--allowed-mail', $EmailAutorizado) }
    $logRemoto = Join-Path $privadoRemoto ('tunel-' + (Get-Date -Format yyyyMMddHHmmssfff) + '.log')
    if ($Publico) { Write-Host 'ATENCAO: tunel PUBLICO em primeiro plano; qualquer pessoa com a URL ve o login (dados ficticios). Ctrl+C encerra.' } else { Write-Host 'Tunel restrito em primeiro plano. Ctrl+C encerra; nova execucao gera outra URL.' }
    Com-AmbienteRemoto {
      # PowerShell 5.1 transforma stderr nativo em ErrorRecord quando mesclado.
      # cloudflared escreve logs informativos nessa stream; exit code decide a falha.
      $preferenciaAnteriorRemota = $ErrorActionPreference
      try {
        $ErrorActionPreference = 'Continue'
        & docker compose --env-file (Join-Path $repoRemoto 'deploy/local/compose.env.example') -f $composeRemoto --profile tunel run --rm --no-deps --name dentagenda-demo-remota-tunel conector tunnel --no-autoupdate --loglevel info --management-diagnostics=false --url http://front:8080 @argumentosAcesso 2>&1 | ForEach-Object { $_.ToString() } | Tee-Object -FilePath $logRemoto -ErrorAction Stop
        $codigoSaidaTunelRemoto = $LASTEXITCODE
      } finally { $ErrorActionPreference = $preferenciaAnteriorRemota }
      if ($codigoSaidaTunelRemoto -ne 0) { throw 'Tunel encerrou com falha; nenhuma exposicao alternativa e aberta automaticamente.' }
    }
  }
  'Backup' {
    $nomeRemoto = 'demo-remota-' + (Get-Date -Format yyyyMMddHHmmssfff) + '.dump'
    $destinoRemoto = Join-Path $privadoRemoto $nomeRemoto
    if ((Test-Path -LiteralPath $destinoRemoto) -or (Test-Path -LiteralPath "$destinoRemoto.sha256")) { throw 'Destino de backup existente; nenhuma copia sera sobrescrita.' }
    Executar-ComposeRemoto @('exec', '-T', 'banco', 'pg_dump', '-U', 'postgres', '-d', 'dentagenda_demo_remota', '-Fc', '-f', "/tmp/$nomeRemoto")
    $null = Executar-ComposeRemoto @('exec', '-T', 'banco', 'pg_restore', '--list', "/tmp/$nomeRemoto")
    Executar-ComposeRemoto @('cp', "banco:/tmp/$nomeRemoto", $destinoRemoto)
    (Get-FileHash -LiteralPath $destinoRemoto -Algorithm SHA256).Hash | Set-Content -LiteralPath "$destinoRemoto.sha256" -Encoding Ascii
    Write-Host 'Backup ficticio privado criado com checksum; volume preservado.'
  }
  'Credenciais' {
    Write-Host 'Somente em terminal privado, fora de gravacao, transcricao e compartilhamento de tela.'
    $confirmacaoPrivada = Read-Host 'Digite EXIBIR EM TERMINAL PRIVADO para mostrar as quatro senhas ficticias'
    if ($confirmacaoPrivada -cne 'EXIBIR EM TERMINAL PRIVADO') { throw 'Exibicao de credenciais cancelada.' }
    Write-Host ("Admin admin@exemplo.dev: " + $envRemoto.DEMO_ADMIN_SENHA)
    Write-Host ("Recepcao carla.souza@exemplo.dev: " + $envRemoto.DEMO_RECEPCAO_SENHA)
    Write-Host ("Dentista ana.costa@exemplo.dev: " + $envRemoto.DEMO_DENTISTA_SENHA)
    Write-Host ("Paciente CPF 12345678909: " + $envRemoto.DEMO_PACIENTE_SENHA)
  }
}
