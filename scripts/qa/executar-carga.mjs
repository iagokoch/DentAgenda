import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { spawn, spawnSync, fork } from 'node:child_process';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const backend = resolve(raiz, 'backend');
const banco = 'dentagenda_break_it_performance_test';
const container = `dentagenda-break-it-carga-${randomUUID()}`;
const ambienteBasico = Object.fromEntries(Object.entries(process.env).filter(([nome]) =>
  ['path', 'systemroot', 'windir', 'temp', 'tmp', 'comspec', 'pathext'].includes(nome.toLowerCase())));
let criouContainer = false;
let api;

function comando(programa, argumentos, env = ambienteBasico, timeout = 120_000) {
  const resultado = spawnSync(programa, argumentos, { cwd: backend, env, encoding: 'utf8', timeout, windowsHide: true });
  if (resultado.error || resultado.status !== 0) throw new Error(`Falhou a etapa ${programa}; saída omitida para preservar dados da conexão.`);
  return resultado.stdout.trim();
}

async function baixarK6() {
  const existente = spawnSync('k6', ['version'], { encoding: 'utf8', windowsHide: true });
  if (existente.status === 0) return 'k6';
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error('k6 não encontrado. Instale localmente a versão adequada à plataforma e inclua no PATH.');
  }
  const pasta = resolve(tmpdir(), 'dentagenda-break-it-k6-1.4.0');
  const executavel = resolve(pasta, 'k6-v1.4.0-windows-amd64/k6.exe');
  try { await access(executavel); return executavel; } catch { /* Primeira instalação local. */ }
  await mkdir(pasta, { recursive: true });
  const nome = 'k6-v1.4.0-windows-amd64.zip';
  const origem = 'https://github.com/grafana/k6/releases/download/v1.4.0';
  const baixar = async (caminho) => {
    const resposta = await fetch(`${origem}/${caminho}`, { signal: AbortSignal.timeout(90_000) });
    if (!resposta.ok) throw new Error('Download oficial de k6 não disponível.');
    return Buffer.from(await resposta.arrayBuffer());
  };
  const [zip, somas] = await Promise.all([baixar(nome), baixar('k6-v1.4.0-checksums.txt')]);
  const linha = somas.toString('utf8').split('\n').find((valor) => valor.trim().endsWith(nome));
  if (!linha || createHash('sha256').update(zip).digest('hex') !== linha.trim().split(/\s+/)[0]) {
    throw new Error('Checksum oficial do k6 não confere.');
  }
  const arquivo = resolve(pasta, nome);
  await writeFile(arquivo, zip);
  const literal = (texto) => `'${texto.replaceAll("'", "''")}'`;
  comando('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `Expand-Archive -LiteralPath ${literal(arquivo)} -DestinationPath ${literal(pasta)} -Force`]);
  await access(executavel);
  return executavel;
}

async function iniciarApi(env) {
  api = fork(resolve(backend, 'scripts/qa/api-carga.ts'), [], {
    cwd: backend, env, execArgv: ['--import', 'tsx', '--import', pathToFileURL(resolve(backend, 'scripts/qa/ignorar-env-real.mjs')).href],
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true,
  });
  return new Promise((aceitar, rejeitar) => {
    const prazo = setTimeout(() => rejeitar(new Error('API sintética excedeu 60 segundos para iniciar.')), 60_000);
    api.once('message', (mensagem) => {
      clearTimeout(prazo);
      if (mensagem.erro) rejeitar(new Error(mensagem.erro));
      else aceitar(mensagem);
    });
    api.once('exit', () => { clearTimeout(prazo); rejeitar(new Error('API sintética encerrou antes de ficar pronta.')); });
    api.once('error', () => { clearTimeout(prazo); rejeitar(new Error('API sintética não pôde ser criada.')); });
  });
}

