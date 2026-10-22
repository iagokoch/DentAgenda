import type { Router } from 'express';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { criarContextoDeTeste } from '../../testes/contexto-de-teste.ts';
import { criarApp } from '../app.ts';
import { MODULOS_DOCUMENTADOS } from '../modulos-documentados.ts';

const contexto = criarContextoDeTeste();
afterAll(() => contexto.prisma.$disconnect());

// As 43 rotas de docs/api.md, na forma "METODO /caminho/{parametro}".
const ROTAS_DO_API_MD = [
  'POST /api/auth/cliente/login',
  'POST /api/auth/funcionario/login',
  'POST /api/auth/refresh',
  'POST /api/auth/logout',
  'GET /api/auth/eu',
  'POST /api/auth/cliente/recuperacao/codigo',
  'POST /api/auth/funcionario/recuperacao/codigo',
  'POST /api/auth/cliente/recuperacao/confirmar',
  'POST /api/auth/funcionario/recuperacao/confirmar',
  'POST /api/auth/cliente/cadastro/codigo',
  'POST /api/auth/cliente/cadastro/confirmar',
  'GET /api/pacientes',
  'POST /api/pacientes',
  'GET /api/pacientes/{id}',
  'PATCH /api/pacientes/{id}',
  'PUT /api/pacientes/{id}/endereco',
  'DELETE /api/pacientes/{id}/endereco',
  'GET /api/pacientes/{id}/alertas',
  'POST /api/pacientes/{id}/alertas',
  'DELETE /api/pacientes/{id}/alertas/{alertaId}',
  'GET /api/funcionarios',
  'POST /api/funcionarios',
  'PATCH /api/funcionarios/{id}',
  'GET /api/dentistas',
  'GET /api/procedimentos',
  'POST /api/procedimentos',
  'PATCH /api/procedimentos/{id}',
  'GET /api/dentistas/{id}/grade',
  'PUT /api/dentistas/{id}/grade',
  'POST /api/bloqueios',
  'GET /api/dentistas/{id}/bloqueios',
  'DELETE /api/bloqueios/{id}',
  'GET /api/horarios-livres',
  'GET /api/dias-disponiveis',
  'POST /api/consultas',
  'GET /api/consultas',
  'GET /api/consultas/pendentes',
  'GET /api/consultas/{id}',
  'POST /api/consultas/{id}/cancelamento',
  'POST /api/consultas/{id}/remarcacao',
  'POST /api/consultas/{id}/realizacao',
  'PUT /api/consultas/{id}/observacao',
  'GET /api/consultas/{id}/observacao/historico',
].sort();

type DocumentoOpenApi = {
  openapi: string;
  paths: Record<string, Record<string, { security?: unknown[]; parameters?: { name: string; in: string }[]; requestBody?: unknown }>>;
};

// Os tipos do Express 5 não declaram `methods`, mas a rota o tem em tempo de execução.
type RotaDoRouter = { path: string; methods: Record<string, boolean> };

function rotasRegistradasEm(router: Router): string[] {
  return router.stack
    .flatMap((camada) => (camada.route ? [camada.route as unknown as RotaDoRouter] : []))
    .flatMap((rota) => Object.keys(rota.methods).map((metodo) => `${metodo.toUpperCase()} ${rota.path}`))
    .sort();
}

async function lerDocumento(): Promise<DocumentoOpenApi> {
  const resposta = await request(criarApp(contexto)).get('/api/docs.json');
  expect(resposta.status).toBe(200);
  return resposta.body;
}

describe('documentação OpenAPI (D23, D34)', () => {
  it('GET /api/docs.json fora de produção → 200 com todas as rotas do api.md', async () => {
    const documento = await lerDocumento();

    const rotas = Object.entries(documento.paths)
      .flatMap(([caminho, metodos]) => Object.keys(metodos).map((metodo) => `${metodo.toUpperCase()} ${caminho}`))
      .sort();

    expect(documento.openapi).toMatch(/^3\.0/);
    expect(rotas).toEqual(ROTAS_DO_API_MD);
  });

  it('GET /api/docs fora de produção → 200 HTML', async () => {
    const resposta = await request(criarApp(contexto)).get('/api/docs/');

    expect(resposta.status).toBe(200);
    expect(resposta.headers['content-type']).toMatch(/text\/html/);
  });

  it('com NODE_ENV=production, /api/docs e /api/docs.json → 404 NAO_ENCONTRADO', async () => {
    const emProducao = criarApp({ ...contexto, config: { ...contexto.config, nodeEnv: 'production' } });

    for (const caminho of ['/api/docs', '/api/docs/', '/api/docs.json']) {
      const resposta = await request(emProducao).get(caminho);
      expect(resposta.status, caminho).toBe(404);
      expect(resposta.body.erro.codigo).toBe('NAO_ENCONTRADO');
    }
  });

  it('as rotas documentadas são exatamente as registradas nos routers', () => {
    for (const { documentado, criarRotas } of MODULOS_DOCUMENTADOS) {
      const registradas = rotasRegistradasEm(criarRotas(contexto));
      const documentadas = documentado.rotas.map((rota) => `${rota.metodo.toUpperCase()} ${rota.caminho}`).sort();

      expect(documentadas, documentado.prefixo).toEqual(registradas);
    }
  });

  it('rota pública não pede token; as demais pedem', async () => {
    const documento = await lerDocumento();

    expect(documento.paths['/api/auth/cliente/login']!.post!.security).toEqual([]);
    expect(documento.paths['/api/auth/refresh']!.post!.security).toEqual([]);
    expect(documento.paths['/api/consultas']!.post!.security).toEqual([{ bearerAuth: [] }]);
    expect(documento.paths['/api/auth/eu']!.get!.security).toEqual([{ bearerAuth: [] }]);
  });

  it('parâmetros de caminho, de consulta e corpo vêm dos schemas Zod', async () => {
    const documento = await lerDocumento();

    const cancelamento = documento.paths['/api/consultas/{id}/cancelamento']!.post!;
    expect(cancelamento.parameters).toContainEqual(expect.objectContaining({ name: 'id', in: 'path' }));
    expect(cancelamento.requestBody).toBeDefined();

    const horarios = documento.paths['/api/horarios-livres']!.get!;
    const nomes = horarios.parameters!.filter((parametro) => parametro.in === 'query').map((parametro) => parametro.name);
    expect(nomes).toEqual(expect.arrayContaining(['procedimentoId', 'data']));
    expect(horarios.requestBody).toBeUndefined();
  });
});
