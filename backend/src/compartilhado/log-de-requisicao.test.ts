import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { criarContextoDeTeste } from '../../testes/contexto-de-teste.ts';
import { criarApp } from '../app.ts';
import { criarLogger } from './logger.ts';

const linhasDeLog: string[] = [];
const contexto = { ...criarContextoDeTeste(), logger: criarLogger({ write: (linha: string) => linhasDeLog.push(linha) }) };
afterAll(() => contexto.prisma.$disconnect());

describe('log de requisição', () => {
  it('não grava a query string, que pode trazer CPF na busca de pacientes', async () => {
    await request(criarApp(contexto)).get('/api/pacientes?busca=52998224725');

    const saida = linhasDeLog.join('');
    expect(saida).toContain('/api/pacientes');
    expect(saida).not.toContain('52998224725');
    expect(saida).not.toContain('busca');
  });
});