async function executar() {
  const k6 = await baixarK6();
  console.log(comando(k6, ['version']));
  comando('docker', ['run', '--detach', '--name', container, '--label', 'dentagenda.qa=break-it-carga',
    '--publish', '127.0.0.1::5432', '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', '--env', `POSTGRES_DB=${banco}`,
    '--tmpfs', '/var/lib/postgresql/data', 'postgres:17']);
  criouContainer = true;
  const porta = comando('docker', ['port', container, '5432/tcp']).split(':').at(-1);
  if (!/^\d+$/.test(porta ?? '')) throw new Error('Docker não informou uma porta exclusiva.');
  let pronto = false;
  for (let tentativa = 0; tentativa < 40; tentativa++) {
    const verificacao = spawnSync('docker', ['exec', container, 'pg_isready', '-U', 'postgres', '-d', banco],
      { env: ambienteBasico, timeout: 5_000, windowsHide: true, stdio: 'ignore' });
    if (verificacao.status === 0) { pronto = true; break; }
    await new Promise((continuar) => setTimeout(continuar, 500));
  }
  if (!pronto) throw new Error('PostgreSQL descartável não ficou pronto.');
  const real = comando('docker', ['exec', container, 'psql', '-U', 'postgres', '-d', banco, '-Atc', 'SELECT current_database()']);
  if (real !== banco) throw new Error('Banco real diverge do destino autorizado.');
  console.log('Banco real confirmado antes das migrations; instância tmpfs exclusiva e porta loopback.');
  const env = {
    ...ambienteBasico, NODE_ENV: 'test', PORTA: '1',
    DATABASE_URL: `postgresql://postgres@127.0.0.1:${porta}/${banco}`,
    JWT_SEGREDO: randomBytes(32).toString('hex'), CODIGO_HMAC_SEGREDO: randomBytes(32).toString('hex'),
    ENVIADOR_MENSAGEM: 'log', PROXY_CONFIAVEL: '0',
  };
  comando(process.execPath, ['--import', pathToFileURL(resolve(backend, 'scripts/qa/ignorar-env-real.mjs')).href,
    'node_modules/prisma/build/index.js', 'migrate', 'deploy'], env);
  const fixture = await iniciarApi(env);
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(fixture.baseUrl)) throw new Error('API fora de loopback.');
  const envK6 = {
    ...ambienteBasico, K6_NO_USAGE_REPORT: 'true', K6_WEB_DASHBOARD: 'false',
    BREAK_IT_BASE_URL: fixture.baseUrl, BREAK_IT_COMPROVANTE: fixture.comprovante,
    BREAK_IT_ACCESS_TOKEN: fixture.accessToken, BREAK_IT_DENTISTA_ID: fixture.dentistaId,
    BREAK_IT_PROCEDIMENTO_ID: fixture.procedimentoId, BREAK_IT_CONSULTA_ID: fixture.consultaId, BREAK_IT_DATA: fixture.data,
  };
  console.log('Fixture: 1 dentista, 10 pacientes, 20 consultas; um login; carga GET com 5 VUs por 20 segundos.');
  const saida = await new Promise((aceitar, rejeitar) => {
    const processo = spawn(k6, ['run', '--no-color', '--quiet', resolve(raiz, 'performance/break-it.js')],
      { env: envK6, cwd: raiz, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], timeout: 35_000 });
    let conteudo = '';
    processo.stdout.on('data', (trecho) => { conteudo += trecho; });
    processo.stderr.on('data', (trecho) => { conteudo += trecho; });
    processo.on('error', () => rejeitar(new Error('k6 não iniciou ou excedeu o prazo.')));
    processo.on('close', (codigo) => aceitar({ codigo, conteudo }));
  });
  const sanitizada = saida.conteudo.replaceAll(fixture.accessToken, '[OCULTO]');
  console.log(sanitizada);
  const pasta = resolve(raiz, 'performance/resultados');
  await mkdir(pasta, { recursive: true });
  await writeFile(resolve(pasta, 'break-it-k6.txt'), sanitizada);
  if (saida.codigo !== 0) throw new Error('k6 encontrou falha; confira as métricas sanitizadas.');
}

try { await executar(); }
catch (erro) { console.error(erro instanceof Error ? erro.message : 'Carga não concluída.'); process.exitCode = 1; }
finally {
  if (api && !api.killed) {
    if (api.connected) api.send('encerrar');
    await Promise.race([new Promise((continuar) => api.once('exit', continuar)), new Promise((continuar) => setTimeout(continuar, 3_000))]);
    if (api.exitCode === null) api.kill();
  }
  if (criouContainer) {
    const removido = spawnSync('docker', ['rm', '--force', container], { env: ambienteBasico, stdio: 'ignore', timeout: 20_000, windowsHide: true });
    if (removido.status !== 0) { console.error(`Remova somente o contêiner descartável ${container}.`); process.exitCode = 1; }
    else console.log('API encerrada e contêiner exclusivo removido; nenhum volume foi criado.');
  }
}
