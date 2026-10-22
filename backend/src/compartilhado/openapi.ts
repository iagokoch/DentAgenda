import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import * as z from 'zod';
import type { Papel } from './autenticacao.ts';

// Cada módulo de rotas declara aqui o que o Swagger mostra (D34). O teste de openapi.test.ts compara esta lista com as
// rotas realmente registradas no router, então esquecer uma rota ou documentar uma que não existe falha.
export type RotaDocumentada = {
  metodo: 'get' | 'post' | 'put' | 'patch' | 'delete';
  // Sintaxe do Express, relativa ao prefixo do módulo (ex.: '/:id/cancelamento').
  caminho: string;
  resumo: string;
  acesso: Papel[] | 'publica' | 'logado';
  corpo?: z.ZodType;
  consulta?: z.ZodType;
};

export type ModuloDocumentado = { prefixo: string; tag: string; rotas: RotaDocumentada[] };

// io: 'input' descreve o que o cliente envia (antes de defaults e transformações); 'any' evita que um
// refinamento sem equivalente em JSON Schema derrube a geração.
const OPCOES_DO_JSON_SCHEMA = { target: 'openapi-3.0', io: 'input', unrepresentable: 'any' } as const;

type EsquemaJson = { properties?: Record<string, object>; required?: string[] };

const esquemaJsonDe = (esquema: z.ZodType) => z.toJSONSchema(esquema, OPCOES_DO_JSON_SCHEMA) as EsquemaJson;

// Todo identificador na URL é um uuid (docs/api.md).
const parametrosDeCaminho = (caminho: string) =>
  [...caminho.matchAll(/:(\w+)/g)].map(([, nome]) => ({
    name: nome,
    in: 'path',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  }));

function parametrosDeConsulta(esquema: z.ZodType) {
  const { properties = {}, required = [] } = esquemaJsonDe(esquema);
  return Object.entries(properties).map(([nome, propriedade]) => ({
    name: nome,
    in: 'query',
    required: required.includes(nome),
    schema: propriedade,
  }));
}

const LEGENDA_DOS_PAPEIS: Record<Papel, string> = { R: 'recepção', D: 'dentista', A: 'admin', C: 'paciente' };

function descricaoDoAcesso(acesso: RotaDocumentada['acesso']): string {
  if (acesso === 'publica') return 'Pública: não exige login.';
  if (acesso === 'logado') return 'Qualquer usuário logado.';
  return `Quem pode: ${acesso.map((papel) => `${papel} (${LEGENDA_DOS_PAPEIS[papel]})`).join(', ')}.`;
}

const caminhoNoOpenApi = (prefixo: string, caminho: string) => {
  const completo = `${prefixo}${caminho}`.replace(/:(\w+)/g, '{$1}');
  return completo.length > 1 ? completo.replace(/\/$/, '') : completo;
};

function operacaoDe(modulo: ModuloDocumentado, rota: RotaDocumentada) {
  const parametros = [...parametrosDeCaminho(rota.caminho), ...(rota.consulta ? parametrosDeConsulta(rota.consulta) : [])];
  return {
    tags: [modulo.tag],
    summary: rota.resumo,
    description: descricaoDoAcesso(rota.acesso),
    security: rota.acesso === 'publica' ? [] : [{ bearerAuth: [] }],
    ...(parametros.length > 0 && { parameters: parametros }),
    ...(rota.corpo && { requestBody: { required: true, content: { 'application/json': { schema: esquemaJsonDe(rota.corpo) } } } }),
    responses: {
      '2XX': { description: 'Sucesso. O status exato de cada rota está em docs/api.md.' },
      default: {
        description: 'Erro no formato único de docs/api.md.',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } },
      },
    },
  };
}

const ESQUEMA_DE_ERRO = {
  type: 'object',
  required: ['erro'],
  properties: {
    erro: {
      type: 'object',
      required: ['codigo', 'mensagem'],
      properties: {
        codigo: { type: 'string', example: 'HORARIO_INDISPONIVEL' },
        mensagem: { type: 'string' },
        campos: {
          type: 'array',
          items: { type: 'object', properties: { caminho: { type: 'string' }, mensagem: { type: 'string' } } },
        },
      },
    },
  },
};

export function montarOpenApi(modulos: ModuloDocumentado[]) {
  const paths: Record<string, Record<string, object>> = {};
  for (const modulo of modulos) {
    for (const rota of modulo.rotas) {
      const caminho = caminhoNoOpenApi(modulo.prefixo, rota.caminho);
      paths[caminho] = { ...paths[caminho], [rota.metodo]: operacaoDe(modulo, rota) };
    }
  }
  return {
    openapi: '3.0.3',
    info: {
      title: 'DentAgenda API',
      version: '1.0.0',
      description:
        'Gerada dos schemas Zod. O contrato completo (status, códigos de erro e regras) está em docs/api.md. ' +
        'Para rotas autenticadas, faça login e cole o accessToken em "Authorize".',
    },
    servers: [{ url: '/' }],
    paths,
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      schemas: { Erro: ESQUEMA_DE_ERRO },
    },
  };
}

// Só fora de produção (D23): em produção estas rotas nem existem e caem no 404 padrão.
export function criarRotasDeDocumentacao(modulos: ModuloDocumentado[]): Router {
  const documento = montarOpenApi(modulos);
  const rotas = Router();
  rotas.get('/api/docs.json', (_req, res) => {
    res.json(documento);
  });
  rotas.use('/api/docs', swaggerUi.serve, swaggerUi.setup(documento));
  return rotas;
}
