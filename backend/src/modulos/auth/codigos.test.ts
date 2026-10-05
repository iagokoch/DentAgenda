import { afterAll, describe, expect, it } from 'vitest';
import { criarContextoDeTeste } from '../../../testes/contexto-de-teste.ts';
import { gerarCpfValido } from '../../../testes/fabricas.ts';
import type { FinalidadeCodigo } from '../../generated/prisma/client.ts';
import { consumirCodigo, emitirCodigo } from './codigos.ts';

const contexto = criarContextoDeTeste();
afterAll(() => contexto.prisma.$disconnect());

const TELEFONE = '47999990000';

function emitir(identificador: string, finalidade: FinalidadeCodigo = 'RECUPERACAO') {
  return emitirCodigo(contexto.prisma, contexto, { identificador, tipo: 'CLIENTE', finalidade, destino: TELEFONE });
}

function consumir(identificador: string, codigo: string) {
  return consumirCodigo(contexto, { identificador, tipo: 'CLIENTE', finalidades: ['RECUPERACAO'], codigo });
}

const codigoErrado = (codigo: string) => String((Number(codigo) + 1) % 1_000_000).padStart(6, '0');

const LIMITE = { status: 429, codigo: 'LIMITE_DE_CODIGOS' };
const INVALIDO = { status: 400, codigo: 'CODIGO_INVALIDO' };

describe('emitirCodigo (D3, D19, D25.3)', () => {
  it('4º pedido na mesma hora → 429 LIMITE_DE_CODIGOS', async () => {
    const cpf = gerarCpfValido();
    for (let pedido = 0; pedido < 3; pedido++) await emitir(cpf);

    await expect(emitir(cpf)).rejects.toMatchObject(LIMITE);
  });

  it('6º pedido em 24 h, espaçados de 2 h → 429', async () => {
    const cpf = gerarCpfValido();
    for (let pedido = 0; pedido < 5; pedido++) {
      await emitir(cpf);
      contexto.relogio.avancarMinutos(120);
    }

    await expect(emitir(cpf)).rejects.toMatchObject(LIMITE);
  });

  it('o limite soma finalidades diferentes do mesmo identificador', async () => {
    const cpf = gerarCpfValido();
    await emitir(cpf, 'RECUPERACAO');
    await emitir(cpf, 'CADASTRO');
    await emitir(cpf, 'ATIVACAO');

    await expect(emitir(cpf, 'RECUPERACAO')).rejects.toMatchObject(LIMITE);
  });

  it('pedido recusado pelo limite não conta para o limite', async () => {
    const cpf = gerarCpfValido();
    for (let pedido = 0; pedido < 3; pedido++) await emitir(cpf);
    await expect(emitir(cpf)).rejects.toMatchObject(LIMITE);

    expect(await contexto.prisma.codigoVerificacao.count({ where: { identificador: cpf } })).toBe(3);
  });

  it('banco guarda HMAC, não o código', async () => {
    const cpf = gerarCpfValido();

    const codigo = await emitir(cpf);

    const linha = await contexto.prisma.codigoVerificacao.findFirstOrThrow({ where: { identificador: cpf } });
    expect(codigo).toMatch(/^\d{6}$/);
    expect(linha.codigoHash).not.toBe(codigo);
    expect(linha.codigoHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('consumirCodigo (D3, D19)', () => {
  it('código certo vale uma vez e devolve a finalidade', async () => {
    const cpf = gerarCpfValido();
    const codigo = await emitir(cpf);

    await expect(consumir(cpf, codigo)).resolves.toEqual({ finalidade: 'RECUPERACAO' });
  });

  it('código novo invalida o anterior da mesma finalidade', async () => {
    const cpf = gerarCpfValido();
    const anterior = await emitir(cpf);
    const novo = await emitir(cpf);

    await expect(consumir(cpf, anterior)).rejects.toMatchObject(INVALIDO);
    await expect(consumir(cpf, novo)).resolves.toEqual({ finalidade: 'RECUPERACAO' });
  });

  it('código vencido (+11 min) → CODIGO_INVALIDO', async () => {
    const cpf = gerarCpfValido();
    const codigo = await emitir(cpf);

    contexto.relogio.avancarMinutos(11);

    await expect(consumir(cpf, codigo)).rejects.toMatchObject(INVALIDO);
  });

  it('3 erros esgotam o código; o certo depois → CODIGO_INVALIDO', async () => {
    const cpf = gerarCpfValido();
    const codigo = await emitir(cpf);
    for (let erro = 0; erro < 3; erro++) await expect(consumir(cpf, codigoErrado(codigo))).rejects.toMatchObject(INVALIDO);

    await expect(consumir(cpf, codigo)).rejects.toMatchObject(INVALIDO);
    const linha = await contexto.prisma.codigoVerificacao.findFirstOrThrow({ where: { identificador: cpf } });
    expect(linha.tentativas).toBe(3);
  });

  it('código usado não vale de novo', async () => {
    const cpf = gerarCpfValido();
    const codigo = await emitir(cpf);
    await consumir(cpf, codigo);

    await expect(consumir(cpf, codigo)).rejects.toMatchObject(INVALIDO);
  });

  it('código gravado sem envio (destino NULL) nunca é aceito', async () => {
    const cpf = gerarCpfValido();
    const codigo = await emitirCodigo(contexto.prisma, contexto, {
      identificador: cpf,
      tipo: 'CLIENTE',
      finalidade: 'RECUPERACAO',
      destino: null,
    });

    await expect(consumir(cpf, codigo)).rejects.toMatchObject(INVALIDO);
  });

  it('destino diferente do código → CODIGO_INVALIDO', async () => {
    const cpf = gerarCpfValido();
    const codigo = await emitir(cpf, 'CADASTRO');

    await expect(
      consumirCodigo(contexto, {
        identificador: cpf,
        tipo: 'CLIENTE',
        finalidades: ['CADASTRO'],
        codigo,
        destino: '47888880000',
      }),
    ).rejects.toMatchObject(INVALIDO);
  });
});
