import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { criarContextoDeTeste } from '../../../testes/contexto-de-teste.ts';
import { criarFuncionario, tokenDe } from '../../../testes/fabricas.ts';
import { criarApp } from '../../app.ts';

const contexto = criarContextoDeTeste();
const app = criarApp(contexto);
afterAll(() => contexto.prisma.$disconnect());

describe('PUT /api/dentistas/{id}/grade em paralelo', () => {
  it('dois PUT simultâneos deixam a grade de um deles, nunca a soma das duas', async () => {
    const admin = await criarFuncionario(contexto, { isAdmin: true });
    const token = await tokenDe(contexto, admin);
    const gravar = (dentistaId: string, diaSemana: number) =>
      request(app)
        .put(`/api/dentistas/${dentistaId}/grade`)
        .set({ Authorization: `Bearer ${token}` })
        .send([{ diaSemana, inicio: '08:00', fim: '12:00' }]);

    // Dentista novo por rodada: sem linhas antigas, o deleteMany não serializa os dois pedidos sozinho.
    for (let rodada = 0; rodada < 5; rodada++) {
      const dentista = await criarFuncionario(contexto, { categoria: 'DENTISTA' });

      await Promise.all([gravar(dentista.id, 1), gravar(dentista.id, 2)]);

      const faixas = await contexto.prisma.gradeHorario.findMany({ where: { dentistaId: dentista.id } });
      expect(faixas).toHaveLength(1);
    }
  });
});
