import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarContextoDeTeste } from '../testes/contexto-de-teste.ts';
import { criarFuncionario, criarPaciente, tokenDe } from '../testes/fabricas.ts';
import { criarApp } from './app.ts';
import type { Cliente, Funcionario } from './generated/prisma/client.ts';
import { MODULOS_DOCUMENTADOS } from './modulos-documentados.ts';

// #5 (D10, D39): rota × papel com o status esperado. A expectativa vem do docs/api.md (colunas "Quem"), o
// docs/matriz-de-papeis.md é a mesma tabela para gente ler, e o teste falha se os três — contrato, documento e código —
// divergirem em qualquer papel de qualquer rota.
const contexto = criarContextoDeTeste();
const app = criarApp(contexto);
afterAll(() => contexto.prisma.$disconnect());

const PERSONAS = ['anonimo', 'R', 'R-admin', 'D', 'C'] as const;
type Persona = (typeof PERSONAS)[number];
type Esperado = '401' | '403' | 'ok';

const lerDoc = (arquivo: string) => readFileSync(new URL(`../../docs/${arquivo}`, import.meta.url), 'utf8');
// Parâmetros de rota com nomes diferentes no api.md ({id}) e no Express (:id) viram o mesmo marcador.
const normalizar = (rota: string) => rota.replace(/\{[^}]+\}|:[A-Za-z]+/g, ':p').replace(/\/$/, '');

// Quem pode, pelo api.md: "R, D (os próprios)" → R e R-admin (admin é flag somada à categoria; a R-admin aqui é
// recepcionista) e D; "A" → só R-admin; "qualquer logado" → todos.
function personasDoTexto(quem: string): Persona[] {
  if (/qualquer logado/.test(quem)) return ['R', 'R-admin', 'D', 'C'];
  const papeis = new Set(quem.match(/\b[RDAC]\b/g));
  return (['R', 'R-admin', 'D', 'C'] as const).filter((persona) =>
    persona === 'R-admin' ? papeis.has('R') || papeis.has('A') : papeis.has(persona),
  );
}

function matrizDoContrato(): Map<string, Record<Persona, Esperado>> {
  const matriz = new Map<string, Record<Persona, Esperado>>();
  const linha = (permitidos: Persona[] | 'publica') =>
    Object.fromEntries(PERSONAS.map((persona) => {
      if (permitidos === 'publica') return [persona, 'ok'];
      if (persona === 'anonimo') return [persona, '401'];
      return [persona, permitidos.includes(persona) ? 'ok' : '403'];
    })) as Record<Persona, Esperado>;
  const contrato = lerDoc('api.md');
  // Autenticação não tem tabela: "Todas as rotas abaixo são públicas, exceto logout e eu".
  const secaoDeAuth = contrato.slice(contrato.indexOf('## Autenticação'), contrato.indexOf('## Pacientes'));
  for (const [, metodo, caminho] of secaoDeAuth.matchAll(/`(GET|POST) (\/api\/auth\/[^`\s]+)`/g)) {
    matriz.set(`${metodo} ${normalizar(caminho!)}`, linha(/\/(logout|eu)$/.test(caminho!) ? ['R', 'R-admin', 'D', 'C'] : 'publica'));
  }
  for (const [, metodo, caminho, quem] of contrato.matchAll(/^\|\s*`(GET|POST|PUT|PATCH|DELETE) (\/api[^`?]*)(?:\?[^`]*)?`\s*\|\s*([^|]+)\|/gm)) {
    matriz.set(`${metodo} ${normalizar(caminho!)}`, linha(personasDoTexto(quem!)));
  }
  return matriz;
}

const SIMBOLO: Record<string, Esperado> = { '✓': 'ok', '401': '401', '403': '403' };

function matrizDoDocumento(): Map<string, Record<Persona, Esperado>> {
  const matriz = new Map<string, Record<Persona, Esperado>>();
  for (const [, metodo, caminho, celulas] of lerDoc('matriz-de-papeis.md').matchAll(/^\|\s*`(GET|POST|PUT|PATCH|DELETE) ([^`]+)`\s*\|(.+)\|\s*$/gm)) {
    const valores = celulas!.split('|').map((celula) => SIMBOLO[celula.trim()]);
    matriz.set(`${metodo} ${normalizar(caminho!)}`, Object.fromEntries(PERSONAS.map((persona, indice) => [persona, valores[indice]])) as Record<Persona, Esperado>);
  }
  return matriz;
}

const rotasDoCodigo = MODULOS_DOCUMENTADOS.flatMap(({ documentado }) =>
  documentado.rotas.map((rota) => ({ metodo: rota.metodo.toUpperCase(), caminho: `${documentado.prefixo}${rota.caminho === '/' ? '' : rota.caminho}` })),
);
const contrato = matrizDoContrato();
const documento = matrizDoDocumento();

describe('matriz de papéis: contrato, documento e código', () => {
  it('o contrato tem as 43 rotas registradas no código, nem uma a mais', () => {
    expect([...contrato.keys()].sort()).toEqual(rotasDoCodigo.map(({ metodo, caminho }) => `${metodo} ${normalizar(caminho)}`).sort());
    expect(contrato.size).toBe(43);
  });

  it('docs/matriz-de-papeis.md é o api.md em forma de tabela', () => {
    expect(Object.fromEntries(documento)).toEqual(Object.fromEntries(contrato));
  });
});

describe('cada rota responde ao papel como o contrato manda', () => {
  const contas: Partial<Record<Exclude<Persona, 'anonimo'>, Funcionario | Cliente>> = {};
  beforeAll(async () => {
    contas.R = await criarFuncionario(contexto);
    contas['R-admin'] = await criarFuncionario(contexto, { isAdmin: true });
    contas.D = await criarFuncionario(contexto, { categoria: 'DENTISTA' });
    contas.C = await criarPaciente(contexto, {}, { comLogin: true });
  });

  const casos = rotasDoCodigo.flatMap(({ metodo, caminho }) =>
    PERSONAS.map((persona) => ({ metodo, caminho, persona, esperado: contrato.get(`${metodo} ${normalizar(caminho)}`)?.[persona] })),
  );

  it.each(casos)('$metodo $caminho como $persona → $esperado', async ({ metodo, caminho, persona, esperado }) => {
    const url = caminho.replace(/:[A-Za-z]+/g, () => randomUUID());
    let pedido = request(app)[metodo.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete'](url);
    if (persona !== 'anonimo') pedido = pedido.set('Authorization', `Bearer ${await tokenDe(contexto, contas[persona]!)}`);

    const resposta = await (['POST', 'PUT', 'PATCH'].includes(metodo) ? pedido.send({}) : pedido);

    if (esperado === '401') {
      expect(resposta.status).toBe(401);
      expect(resposta.body.erro.codigo).toBe('NAO_AUTENTICADO');
    } else if (esperado === '403') {
      expect(resposta.status).toBe(403);
      expect(resposta.body.erro.codigo).toBe('SEM_PERMISSAO');
    } else if (caminho === '/api/auth/refresh') {
      // Pública, mas a sessão vem do cookie de refresh, que nenhum papel mandou aqui.
      expect(resposta.status).toBe(401);
    } else {
      expect(resposta.status).not.toBe(401);
      expect(resposta.body?.erro?.codigo).not.toBe('SEM_PERMISSAO');
    }
  });
});
