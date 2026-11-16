import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarContextoDeTeste } from '../testes/contexto-de-teste.ts';
import { criarConsultaNoBanco, criarFuncionario, criarPaciente, criarProcedimento, gerarCpfValido, tokenDe } from '../testes/fabricas.ts';
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

type Cenario = {
  nome: string;
  status: number;
  codigo?: string;
  preparar: (persona: Persona) => Promise<{ url: string; corpo?: object; consulta?: Record<string, string>; cabecalhos?: Record<string, string> }>;
};
const contas: Partial<Record<Exclude<Persona, 'anonimo'>, Funcionario | Cliente>> = {};
const simples = (url: string, status = 200, corpo?: object): Cenario => ({
  nome: 'entrada válida e recurso acessível', status, preparar: async () => ({ url, corpo }),
});
let numeroDaAgenda = 0;

async function prepararAgenda(persona: Persona, comConsulta = false, passada = false) {
  const paciente = persona === 'C' ? contas.C as Cliente : await criarPaciente(contexto);
  const dentista = persona === 'D' ? contas.D as Funcionario : await criarFuncionario(contexto, { categoria: 'DENTISTA' });
  const procedimento = await criarProcedimento(contexto);
  // Cada cenário tem horário próprio, inclusive quando usa a mesma conta C/D.
  const inicio = passada ? new Date('2026-10-05T10:00:00Z') : new Date(Date.UTC(2026, 9, 12 + numeroDaAgenda++, 12));
  await contexto.prisma.gradeHorario.deleteMany({ where: { dentistaId: dentista.id } });
  await contexto.prisma.gradeHorario.createMany({ data: Array.from({ length: 7 }, (_, diaSemana) => ({
    dentistaId: dentista.id, diaSemana, inicio: new Date('1970-01-01T08:00:00Z'), fim: new Date('1970-01-01T18:00:00Z'),
  })) });
  const consulta = comConsulta ? await criarConsultaNoBanco(contexto, {
    clienteId: paciente.id, dentistaId: dentista.id, procedimentoId: procedimento.id, inicio,
  }) : undefined;
  return { paciente, dentista, procedimento, inicio, consulta };
}

function cenarioPaciente(caminho: string, status: number, corpo?: object): Cenario {
  return { nome: 'paciente existente e próprio quando C', status, preparar: async (persona) => {
    const paciente = persona === 'C' ? contas.C as Cliente : await criarPaciente(contexto);
    let url = caminho.replace(':id', paciente.id);
    if (url.includes(':alertaId')) {
      const alerta = await contexto.prisma.alertaCliente.create({ data: {
        clienteId: paciente.id, texto: 'Alerta da matriz', autor: 'CLINICA',
        autorFuncionarioId: (contas.R as Funcionario).id, criadoEm: contexto.relogio.agora(),
      } });
      url = url.replace(':alertaId', alerta.id);
    }
    if (caminho.endsWith('/endereco') && corpo === undefined) {
      await contexto.prisma.enderecoCliente.upsert({
        where: { clienteId: paciente.id }, create: { clienteId: paciente.id, ...ENDERECO }, update: ENDERECO,
      });
    }
    return { url, corpo };
  } };
}

