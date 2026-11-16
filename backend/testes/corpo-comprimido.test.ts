import { fork, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { request } from 'node:http';
import { setTimeout as esperar } from 'node:timers/promises';
import { brotliCompressSync, deflateSync, gzipSync, zstdCompressSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let processo: ChildProcess;
let porta: number;
let diagnostico: string;

beforeEach(async () => {
  diagnostico = '';
  // Não herdar URLs, segredos, .env, NODE_OPTIONS ou instrumentação do runner.
  const ambiente: NodeJS.ProcessEnv = {};
  for (const [nome, valor] of Object.entries(process.env)) {
    if (/^(path|systemroot|windir|temp|tmp)$/i.test(nome)) ambiente[nome] = valor;
  }
  ambiente.NODE_ENV = 'test';
  processo = fork(new URL('./fixtures/servidor-corpo-comprimido.ts', import.meta.url), [], {
    execArgv: ['--import', 'tsx'], env: ambiente, silent: true, windowsHide: true,
  });
  processo.stderr!.on('data', (dados: Buffer) => { diagnostico = (diagnostico + dados.toString()).slice(-4_000); });
  processo.stdout!.resume();
  porta = await new Promise<number>((resolve, reject) => {
    const prazo = setTimeout(() => reject(new Error(`fixture não iniciou: ${diagnostico}`)), 10_000);
    const limpar = () => {
      clearTimeout(prazo);
      processo.off('error', falhou);
      processo.off('exit', encerrou);
    };
    const falhou = (erro: Error) => { limpar(); reject(erro); };
    const encerrou = (codigo: number | null) => falhou(new Error(`fixture encerrou (${codigo}): ${diagnostico}`));
    processo.once('error', falhou);
    processo.once('exit', encerrou);
    processo.once('message', (mensagem: unknown) => {
      limpar();
      if (typeof mensagem !== 'object' || mensagem === null || !('porta' in mensagem)
        || typeof mensagem.porta !== 'number') return reject(new Error('porta inválida na fixture'));
      resolve(mensagem.porta);
    });
  });
}, 15_000);

afterEach(async () => {
  if (!processo || processo.exitCode !== null || processo.signalCode !== null) return;
  const encerramento = once(processo, 'exit');
  let prazo: ReturnType<typeof setTimeout> | undefined;
  try {
    if (!processo.kill()) throw new Error('não foi possível encerrar a fixture');
    await Promise.race([
      encerramento,
      new Promise<never>((_resolve, reject) => {
        prazo = setTimeout(() => {
          processo.kill('SIGKILL');
          reject(new Error('fixture excedeu o prazo de encerramento'));
        }, 3_000);
      }),
    ]);
  } finally {
    clearTimeout(prazo);
  }
});

type Resposta = { status: number; corpo: { erro?: { codigo: string }; viva?: boolean } };

function enviar(corpo?: Buffer, cabecalhos: Record<string, string> = {}): Promise<Resposta> {
  return new Promise((resolve, reject) => {
    const pedido = request({
      host: '127.0.0.1', port: porta, agent: false,
      method: corpo ? 'POST' : 'GET', path: corpo ? '/api/auth/logout' : '/api/saude/viva',
      headers: corpo ? { 'Content-Type': 'application/json', 'Content-Length': String(corpo.length), ...cabecalhos } : {},
    }, (resposta) => {
      let texto = '';
      resposta.setEncoding('utf8');
      resposta.on('data', (parte: string) => { texto += parte; });
      resposta.on('error', reject);
      resposta.on('end', () => {
        try { resolve({ status: resposta.statusCode!, corpo: JSON.parse(texto) }); } catch (erro) { reject(erro); }
      });
    });
    pedido.on('error', reject);
    pedido.setTimeout(3_000, () => pedido.destroy(new Error('requisição do ensaio excedeu o prazo')));
    pedido.end(corpo);
  });
}

async function confirmarSobrevivencia() {
  // A resposta pode terminar antes de o descompressor emitir o erro tardio.
  await esperar(200);
  expect(processo.exitCode, diagnostico).toBeNull();
  expect(processo.signalCode, diagnostico).toBeNull();
  expect(await enviar()).toEqual({ status: 200, corpo: { viva: true } });
}

describe('parser HTTP no app real, sem banco', () => {
  it('continua vivo após bytes excedentes em corpo gzip, antes da autenticação', async () => {
    // GHSA-27r3-jxmh-p828: deixar bytes depois de um frame completo exercita
    // erros tardios; testar em processo separado evita derrubar o runner.
    const corpo = Buffer.concat([gzipSync(Buffer.from('{}')), Buffer.from([0]), Buffer.alloc(100 * 1024, 88)]);
    const resposta = await enviar(corpo, { 'Content-Encoding': 'gzip' });
    expect(resposta.status).toBe(401);
    expect(resposta.corpo.erro?.codigo).toBe('NAO_AUTENTICADO');
    await confirmarSobrevivencia();
  });

  it.each([
    ['identity', (corpo: Buffer) => corpo],
    ['gzip', gzipSync],
    ['deflate', deflateSync],
    ['br', brotliCompressSync],
    ['zstd', zstdCompressSync],
  ] as const)('preserva JSON válido com encoding %s e continua exigindo autenticação', async (encoding, comprimir) => {
    const resposta = await enviar(comprimir(Buffer.from('{"nome":"João"}')), { 'Content-Encoding': encoding });
    expect(resposta.status).toBe(401);
    expect(resposta.corpo.erro?.codigo).toBe('NAO_AUTENTICADO');
    await confirmarSobrevivencia();
  });

  it.each([
    ['JSON truncado', Buffer.from('{'), {}],
    ['JSON truncado em gzip', gzipSync(Buffer.from('{')), { 'Content-Encoding': 'gzip' }],
    ['limite de 100 KiB', Buffer.from(JSON.stringify({ texto: 'x'.repeat(101 * 1024) })), {}],
    ['limite após descompressão', gzipSync(Buffer.from(JSON.stringify({ texto: 'x'.repeat(101 * 1024) }))), { 'Content-Encoding': 'gzip' }],
    ['charset não suportado', Buffer.from('{}'), { 'Content-Type': 'application/json; charset=iso-8859-1' }],
    ['encoding não suportado', Buffer.from('{}'), { 'Content-Encoding': 'desconhecido' }],
  ] satisfies [string, Buffer, Record<string, string>][])('recusa %s antes da autenticação sem encerrar o processo', async (_nome, corpo, cabecalhos) => {
    const resposta = await enviar(corpo, cabecalhos);
    expect(resposta.status).toBe(400);
    expect(resposta.corpo.erro?.codigo).toBe('ENTRADA_INVALIDA');
    await confirmarSobrevivencia();
  });

  it('responde de forma controlada a gzip corrompido e permanece vivo', async () => {
    const resposta = await enviar(Buffer.from('corpo que não é gzip'), { 'Content-Encoding': 'gzip' });
    // Limitação preexistente, confirmada também em 2.3.0: o middleware traduz
    // este erro do zlib em 500. SEC-05 preserva a resposta e elimina a queda.
    expect(resposta.status).toBe(500);
    expect(resposta.corpo.erro?.codigo).toBe('ERRO_INTERNO');
    await confirmarSobrevivencia();
  });

  it.each([
    ['identity', 100 * 1024 - 1, 401], ['identity', 100 * 1024, 401], ['identity', 100 * 1024 + 1, 400],
    ['gzip', 100 * 1024 - 1, 401], ['gzip', 100 * 1024, 401], ['gzip', 100 * 1024 + 1, 400],
  ] as const)('preserva a fronteira de tamanho: %s, %i bytes', async (encoding, tamanho, status) => {
    const json = Buffer.from(JSON.stringify({ texto: 'x'.repeat(tamanho - 12) }));
    expect(json.length).toBe(tamanho);
    const resposta = await enviar(encoding === 'gzip' ? gzipSync(json) : json, { 'Content-Encoding': encoding });
    expect(resposta.status).toBe(status);
    expect(resposta.corpo.erro?.codigo).toBe(status === 400 ? 'ENTRADA_INVALIDA' : 'NAO_AUTENTICADO');
    await confirmarSobrevivencia();
  });

  it('mantém o tratamento de charset inválido em corpo comprimido com bytes excedentes', async () => {
    const corpo = Buffer.concat([gzipSync(Buffer.from('{}')), Buffer.from([0]), Buffer.alloc(100 * 1024, 88)]);
    const resposta = await enviar(corpo, {
      'Content-Encoding': 'gzip', 'Content-Type': 'application/json; charset=utf-999',
    });
    expect(resposta.status).toBe(400);
    expect(resposta.corpo.erro?.codigo).toBe('ENTRADA_INVALIDA');
    await confirmarSobrevivencia();
  });
});
