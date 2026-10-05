import * as z from 'zod';

const segredo = z.string().min(32, 'precisa de pelo menos 32 caracteres');

const esquemaDasVariaveis = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']),
    PORTA: z.coerce.number().int().positive(),
    DATABASE_URL: z.string().min(1),
    JWT_SEGREDO: segredo,
    CODIGO_HMAC_SEGREDO: segredo,
    ENVIADOR_MENSAGEM: z.enum(['log']),
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
  };
}
