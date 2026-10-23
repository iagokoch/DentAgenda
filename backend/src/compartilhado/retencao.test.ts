import { afterAll, describe, expect, it } from 'vitest';
import { criarContextoDeTeste } from '../../testes/contexto-de-teste.ts';
import { criarFuncionario, criarPaciente } from '../../testes/fabricas.ts';
import { limparDadosAntigos } from './retencao.ts';

// #4 (D40): o que passou do prazo de retenção sai; o que ainda vale fica. Relógio fixo dos testes: 2026-10-05.
const contexto = criarContextoDeTeste();
afterAll(() => contexto.prisma.$disconnect());

const DIA = 24 * 60 * 60 * 1000;
const haDias = (dias: number) => new Date(contexto.relogio.agora().getTime() - dias * DIA);
const daquiADias = (dias: number) => new Date(contexto.relogio.agora().getTime() + dias * DIA);

describe('limparDadosAntigos', () => {
  it('apaga tentativas de login, códigos e sessões mortas mais velhos que o prazo; mantém o resto', async () => {
    const funcionario = await criarFuncionario(contexto);
    const paciente = await criarPaciente(contexto, {}, { comLogin: true });
    const login = await contexto.prisma.login.findUniqueOrThrow({ where: { clienteId: paciente.id } });
    const tentativa = (identificador: string, ocorridoEm: Date) =>
      contexto.prisma.tentativaLogin.create({ data: { identificador, tipo: 'CLIENTE', ip: '127.0.0.1', resultado: 'FALHA', ocorridoEm } });
    const codigo = (identificador: string, criadoEm: Date) =>
      contexto.prisma.codigoVerificacao.create({
        data: { identificador, tipo: 'CLIENTE', finalidade: 'RECUPERACAO', destino: '47999990000', codigoHash: identificador, criadoEm, expiraEm: new Date(criadoEm.getTime() + 600_000) },
      });
    const sessao = (tokenHash: string, dados: { expiraEm: Date; revogadoEm?: Date }) =>
      contexto.prisma.refreshToken.create({ data: { tokenHash, loginId: login.id, criadoEm: haDias(400), ...dados } });

    await tentativa('velha', haDias(91));
    await tentativa('recente', haDias(89));
    await codigo('codigo-velho', haDias(91));
    await codigo('codigo-recente', haDias(1));
    await sessao('vencida-ha-muito', { expiraEm: haDias(91) });
    await sessao('revogada-ha-muito', { expiraEm: daquiADias(10), revogadoEm: haDias(91) });
    await sessao('vencida-ha-pouco', { expiraEm: haDias(5) });
    await sessao('revogada-ha-pouco', { expiraEm: daquiADias(10), revogadoEm: haDias(5) });
    await sessao('valendo', { expiraEm: daquiADias(10) });
    await contexto.prisma.refreshToken.create({ data: { tokenHash: 'funcionario-valendo', funcionarioId: funcionario.id, criadoEm: haDias(1), expiraEm: daquiADias(1) } });

    const apagados = await limparDadosAntigos(contexto, 90);

    expect(apagados).toEqual({ tentativasDeLogin: 1, codigos: 1, sessoes: 2 });
    expect((await contexto.prisma.tentativaLogin.findMany({ select: { identificador: true } })).map((linha) => linha.identificador)).toEqual(['recente']);
    expect((await contexto.prisma.codigoVerificacao.findMany({ select: { identificador: true } })).map((linha) => linha.identificador)).toEqual(['codigo-recente']);
    expect((await contexto.prisma.refreshToken.findMany({ select: { tokenHash: true }, orderBy: { tokenHash: 'asc' } })).map((linha) => linha.tokenHash)).toEqual([
      'funcionario-valendo',
      'revogada-ha-pouco',
      'valendo',
      'vencida-ha-pouco',
    ]);
  });

  it('rodar de novo não apaga mais nada', async () => {
    expect(await limparDadosAntigos(contexto, 90)).toEqual({ tentativasDeLogin: 0, codigos: 0, sessoes: 0 });
  });
});
