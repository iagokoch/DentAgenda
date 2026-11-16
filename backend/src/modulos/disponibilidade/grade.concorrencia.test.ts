import request from 'supertest';
import { setTimeout as esperar } from 'node:timers/promises';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { criarContextoDeTeste } from '../../../testes/contexto-de-teste.ts';
import { criarFuncionario, tokenDe } from '../../../testes/fabricas.ts';
import { criarApp } from '../../app.ts';
import * as travas from '../../compartilhado/travas.ts';

const contexto = criarContextoDeTeste();
const app = criarApp(contexto);
afterAll(() => contexto.prisma.$disconnect());

async function dentroDoPrazo<T>(promessa: Promise<T>, etapa: string): Promise<T> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promessa, new Promise<never>((_resolve, reject) => {
      temporizador = setTimeout(() => reject(new Error(`Prazo excedido: ${etapa}`)), 3_000);
    })]);
  } finally {
    clearTimeout(temporizador);
  }
}

describe('PUT /api/dentistas/{id}/grade em paralelo', () => {
  it('dois PUT simultâneos bem-sucedidos deixam uma grade completa, com o segundo aguardando a trava', async () => {
    const admin = await criarFuncionario(contexto, { isAdmin: true });
    const token = await tokenDe(contexto, admin);
    const dentista = await criarFuncionario(contexto, { categoria: 'DENTISTA' });
    const propostas = [
      [{ diaSemana: 1, inicio: '08:00', fim: '12:00' }, { diaSemana: 3, inicio: '13:00', fim: '17:00' }],
      [{ diaSemana: 2, inicio: '09:00', fim: '11:00' }, { diaSemana: 4, inicio: '14:00', fim: '18:00' }],
    ];
    const adquirida = Promise.withResolvers<void>();
    const segundaIniciada = Promise.withResolvers<number>();
    const liberar = Promise.withResolvers<void>();
    const travar = travas.travarDentistas;
    let chamadas = 0;
    let pidPrimeiro: number | undefined;
    let segundaConcluiu = false;
    let interromperEspera = false;
    const interceptacao = vi.spyOn(travas, 'travarDentistas').mockImplementation(async (tx, ids) => {
      const primeira = ++chamadas === 1;
      const conexoes = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      const pid = conexoes[0]?.pid;
      if (pid === undefined) throw new Error('Conexão transacional sem PID');
      if (primeira) pidPrimeiro = pid;
      else segundaIniciada.resolve(pid);
      await travar(tx, ids);
      if (primeira) {
        adquirida.resolve();
        await liberar.promise;
      }
    });
    const gravar = (grade: typeof propostas[number]) =>
      request(app)
        .put(`/api/dentistas/${dentista.id}/grade`)
        .set({ Authorization: `Bearer ${token}` })
        .send(grade)
        .then((resposta) => ({ resposta }), (erro: unknown) => ({ erro }));

    // .then inicia o pedido Supertest imediatamente; apenas guardar o thenable
    // e aguardar uma barreira antes de consumi-lo deixaria o teste parado.
    const primeira = gravar(propostas[0]!);
    let segunda: ReturnType<typeof gravar> | undefined;
    try {
      await dentroDoPrazo(adquirida.promise, 'primeiro PUT adquirir a trava');
      segunda = gravar(propostas[1]!).then((resultado) => { segundaConcluiu = true; return resultado; });
      const pidSegundo = await dentroDoPrazo(segundaIniciada.promise, 'segundo PUT alcançar a trava');
      // A entrada na função não prova espera: observar o lock real evita depender
      // de um sleep ou serializar artificialmente os dois pedidos no harness.
      await dentroDoPrazo((async () => {
        while (!interromperEspera) {
          const observacao = await contexto.prisma.$queryRaw<{ bloqueadores: number[] }[]>`
            SELECT pg_blocking_pids(${pidSegundo}::int) AS bloqueadores`;
          if (observacao[0]?.bloqueadores.includes(pidPrimeiro!)) return;
          if (segundaConcluiu) throw new Error('Segundo PUT terminou sem aguardar a primeira transação');
          await esperar(10);
        }
      })(), 'PostgreSQL comprovar bloqueio do segundo PUT');
      expect(segundaConcluiu).toBe(false);
      liberar.resolve();
      const resultados = await dentroDoPrazo(Promise.all([primeira, segunda]), 'ambos os PUT terminarem');
      for (const resultado of resultados) {
        if ('erro' in resultado) throw resultado.erro;
        expect(resultado.resposta.status, JSON.stringify(resultado.resposta.body)).toBe(200);
        expect(resultado.resposta.body.erro).toBeUndefined();
        expect(resultado.resposta.body.consultasForaDaGrade).toEqual([]);
        expect(propostas).toContainEqual(resultado.resposta.body.grade);
      }
      const faixas = await contexto.prisma.gradeHorario.findMany({
        where: { dentistaId: dentista.id }, orderBy: [{ diaSemana: 'asc' }, { inicio: 'asc' }],
      });
      const grade = faixas.map(({ diaSemana, inicio, fim }) => ({
        diaSemana, inicio: inicio.toISOString().slice(11, 16), fim: fim.toISOString().slice(11, 16),
      }));
      expect(propostas).toContainEqual(grade);
      // A segunda transação só escreve depois do commit da primeira.
      expect(grade).toEqual(propostas[1]);
    } finally {
      interromperEspera = true;
      liberar.resolve();
      try {
        await dentroDoPrazo(Promise.allSettled([primeira, ...(segunda ? [segunda] : [])]), 'drenar pedidos no cleanup');
      } finally {
        interceptacao.mockRestore();
      }
    }
  }, 15_000);
});
