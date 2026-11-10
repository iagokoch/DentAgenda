import type { UsuarioAutenticado } from '../../compartilhado/autenticacao.ts';
import type { Contexto } from '../../compartilhado/contexto.ts';
import { formatarEmSaoPaulo } from '../../compartilhado/datas.ts';
import { buscarConsultaVisivel } from './consulta.service.ts';
import { formatarConsulta, incluirRelacoesDaConsulta } from './formato.ts';

// D18: a observação atual fica na consulta e cada edição, inclusive o apagar (texto null), vira uma linha no
// histórico, na mesma transação. Paciente e clínica editam o mesmo campo; o histórico guarda quem escreveu o quê.
export async function gravarObservacao(contexto: Contexto, usuario: UsuarioAutenticado, consultaId: string, texto: string | null) {
  await buscarConsultaVisivel(contexto, usuario, consultaId);
  const consulta = await contexto.prisma.$transaction(async (tx) => {
    const atualizada = await tx.consulta.update({
      where: { id: consultaId }, data: { observacao: texto, versaoObservacao: { increment: 1 } },
      include: incluirRelacoesDaConsulta,
    });
    await tx.historicoObservacao.create({
      data: {
        consultaId,
        texto,
        autor: usuario.tipo === 'CLIENTE' ? 'PACIENTE' : 'CLINICA',
        autorFuncionarioId: usuario.tipo === 'FUNCIONARIO' ? usuario.funcionarioId : null,
        editadoEm: contexto.relogio.agora(),
        versao: atualizada.versaoObservacao,
      },
    });
    return atualizada;
  });
  return formatarConsulta(consulta);
}

export async function lerHistoricoDaObservacao(contexto: Contexto, usuario: UsuarioAutenticado, consultaId: string) {
  await buscarConsultaVisivel(contexto, usuario, consultaId);
  const linhas = await contexto.prisma.historicoObservacao.findMany({
    where: { consultaId },
    include: { autorFuncionario: { select: { id: true, nome: true } } },
    orderBy: { versao: 'desc' },
  });
  return linhas.map((linha) => ({
    id: linha.id,
    versao: linha.versao,
    texto: linha.texto,
    autor: linha.autor,
    funcionario: linha.autorFuncionario,
    editadoEm: formatarEmSaoPaulo(linha.editadoEm),
  }));
}
