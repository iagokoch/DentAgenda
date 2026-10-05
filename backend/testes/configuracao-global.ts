import { execSync } from 'node:child_process';

export default function aplicarMigrationsNoBancoDeTeste(): void {
  const urlDeTeste = process.env.DATABASE_URL_TESTE;
  // Sem o banco de teste, os testes limpariam o banco de desenvolvimento.
  if (!urlDeTeste) throw new Error('DATABASE_URL_TESTE não definida em backend/.env');
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: urlDeTeste },
    stdio: 'pipe',
  });
}
