import { randomBytes } from 'node:crypto';
import express from 'express';
import { criarApp } from '../../src/app.ts';
import { carregarConfig } from '../../src/config/env.ts';
import { criarPrisma } from '../../src/compartilhado/banco.ts';
import { criarLogger } from '../../src/compartilhado/logger.ts';
import { gerarHashDeSenha } from '../../src/compartilhado/senhas.ts';
import { gerarDadosDeCarga, validarBancoDeCarga } from '../performance/dados-ficticios.ts';
import { gravarDadosDeCarga } from '../performance/semear.ts';

async function executar() {
  if (!process.send) throw new Error('Execute pelo runner descartável.');
  const url = validarBancoDeCarga(process.env.DATABASE_URL, process.env.NODE_ENV);
  const config = carregarConfig(process.env);
  const prisma = criarPrisma(url);
  const [destino] = await prisma.$queryRaw<{ banco: string }[]>`SELECT current_database() AS banco`;
  if (destino?.banco !== 'dentagenda_break_it_performance_test') throw new Error('Banco real não autorizado.');
  const senha = randomBytes(24).toString('base64url');
  const dados = gerarDadosDeCarga({ dentistas: 1, pacientes: 10, consultas: 20 });
  await gravarDadosDeCarga(prisma, dados, await gerarHashDeSenha(senha));
  const contexto = {
    prisma, config,
    logger: criarLogger(undefined, 'silent'),
    relogio: { agora: () => new Date('2029-12-01T12:00:00Z') },
    enviador: { enviar: async () => { throw new Error('Envio externo desativado na carga.'); } },
  };
  const comprovante = randomBytes(16).toString('hex');
  const app = express();
  app.get('/__break_it/isolamento', (_req, res) => res.json({ comprovante, banco: destino.banco }));
  app.use(criarApp(contexto));
  const servidor = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    servidor.once('listening', resolve);
    servidor.once('error', reject);
  });
  const endereco = servidor.address();
  if (!endereco || typeof endereco === 'string') throw new Error('Porta local indisponível.');
  const baseUrl = `http://127.0.0.1:${endereco.port}`;
  const resposta = await fetch(`${baseUrl}/api/auth/funcionario/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'carga.recepcao@exemplo.invalid', senha }),
    signal: AbortSignal.timeout(10_000),
  });
  if (resposta.status !== 200) throw new Error('Login sintético recusado.');
  const sessao = await resposta.json() as { accessToken?: string };
  if (!sessao.accessToken) throw new Error('Sessão sintética ausente.');
  process.send({
    baseUrl, comprovante, accessToken: sessao.accessToken,
    dentistaId: dados.dentistas[0]!.id, procedimentoId: dados.procedimento.id,
    consultaId: dados.consultas[0]!.id, data: '2030-01-07',
  });
  let encerrando = false;
  const encerrar = async () => {
    if (encerrando) return;
    encerrando = true;
    await new Promise<void>((resolve) => servidor.close(() => resolve()));
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('message', (mensagem) => { if (mensagem === 'encerrar') void encerrar(); });
  process.on('disconnect', () => { void encerrar(); });
  process.on('SIGTERM', () => { void encerrar(); });
  setTimeout(() => { void encerrar(); }, 120_000).unref();
}

executar().catch(() => {
  // Exceções do driver podem conter dados da conexão; o runner recebe apenas o estado.
  process.send?.({ erro: 'API sintética não iniciou; confira migrations e pré-requisitos.' });
  process.exit(1);
});
