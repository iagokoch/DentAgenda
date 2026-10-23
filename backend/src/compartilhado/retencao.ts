import type { Contexto } from './contexto.ts';

const DIA_EM_MS = 24 * 60 * 60 * 1000;

export type Apagados = { tentativasDeLogin: number; codigos: number; sessoes: number };

// D40 (#4): apaga o que passou do prazo de retenção. Tentativas de login e códigos guardam CPF, e-mail e IP; sessão
// vencida ou revogada não serve para mais nada. Sessão ainda válida nunca é apagada. Falha de login mais velha que o
// prazo deixa de contar para o bloqueio (muda a D5 nesse ponto).
export async function limparDadosAntigos(contexto: Pick<Contexto, 'prisma' | 'relogio'>, dias: number): Promise<Apagados> {
  const limite = new Date(contexto.relogio.agora().getTime() - dias * DIA_EM_MS);
  const [tentativas, codigos, sessoes] = await contexto.prisma.$transaction([
    contexto.prisma.tentativaLogin.deleteMany({ where: { ocorridoEm: { lt: limite } } }),
    contexto.prisma.codigoVerificacao.deleteMany({ where: { criadoEm: { lt: limite } } }),
    contexto.prisma.refreshToken.deleteMany({ where: { OR: [{ expiraEm: { lt: limite } }, { revogadoEm: { lt: limite } }] } }),
  ]);
  return { tentativasDeLogin: tentativas.count, codigos: codigos.count, sessoes: sessoes.count };
}