const ENDERECO = { cep: '89010000', logradouro: 'Rua de Teste', numero: '12', bairro: 'Centro', cidade: 'Blumenau', uf: 'SC' };
const cenarios: Record<string, Cenario> = {
  'POST /api/auth/refresh': {
    nome: 'negativo explícito: refresh sem cookie', status: 401, codigo: 'NAO_AUTENTICADO',
    preparar: async () => ({ url: '/api/auth/refresh', cabecalhos: { 'X-DentAgenda-Refresh': '1' } }),
  },
  'POST /api/auth/logout': simples('/api/auth/logout', 204),
  'GET /api/auth/eu': simples('/api/auth/eu'),
  'GET /api/pacientes': simples('/api/pacientes'),
  'POST /api/pacientes': { nome: 'cadastro válido e CPF novo', status: 201, preparar: async () => ({
    url: '/api/pacientes', corpo: { nome: 'Paciente da matriz', cpf: gerarCpfValido(), telefone: '47999998888' },
  }) },
  'GET /api/pacientes/:id': cenarioPaciente('/api/pacientes/:id', 200),
  'PATCH /api/pacientes/:id': cenarioPaciente('/api/pacientes/:id', 200, { convenio: 'Convênio da matriz' }),
  'PUT /api/pacientes/:id/endereco': cenarioPaciente('/api/pacientes/:id/endereco', 200, ENDERECO),
  'DELETE /api/pacientes/:id/endereco': cenarioPaciente('/api/pacientes/:id/endereco', 204),
  'GET /api/pacientes/:id/alertas': cenarioPaciente('/api/pacientes/:id/alertas', 200),
  'POST /api/pacientes/:id/alertas': cenarioPaciente('/api/pacientes/:id/alertas', 201, { texto: 'Alerta da matriz' }),
  'DELETE /api/pacientes/:id/alertas/:alertaId': cenarioPaciente('/api/pacientes/:id/alertas/:alertaId', 204),
  'GET /api/funcionarios': simples('/api/funcionarios'),
  'POST /api/funcionarios': { nome: 'funcionário válido com identificadores novos', status: 201, preparar: async () => ({
    url: '/api/funcionarios', corpo: { nome: 'Funcionário da matriz', cpf: gerarCpfValido(),
      email: `${randomUUID()}@exemplo.com`, categoria: 'RECEPCIONISTA', dataInicio: '2026-10-05' },
  }) },
  'PATCH /api/funcionarios/:id': { nome: 'edição de funcionário existente', status: 200, preparar: async () => ({
    url: `/api/funcionarios/${(await criarFuncionario(contexto)).id}`, corpo: { nome: 'Nome editado' },
  }) },
  'GET /api/dentistas': simples('/api/dentistas'),
  'GET /api/procedimentos': simples('/api/procedimentos'),
  'POST /api/procedimentos': simples('/api/procedimentos', 201, { nome: 'Procedimento da matriz', duracaoMinutos: 60, precoCentavos: 18000 }),
  'PATCH /api/procedimentos/:id': { nome: 'edição de procedimento existente', status: 200, preparar: async () => ({
    url: `/api/procedimentos/${(await criarProcedimento(contexto)).id}`, corpo: { nome: 'Procedimento editado' },
  }) },
  'GET /api/dentistas/:id/grade': { nome: 'grade do próprio dentista quando D', status: 200, preparar: async (persona) => ({
    url: `/api/dentistas/${(await prepararAgenda(persona)).dentista.id}/grade`,
  }) },
  'PUT /api/dentistas/:id/grade': { nome: 'substituição válida de grade existente', status: 200, preparar: async (persona) => ({
    url: `/api/dentistas/${(await prepararAgenda(persona)).dentista.id}/grade`, corpo: [{ diaSemana: 1, inicio: '08:00', fim: '12:00' }],
  }) },
  'GET /api/dentistas/:id/bloqueios': { nome: 'bloqueios do próprio dentista quando D', status: 200, preparar: async (persona) => ({
    url: `/api/dentistas/${(await prepararAgenda(persona)).dentista.id}/bloqueios`,
  }) },
  'POST /api/bloqueios': { nome: 'bloqueio válido do próprio dentista quando D', status: 201, preparar: async (persona) => {
    const { dentista, inicio } = await prepararAgenda(persona);
    return { url: '/api/bloqueios', corpo: { dentistaIds: [dentista.id], inicio: inicio.toISOString(), fim: new Date(+inicio + 3600000).toISOString() } };
  } },
  'DELETE /api/bloqueios/:id': { nome: 'remoção de bloqueio existente e próprio quando D', status: 204, preparar: async (persona) => {
    const { dentista, inicio } = await prepararAgenda(persona);
    const bloqueio = await contexto.prisma.bloqueio.create({ data: { dentistaId: dentista.id, inicio, fim: new Date(+inicio + 3600000) } });
    return { url: `/api/bloqueios/${bloqueio.id}` };
  } },
  'GET /api/horarios-livres': { nome: 'query válida com procedimento e dentista existentes', status: 200, preparar: async (persona) => {
    const { dentista, procedimento, inicio } = await prepararAgenda(persona);
    return { url: '/api/horarios-livres', consulta: { procedimentoId: procedimento.id, dentistaId: dentista.id, data: inicio.toISOString().slice(0, 10) } };
  } },
  'GET /api/dias-disponiveis': { nome: 'query válida com procedimento e dentista existentes', status: 200, preparar: async (persona) => {
    const { dentista, procedimento, inicio } = await prepararAgenda(persona);
    return { url: '/api/dias-disponiveis', consulta: { procedimentoId: procedimento.id, dentistaId: dentista.id, mes: inicio.toISOString().slice(0, 7) } };
  } },
  'POST /api/consultas': { nome: 'reserva válida na própria agenda quando D e para si quando C', status: 201, preparar: async (persona) => {
    const { paciente, dentista, procedimento, inicio } = await prepararAgenda(persona);
    return { url: '/api/consultas', corpo: { pacienteId: paciente.id, dentistaId: dentista.id, procedimentoId: procedimento.id, inicio: inicio.toISOString() } };
  } },
  'GET /api/consultas': simples('/api/consultas'),
  'GET /api/consultas/pendentes': simples('/api/consultas/pendentes'),
};

