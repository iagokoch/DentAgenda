import { isIP } from 'node:net';
import * as z from 'zod';

const segredo = z.string().min(32, 'precisa de pelo menos 32 caracteres');

// D40: quem está na frente da API. Vazio ou 0 = ninguém; número = quantos proxies; lista = só esses IPs, sub-redes ou
// nomes do Express. "true" (confiar em qualquer um) deixaria o cliente forjar o IP no X-Forwarded-For.
const NOMES_DE_REDE_DO_EXPRESS = ['loopback', 'linklocal', 'uniquelocal'];
function enderecoConfiavel(item: string): boolean {
  if (NOMES_DE_REDE_DO_EXPRESS.includes(item)) return true;
  const [ip = '', prefixo, ...resto] = item.split('/');
  const versao = isIP(ip);
  if (versao === 0 || resto.length > 0) return false;
  if (prefixo === undefined) return true;
  return /^\d{1,3}$/.test(prefixo) && Number(prefixo) <= (versao === 4 ? 32 : 128);
}
const proxyConfiavel = z
  .string()
  .trim()
  .optional()
  .transform((valor, ctx): false | number | string[] => {
    if (!valor || valor === '0') return false;
    if (/^\d+$/.test(valor)) return Number(valor);
    const itens = valor.split(',').map((item) => item.trim());
    if (itens.every(enderecoConfiavel)) return itens;
    ctx.addIssue({ code: 'custom', message: 'use um número de proxies ou uma lista de IPs/sub-redes (nunca "true")' });
    return z.NEVER;
  });

const esquemaDasVariaveis = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']),
    PORTA: z.coerce.number().int().positive(),
    DATABASE_URL: z.string().min(1),
    JWT_SEGREDO: segredo,
    CODIGO_HMAC_SEGREDO: segredo,
    ENVIADOR_MENSAGEM: z.enum(['log']),
    PROXY_CONFIAVEL: proxyConfiavel,
    // D40: prazo de retenção de tentativas de login, códigos e sessões mortas. 90 dias: pendente com a Colzani.
    // Vazio (como vem do .env.example) vale o padrão.
    RETENCAO_DIAS: z.preprocess((valor) => (valor === '' ? undefined : valor), z.coerce.number().int().min(1).default(90)),
  })
  // D16: o enviador de log grava códigos em texto puro; não pode rodar em produção.
  .refine((variaveis) => !(variaveis.ENVIADOR_MENSAGEM === 'log' && variaveis.NODE_ENV === 'production'), {
    error: 'não pode ser "log" com NODE_ENV=production',
    path: ['ENVIADOR_MENSAGEM'],
  });

export type Config = {
  nodeEnv: 'development' | 'test' | 'production';
  porta: number;
  databaseUrl: string;
  jwtSegredo: string;
  codigoHmacSegredo: string;
  enviadorMensagem: 'log';
  proxyConfiavel: false | number | string[];
  retencaoDias: number;
};

export function carregarConfig(variaveis: NodeJS.ProcessEnv): Config {
  const resultado = esquemaDasVariaveis.safeParse(variaveis);
  if (!resultado.success) {
    // Só nome da variável e motivo: o valor pode ser um segredo.
    const problemas = resultado.error.issues.map((problema) => `${problema.path.join('.')}: ${problema.message}`);
    throw new Error(`Variáveis de ambiente inválidas — ${problemas.join('; ')}`);
  }
  const valores = resultado.data;
  return {
    nodeEnv: valores.NODE_ENV,
    porta: valores.PORTA,
    databaseUrl: valores.DATABASE_URL,
    jwtSegredo: valores.JWT_SEGREDO,
    codigoHmacSegredo: valores.CODIGO_HMAC_SEGREDO,
    enviadorMensagem: valores.ENVIADOR_MENSAGEM,
    proxyConfiavel: valores.PROXY_CONFIAVEL,
    retencaoDias: valores.RETENCAO_DIAS,
  };
}
