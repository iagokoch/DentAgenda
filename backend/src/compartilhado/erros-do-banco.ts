export type ViolacaoDoBanco = { codigoSql: string; restricao: string | null; campos: string[] };

// Formato do Prisma 7 com driver adapter: o erro do Postgres vem em meta.driverAdapterError.cause.
type CausaDoAdapter = {
  originalCode?: unknown;
  originalMessage?: unknown;
  table?: unknown;
  constraint?: { index?: unknown; fields?: unknown };
};

export function violacaoDoBanco(erro: unknown): ViolacaoDoBanco | null {
  const causa = causaDoAdapter(erro);
  if (!causa || typeof causa.originalCode !== 'string') return null;
  const restricao = nomeDaRestricao(causa);
  return { codigoSql: causa.originalCode, restricao, campos: camposDoUnique(causa, restricao) };
}

function causaDoAdapter(erro: unknown): CausaDoAdapter | null {
  if (typeof erro !== 'object' || erro === null || !('meta' in erro)) return null;
  const meta = erro.meta as { driverAdapterError?: { cause?: CausaDoAdapter } } | undefined;
  return meta?.driverAdapterError?.cause ?? null;
}

function nomeDaRestricao(causa: CausaDoAdapter): string | null {
  if (typeof causa.constraint?.index === 'string') return causa.constraint.index;
  if (typeof causa.originalMessage !== 'string') return null;
  return /constraint "([^"]+)"/.exec(causa.originalMessage)?.[1] ?? null;
}

// O adapter informa só o nome do índice; os campos saem da convenção do Prisma
// "<Tabela>_<campo1>_<campo2>_key" (nomes de coluna em camelCase, sem "_").
function camposDoUnique(causa: CausaDoAdapter, restricao: string | null): string[] {
  const campos = causa.constraint?.fields;
  if (Array.isArray(campos)) return campos.filter((campo): campo is string => typeof campo === 'string');
  const prefixo = `${String(causa.table)}_`;
  if (!restricao?.startsWith(prefixo) || !restricao.endsWith('_key')) return [];
  return restricao.slice(prefixo.length, -'_key'.length).split('_');
}
