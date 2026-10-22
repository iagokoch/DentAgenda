// D40 (#4): rotina de retenção. Rodar uma vez por dia pelo agendador do servidor: `npm run limpar:dados`.
// O prazo vem de RETENCAO_DIAS (padrão 90, pendente de confirmação com a Colzani).
import { criarPrisma } from '../src/compartilhado/banco.ts';
import { relogioDoSistema } from '../src/compartilhado/relogio.ts';
import { limparDadosAntigos } from '../src/compartilhado/retencao.ts';
import { carregarConfig } from '../src/config/env.ts';

const config = carregarConfig(process.env);
const prisma = criarPrisma(config.databaseUrl);
try {
  const apagados = await limparDadosAntigos({ prisma, relogio: relogioDoSistema }, config.retencaoDias);
  console.log(`Retenção de ${config.retencaoDias} dias: ${apagados.tentativasDeLogin} tentativas de login, ${apagados.codigos} códigos e ${apagados.sessoes} sessões apagados.`);
} finally {
  await prisma.$disconnect();
}
