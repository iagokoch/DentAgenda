import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const backend = fileURLToPath(new URL('../../', import.meta.url));
const modo = process.argv[2] || 'integracao';
const arquivo = process.argv[3];
const comandos = {
  baseline: ['test'],
  embaralhado: ['run', 'test:embaralhado'],
  integracao: ['run', 'qa:integracao:interno'],
};
if (!comandos[modo]) throw new Error('Modo permitido: baseline, embaralhado ou integracao.');
if (process.argv.length > 4 || (arquivo && (!/^src\/(?:[a-zA-Z0-9_.-]+\/)*[a-zA-Z0-9_.-]+\.test\.ts$/.test(arquivo)
  || arquivo.split('/').includes('..')))) throw new Error('Filtro permitido: um arquivo src/...test.ts, sem opções adicionais.');
const nome = `dentagenda-break-it-${Date.now()}`;
const banco = 'dentagenda_break_it_test';
function docker(args) {
  const resultado = spawnSync('docker', args, { encoding: 'utf8' });
  if (resultado.status !== 0) throw new Error(`Docker recusou ${args[0]}; confira o Docker Desktop. Nenhum destino existente será usado.`);
  return resultado.stdout.trim();
}
let criado = false;
try {
  docker(['run', '--detach', '--name', nome, '--label', 'dentagenda.qa=break-it', '--publish', '127.0.0.1::5432',
    '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', '--env', `POSTGRES_DB=${banco}`, '--tmpfs', '/var/lib/postgresql/data', 'postgres:17']);
  criado = true;
  const porta = docker(['inspect', '--format', '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}', nome]);
  if (!/^\d+$/.test(porta)) throw new Error('Porta descartável inválida.');
  let pronto = false;
  for (let tentativa = 0; tentativa < 30; tentativa++) {
    const resposta = spawnSync('docker', ['exec', nome, 'psql', '-U', 'postgres', '-d', banco, '-Atc', 'SELECT current_database()'], { encoding: 'utf8' });
    if (resposta.status === 0 && resposta.stdout.trim() === banco) { pronto = true; break; }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!pronto) throw new Error('Nome real do banco descartável não confirmado; nenhuma migration executada.');
  // A regressão da guarda de limpeza precisa de um segundo banco vazio sem sufixo _test.
  docker(['exec', nome, 'psql', '-U', 'postgres', '-d', banco, '-c', 'CREATE DATABASE dentagenda_break_it']);
  console.log(`Isolamento comprovado: PostgreSQL descartável, banco ${banco}, loopback, sem volume persistente.`);
  const url = `postgresql://postgres@127.0.0.1:${porta}/${banco}`;
  const ambiente = { ...process.env, NODE_ENV: 'test', PORTA: '3000', DATABASE_URL: url, DATABASE_URL_TESTE: url,
    JWT_SEGREDO: randomBytes(48).toString('hex'), CODIGO_HMAC_SEGREDO: randomBytes(48).toString('hex'),
    ENVIADOR_MENSAGEM: 'log', PROXY_CONFIAVEL: '0', RETENCAO_DIAS: '90',
    NODE_OPTIONS: `--import=${new URL('./ignorar-env-real.mjs', import.meta.url).href}` };
  // npm CLI é lançado por Node para evitar npm.ps1 e shells intermediários no Windows.
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error('Execute por npm run qa:isolado -- <modo>.');
  const resultado = spawnSync(process.execPath, [npmCli, ...comandos[modo], ...(arquivo ? ['--', arquivo] : [])], { cwd: backend, env: ambiente, stdio: 'inherit' });
  process.exitCode = resultado.status ?? 1;
} finally {
  // Remove somente o contêiner com nome novo criado por esta execução; nunca volumes existentes.
  if (criado) docker(['rm', '--force', nome]);
}