// A matriz de acesso não precisa efetuar logins/resets: este cenário exercita a
// validação pública explicitamente, sem confundir 400 com sucesso funcional.
for (const caminho of [
  '/cliente/login', '/funcionario/login', '/cliente/cadastro/codigo', '/cliente/cadastro/confirmar',
  '/cliente/recuperacao/codigo', '/funcionario/recuperacao/codigo',
  '/cliente/recuperacao/confirmar', '/funcionario/recuperacao/confirmar',
]) {
  const url = `/api/auth${caminho}`;
  cenarios[`POST ${url}`] = { ...simples(url, 400, {}), nome: 'negativo explícito: corpo público incompleto', codigo: 'ENTRADA_INVALIDA' };
}

for (const [metodo, sufixo, status, corpo] of [
  ['GET', '', 200, undefined], ['POST', '/cancelamento', 200, { justificativa: 'Motivo da matriz' }],
  ['POST', '/remarcacao', 201, undefined], ['POST', '/realizacao', 200, undefined],
  ['PUT', '/observacao', 200, { texto: 'Observação da matriz' }], ['GET', '/observacao/historico', 200, undefined],
] as const) {
  cenarios[`${metodo} /api/consultas/:id${sufixo}`] = {
    nome: 'consulta existente e própria quando C/D', status, preparar: async (persona) => {
      const { consulta, inicio } = await prepararAgenda(persona, true, sufixo === '/realizacao');
      return { url: `/api/consultas/${consulta!.id}${sufixo}`, corpo: sufixo === '/remarcacao'
        ? { inicio: new Date(+inicio + 3600000).toISOString(), justificativa: 'Motivo da matriz' } : corpo };
    },
  };
}

describe('matriz de papéis: contrato, documento e código', () => {
  it('o contrato tem as 43 rotas registradas no código, nem uma a mais', () => {
    expect([...contrato.keys()].sort()).toEqual(rotasDoCodigo.map(({ metodo, caminho }) => `${metodo} ${normalizar(caminho)}`).sort());
    expect(contrato.size).toBe(43);
  });

  it('docs/matriz-de-papeis.md é o api.md em forma de tabela', () => {
    expect(Object.fromEntries(documento)).toEqual(Object.fromEntries(contrato));
  });

  it('cada rota tem cenário explícito, sem fallback de entrada ou resposta', () => {
    expect(Object.keys(cenarios).sort()).toEqual(rotasDoCodigo.map(({ metodo, caminho }) => `${metodo} ${caminho}`).sort());
  });
});

describe('cada rota responde ao papel como o contrato manda', () => {
  beforeAll(async () => {
    contas.R = await criarFuncionario(contexto);
    contas['R-admin'] = await criarFuncionario(contexto, { isAdmin: true });
    contas.D = await criarFuncionario(contexto, { categoria: 'DENTISTA' });
    contas.C = await criarPaciente(contexto, {}, { comLogin: true });
  });

  const casos = rotasDoCodigo.flatMap(({ metodo, caminho }) =>
    PERSONAS.map((persona) => ({ metodo, caminho, persona, esperado: contrato.get(`${metodo} ${normalizar(caminho)}`)?.[persona],
      cenario: contrato.get(`${metodo} ${normalizar(caminho)}`)?.[persona] === 'ok' ? cenarios[`${metodo} ${caminho}`]?.nome : 'recusa pelo papel' })),
  );

  it.each(casos)('$metodo $caminho como $persona → $esperado ($cenario)', async ({ metodo, caminho, persona, esperado }) => {
    expect(esperado).toBeDefined();
    const cenario = cenarios[`${metodo} ${caminho}`];
    if (!cenario) throw new Error(`Cenário ausente: ${metodo} ${caminho}`);
    // Para papéis recusados, a entrada não chega ao controller: nenhum recurso
    // precisa ser criado. O UUID válido evita confundir recusa com formato ruim.
    const entrada = esperado === 'ok' ? await cenario.preparar(persona)
      : { url: caminho.replace(/:[A-Za-z]+/g, () => randomUUID()), corpo: {} };
    let pedido = request(app)[metodo.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete'](entrada.url);
    if (persona !== 'anonimo') pedido = pedido.set('Authorization', `Bearer ${await tokenDe(contexto, contas[persona]!)}`);
    if ('consulta' in entrada && entrada.consulta) pedido = pedido.query(entrada.consulta);
    if ('cabecalhos' in entrada && entrada.cabecalhos) pedido = pedido.set(entrada.cabecalhos);
    const resposta = await (['POST', 'PUT', 'PATCH'].includes(metodo) ? pedido.send(entrada.corpo) : pedido);

    if (esperado === '401') {
      expect(resposta.status).toBe(401);
      expect(resposta.body.erro.codigo).toBe('NAO_AUTENTICADO');
    } else if (esperado === '403') {
      expect(resposta.status).toBe(403);
      expect(resposta.body.erro.codigo).toBe('SEM_PERMISSAO');
    } else {
      expect(resposta.status, JSON.stringify(resposta.body)).toBe(cenario.status);
      if (cenario.codigo) expect(resposta.body.erro?.codigo).toBe(cenario.codigo);
      else expect(resposta.body?.erro).toBeUndefined();
    }
  });
});
