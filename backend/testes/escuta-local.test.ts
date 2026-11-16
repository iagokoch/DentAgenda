import { fork, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as esperar } from 'node:timers/promises';
import { afterEach, expect, it } from 'vitest';

let processo: ChildProcess | undefined;

afterEach(async () => {
  if (!processo || processo.exitCode !== null || processo.signalCode !== null) return;
  const terminou = once(processo, 'exit');
  processo.kill();
  await terminou;
});

it('a API real de desenvolvimento atende loopback e recusa outro endereço local', async () => {
  const reserva = createServer();
  reserva.listen(0, '127.0.0.1');
  await once(reserva, 'listening');
  const endereco = reserva.address();
  if (!endereco || typeof endereco === 'string') throw new Error('porta indisponível');
  const porta = endereco.port;
  await new Promise<void>((resolve, reject) => reserva.close(erro => erro ? reject(erro) : resolve()));

  // Nenhum .env, segredo, URL ou NODE_OPTIONS do operador entra no subprocesso.
  const ambiente: NodeJS.ProcessEnv = {};
  for (const [nome, valor] of Object.entries(process.env)) {
    if (/^(path|systemroot|windir|temp|tmp)$/i.test(nome)) ambiente[nome] = valor;
  }
  Object.assign(ambiente, {
    NODE_ENV: 'development', PORTA: String(porta), ENVIADOR_MENSAGEM: 'log',
    DATABASE_URL: 'postgresql://ficticio:ficticio@127.0.0.1:1/escuta_test',
    JWT_SEGREDO: 'j'.repeat(32), CODIGO_HMAC_SEGREDO: 'h'.repeat(32),
  });
  processo = fork(new URL('../src/server.ts', import.meta.url), [], {
    execArgv: ['--import', 'tsx'], env: ambiente, silent: true, windowsHide: true,
  });
  processo.stdout!.resume();
  let diagnostico = '';
  processo.stderr!.on('data', (dados: Buffer) => { diagnostico = (diagnostico + dados.toString()).slice(-3_000); });
  let pronta = false;
  for (let tentativa = 0; tentativa < 60; tentativa++) {
    try {
      const resposta = await fetch(`http://127.0.0.1:${porta}/api/saude/viva`, { signal: AbortSignal.timeout(500) });
      if (resposta.status === 200) { pronta = true; break; }
    } catch { /* aguarda apenas a inicialização deste filho */ }
    if (processo.exitCode !== null) throw new Error(`API encerrou antes do ensaio: ${diagnostico}`);
    await esperar(100);
  }
  expect(pronta).toBe(true);
  // Um listener wildcard atenderia também 127.0.0.2. O listener de demo deve recusá-lo.
  await expect(fetch(`http://127.0.0.2:${porta}/api/saude/viva`, {
    signal: AbortSignal.timeout(1_000),
  })).rejects.toThrow();
}, 15_000);
