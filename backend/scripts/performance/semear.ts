import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { criarPrisma } from '../../src/compartilhado/banco.ts';
import { gerarHashDeSenha } from '../../src/compartilhado/senhas.ts';
import type { PrismaClient } from '../../src/generated/prisma/client.ts';
import { cpfFicticio, gerarDadosDeCarga, validarBancoDeCarga, type DadosDeCarga } from './dados-ficticios.ts';

export async function gravarDadosDeCarga(prisma: PrismaClient, dados: DadosDeCarga, senhaHash: string) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('dentagenda:performance:seed', 0))`;
    const [destino] = await tx.$queryRaw<{ banco: string }[]>`SELECT current_database() AS banco`;
    if (!destino?.banco.endsWith('_performance_test')) throw new Error('Banco real fora do escopo de carga.');
    // Todos os outros registros dependem desses pais por FK. Nenhum dado existente é removido.
    const contagens = await Promise.all([
      tx.cliente.count(), tx.funcionario.count(), tx.procedimento.count(),
      tx.codigoVerificacao.count(), tx.tentativaLogin.count(),
    ]);
    if (contagens.some((quantidade) => quantidade !== 0)) throw new Error('A carga exige banco vazio; nenhum dado foi alterado.');
    const criadoEm = new Date('2026-01-01T12:00:00Z');
    await tx.funcionario.createMany({ data: dados.dentistas.map((dentista) => ({
      ...dentista, categoria: 'DENTISTA', senhaHash, dataInicio: criadoEm,
    })) });
    await tx.funcionario.create({ data: {
      nome: 'Recepção fictícia de carga', cpf: cpfFicticio(200_000_000),
      email: 'carga.recepcao@exemplo.invalid', categoria: 'RECEPCIONISTA', senhaHash, dataInicio: criadoEm,
    } });
    await tx.procedimento.create({ data: dados.procedimento });
    for (let inicio = 0; inicio < dados.pacientes.length; inicio += 500) {
      await tx.cliente.createMany({ data: dados.pacientes.slice(inicio, inicio + 500).map((paciente) => ({
        ...paciente, criadoEm, pacienteDesde: criadoEm,
      })) });
    }
    await tx.gradeHorario.createMany({ data: dados.dentistas.flatMap((dentista) =>
      [1, 2, 3, 4, 5].map((diaSemana) => ({
        dentistaId: dentista.id, diaSemana,
        inicio: new Date('1970-01-01T09:00:00Z'), fim: new Date('1970-01-01T17:00:00Z'),
      }))) });
    for (let inicio = 0; inicio < dados.consultas.length; inicio += 500) {
      await tx.consulta.createMany({ data: dados.consultas.slice(inicio, inicio + 500).map((consulta) => ({
        ...consulta, status: 'CONFIRMADA', criadoEm,
      })) });
    }
    await tx.historicoObservacao.createMany({ data: Array.from({ length: 100 }, (_, indice) => ({
      consultaId: dados.consultas[0]!.id, texto: `Observação fictícia ${indice + 1}`,
      autor: 'PACIENTE', editadoEm: new Date(criadoEm.getTime() + indice),
      versao: indice + 1,
    })) });
    await tx.consulta.update({ where: { id: dados.consultas[0]!.id }, data: { observacao: 'Observação fictícia 100', versaoObservacao: 100 } });
  }, { maxWait: 1_000, timeout: 120_000 });
}

async function executar(): Promise<void> {
  // A URL é validada antes de criar client, abrir conexão ou escrever arquivos.
  const url = validarBancoDeCarga(process.env.DATABASE_URL_PERFORMANCE, process.env.NODE_ENV);
  const senha = process.env.PERFORMANCE_SENHA;
  if (!senha || senha.length < 12) throw new Error('Defina PERFORMANCE_SENHA com pelo menos 12 caracteres.');
  const dados = gerarDadosDeCarga({
    dentistas: Number(process.env.PERFORMANCE_DENTISTAS ?? 5),
    pacientes: Number(process.env.PERFORMANCE_PACIENTES ?? 5_000),
    consultas: Number(process.env.PERFORMANCE_CONSULTAS ?? 50_000),
  });
  const prisma = criarPrisma(url);
  try {
    await gravarDadosDeCarga(prisma, dados, await gerarHashDeSenha(senha));
    const arquivo = resolve(process.env.PERFORMANCE_REFERENCIAS ?? '../performance/resultados/dataset.json');
    await mkdir(dirname(arquivo), { recursive: true });
    await writeFile(arquivo, JSON.stringify({
      dentistas: dados.dentistas.length, pacientes: dados.pacientes.length, consultas: dados.consultas.length,
      pacienteId: dados.pacientes[0]!.id, dentistaId: dados.dentistas[0]!.id,
      procedimentoId: dados.procedimento.id, consultaId: dados.consultas[0]!.id, data: '2030-01-07',
      inicioDisputa: dados.inicioDisputa,
    }, null, 2));
    console.log('Dados fictícios gravados; referências escritas no arquivo configurado. Nenhuma credencial foi incluída.');
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  executar().catch(() => {
    // Erros de drivers podem incluir URL/credencial; não encaminhar a exceção ao terminal.
    console.error('Semeadura não concluída. Confira o destino exclusivo, banco vazio, migrations e variáveis necessárias.');
    process.exitCode = 1;
  });
}
