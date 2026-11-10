import { Router } from 'express';

export function criarSaude(consultarBanco: () => PromiseLike<unknown>, prazoMs = 1_000) {
  let encerrando = false;
  let consultaPendente: Promise<boolean> | undefined;

  async function estaPronta(): Promise<boolean> {
    if (encerrando) return false;
    // Uma dependência travada não deve enfileirar uma consulta por healthcheck.
    if (!consultaPendente) {
      consultaPendente = Promise.resolve().then(consultarBanco).then(() => true, () => false)
        .finally(() => { consultaPendente = undefined; });
    }
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    try {
      const disponivel = await Promise.race([
        consultaPendente,
        new Promise<false>((resolve) => { temporizador = setTimeout(() => resolve(false), prazoMs); }),
      ]);
      return disponivel && !encerrando;
    } finally {
      clearTimeout(temporizador);
    }
  }

  const rotas = Router();
  rotas.get('/viva', (_req, res) => { res.set('Cache-Control', 'no-store').json({ viva: true }); });
  rotas.get('/pronta', async (_req, res) => {
    const pronta = await estaPronta();
    res.set('Cache-Control', 'no-store').status(pronta ? 200 : 503).json({ pronta });
  });
  return { rotas, estaPronta, iniciarEncerramento: () => { encerrando = true; } };
}

export type Saude = ReturnType<typeof criarSaude>;
