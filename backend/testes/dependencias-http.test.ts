import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import express from 'express';
import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { criarMiddlewareDeErro } from '../src/compartilhado/middleware-de-erro.ts';

const app = express();
app.use(express.json());
app.post('/eco', (req, res) => res.json({ corpo: req.body ?? null }));
app.use(criarMiddlewareDeErro(pino({ level: 'silent' })));

async function enviarGzip(corpo: string) {
  const servidor = app.listen(0, '127.0.0.1');
  try {
    await once(servidor, 'listening');
    const endereco = servidor.address();
    if (!endereco || typeof endereco === 'string') throw new Error('Porta de teste indisponível');
    // Superagent serializa Buffer como JSON quando o Content-Type é application/json.
    const resposta = await fetch(`http://127.0.0.1:${endereco.port}/eco`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
      body: gzipSync(corpo), signal: AbortSignal.timeout(3000),
    });
    return { status: resposta.status, body: await resposta.json() };
  } finally {
    await new Promise<void>((resolve, reject) => servidor.close((erro) => erro ? reject(erro) : resolve()));
  }
}

describe('contrato HTTP após atualização do body-parser', () => {
  it('preserva objetos aninhados, arrays e campos inesperados para a validação posterior', async () => {
    const corpo = { nome: 'Teste sintético', extra: true, itens: [{ valores: [1, null, 'á'] }] };
    const resposta = await request(app).post('/eco').send(corpo);
    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({ corpo });
  });

  it.each(['{"nome":', 'null', '42', '"texto"'])('traduz JSON inválido ou primitivo em ENTRADA_INVALIDA: %s', async (corpo) => {
    const resposta = await request(app).post('/eco').type('json').send(corpo);
    expect(resposta.status).toBe(400);
    expect(resposta.body).toEqual({ erro: { codigo: 'ENTRADA_INVALIDA', mensagem: 'Dados inválidos.', campos: [] } });
  });

  it('ignora corpo com Content-Type não JSON', async () => {
    const resposta = await request(app).post('/eco').type('text').send('{"nome":"Teste"}');
    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({ corpo: null });
  });

  it('mantém o limite padrão de 100 KiB e o contrato HTTP 400', async () => {
    const resposta = await request(app).post('/eco').send({ texto: 'x'.repeat(102_400) });
    expect(resposta.status).toBe(400);
    expect(resposta.body.erro.codigo).toBe('ENTRADA_INVALIDA');
  });

  it('aceita JSON gzip válido', async () => {
    const resposta = await enviarGzip('{"valor":1}');
    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({ corpo: { valor: 1 } });
  });

  it('aplica o limite também ao tamanho descomprimido', async () => {
    const resposta = await enviarGzip(JSON.stringify({ texto: 'x'.repeat(102_400) }));
    expect(resposta.status).toBe(400);
    expect(resposta.body.erro.codigo).toBe('ENTRADA_INVALIDA');
  });

  it.each([
    ['Content-Type', 'application/json; charset=iso-8859-1'],
    ['Content-Encoding', 'formato-inexistente'],
  ])('traduz formato não suportado em ENTRADA_INVALIDA: %s', async (cabecalho, valor) => {
    const resposta = await request(app).post('/eco').type('json').set(cabecalho, valor).send('{}');
    expect(resposta.status).toBe(400);
    expect(resposta.body.erro.codigo).toBe('ENTRADA_INVALIDA');
  });

  it.each(['deflate', 'gzip'])('consome bytes tardios após %s sem encerrar o processo', (encoding) => {
    // Um subprocesso protege o runner da exceção assíncrona do GHSA-27r3-jxmh-p828.
    // Enviar o restante só depois do parsing torna a intercalação determinística.
    const programa = `
      const express = require('express');
      const http = require('node:http');
      const { deflateSync, gzipSync } = require('node:zlib');
      const app = express();
      const comprimir = '${encoding}' === 'gzip' ? gzipSync : deflateSync;
      const primeiro = Buffer.concat([comprimir('{"valor":1}'), Buffer.from([0])]);
      const restante = Buffer.alloc(1024, 0x58);
      let cliente;
      app.use(express.json());
      app.post('/', (req, res) => {
        req.once('end', () => res.json(req.body));
        cliente.end(restante);
      });
      const servidor = app.listen(0, '127.0.0.1', () => {
        cliente = http.request({
          host: '127.0.0.1', port: servidor.address().port, method: 'POST', agent: false,
          headers: { 'Content-Type': 'application/json', 'Content-Encoding': '${encoding}',
            'Content-Length': primeiro.length + restante.length }
        }, (resposta) => {
          let corpo = '';
          resposta.on('data', parte => corpo += parte);
          resposta.on('end', () => {
            if (resposta.statusCode !== 200 || corpo !== '{"valor":1}') process.exitCode = 2;
            servidor.close();
          });
        });
        cliente.setTimeout(2000, () => cliente.destroy(new Error('Corpo HTTP não terminou')));
        cliente.on('error', () => { process.exitCode = 3; servidor.close(); });
        cliente.write(primeiro);
      });
    `;
    const resultado = spawnSync(process.execPath, ['-e', programa], {
      cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8', timeout: 5000,
    });
    expect(resultado.error).toBeUndefined();
    expect(resultado.status, resultado.stderr).toBe(0);
  });
});
