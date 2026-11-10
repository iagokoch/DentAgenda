import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarEncerramento } from '../src/compartilhado/encerramento.ts';

afterEach(() => vi.useRealTimers());

function preparar() {
  let concluirDrenagem: (erro?: Error) => void = () => {};
  const desconexao = Promise.withResolvers<void>();
  const dependencias = {
    iniciar: vi.fn(),
    fechar: vi.fn((concluiu: (erro?: Error) => void) => { concluirDrenagem = concluiu; }),
    forcarFechamento: vi.fn(),
    desconectar: vi.fn(() => desconexao.promise),
    registrar: vi.fn(),
    finalizar: vi.fn(),
    prazoMs: 100,
  };
  return { dependencias, desconexao, concluir: () => concluirDrenagem(), encerrar: criarEncerramento(dependencias) };
}

describe('encerramento do servidor', () => {
  it('retira readiness, drena e só então desconecta; sinais repetidos compartilham o trabalho', async () => {
    const { dependencias, desconexao, concluir, encerrar } = preparar();
    const resultado = encerrar();
    expect(dependencias.iniciar).toHaveBeenCalledOnce();
    expect(dependencias.fechar).toHaveBeenCalledOnce();
    expect(dependencias.iniciar.mock.invocationCallOrder[0]).toBeLessThan(dependencias.fechar.mock.invocationCallOrder[0]!);
    expect(dependencias.desconectar).not.toHaveBeenCalled();
    expect(encerrar()).toBe(resultado);
    concluir();
    expect(dependencias.desconectar).toHaveBeenCalledOnce();
    expect(dependencias.finalizar).not.toHaveBeenCalled();
    desconexao.resolve();
    await resultado;
    expect(dependencias.finalizar).toHaveBeenCalledExactlyOnceWith(0);
  });

  it('impõe prazo também se a desconexão do banco não terminar', async () => {
    vi.useFakeTimers();
    const { dependencias, concluir, encerrar } = preparar();
    const resultado = encerrar();
    concluir();
    await vi.advanceTimersByTimeAsync(100);
    await resultado;
    expect(dependencias.forcarFechamento).toHaveBeenCalledOnce();
    expect(dependencias.finalizar).toHaveBeenCalledExactlyOnceWith(1);
  });
});
