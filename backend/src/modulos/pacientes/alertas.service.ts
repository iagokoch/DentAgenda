import type { UsuarioAutenticado } from '../../compartilhado/autenticacao.ts';
import type { Contexto } from '../../compartilhado/contexto.ts';
import { formatarEmSaoPaulo } from '../../compartilhado/datas.ts';
import { naoEncontrado } from '../../compartilhado/erros.ts';
import type { AlertaCliente } from '../../generated/prisma/client.ts';
import { conferirAcesso } from './pacientes.service.ts';

const INCLUIR = {
  autorFuncionario: { select: { id: true, nome: true } },
  removidoPorFuncionario: { select: { id: true, nome: true } },
} as const;

type AlertaCompleto = AlertaCliente & {
  autorFuncionario: { id: string; nome: string } | null;
  removidoPorFuncionario: { id: string; nome: string } | null;
};

function paraResposta(alerta: AlertaCompleto) {
  return {
    id: alerta.id,
    texto: alerta.texto,
    autor: alerta.autor,
    funcionario: alerta.autorFuncionario,
    criadoEm: formatarEmSaoPaulo(alerta.criadoEm),
    removidoEm: alerta.removidoEm ? formatarEmSaoPaulo(alerta.removidoEm) : null,
    removidoPor: alerta.removidoPorFuncionario,
  };
}

async function exigirPaciente(contexto: Contexto, usuario: UsuarioAutenticado, id: string): Promise<void> {
  conferirAcesso(usuario, id);
  const existe = await contexto.prisma.cliente.findUnique({ where: { id }, select: { id: true } });
  if (!existe) throw naoEncontrado();
}

export async function listarAlertas(
  contexto: Contexto,
  usuario: UsuarioAutenticado,
  id: string,
  incluirRemovidos: boolean,
) {
  await exigirPaciente(contexto, usuario, id);
  const alertas = await contexto.prisma.alertaCliente.findMany({
    where: { clienteId: id, ...(incluirRemovidos ? {} : { removidoEm: null }) },
    include: INCLUIR,
    orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }],
  });
  return alertas.map(paraResposta);
}

// D18: o autor vem do token. Paciente → PACIENTE sem funcionário; funcionário → CLINICA com o id dele.
export async function criarAlerta(contexto: Contexto, usuario: UsuarioAutenticado, id: string, texto: string) {
  await exigirPaciente(contexto, usuario, id);
  const alerta = await contexto.prisma.alertaCliente.create({
    data: {
      clienteId: id,
      texto,
      criadoEm: contexto.relogio.agora(),
      ...(usuario.tipo === 'CLIENTE'
        ? { autor: 'PACIENTE' as const }
        : { autor: 'CLINICA' as const, autorFuncionarioId: usuario.funcionarioId }),
    },
    include: INCLUIR,
  });
  return paraResposta(alerta);
}

// D18: não apaga a linha, marca quem removeu e quando. Remover de novo não troca esses dados.
export async function removerAlerta(
  contexto: Contexto,
  usuario: UsuarioAutenticado,
  id: string,
  alertaId: string,
): Promise<void> {
  if (usuario.tipo !== 'FUNCIONARIO') throw naoEncontrado();
  const alerta = await contexto.prisma.alertaCliente.findFirst({ where: { id: alertaId, clienteId: id } });
  if (!alerta) throw naoEncontrado();
  if (alerta.removidoEm) return;
  await contexto.prisma.alertaCliente.updateMany({
    where: { id: alertaId, removidoEm: null },
    data: { removidoEm: contexto.relogio.agora(), removidoPorFuncionarioId: usuario.funcionarioId },
  });
}
