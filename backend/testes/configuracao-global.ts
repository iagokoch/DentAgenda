import { execSync } from 'node:child_process';
import { validarDestinoDoBancoDeTeste } from './destino-do-banco.ts';

export default function aplicarMigrationsNoBancoDeTeste(): void {
  const urlDeTeste = validarDestinoDoBancoDeTeste(process.env.DATABASE_URL_TESTE);
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: urlDeTeste },
    stdio: 'pipe',
  });
}
