export function validarDestinoDoBancoDeTeste(url: string | undefined): string {
  const recusar = () => new Error(
    'DATABASE_URL_TESTE deve ser uma URL PostgreSQL com banco terminado em _test, sem parâmetros ou fragmento.',
  );
  if (!url) throw recusar();
  let destino: URL;
  try {
    destino = new URL(url);
  } catch {
    throw recusar();
  }
  // Parâmetros podem sobrescrever o banco no driver. Aceitar só o formato inequívoco usado pelo projeto.
  if (!['postgres:', 'postgresql:'].includes(destino.protocol)
    || !destino.hostname || !/^\/[a-zA-Z0-9_]+_test$/.test(destino.pathname)
    || destino.search || destino.hash || url.trim() !== url) {
    throw recusar();
  }
  return url;
}
