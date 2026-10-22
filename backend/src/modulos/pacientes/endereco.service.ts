import type { UsuarioAutenticado } from '../../compartilhado/autenticacao.ts';
import type { Contexto } from '../../compartilhado/contexto.ts';
import { naoEncontrado } from '../../compartilhado/erros.ts';
import type { Endereco } from './pacientes.schemas.ts';
import { conferirAcesso, semClienteId } from './pacientes.service.ts';

async function exigirPaciente(contexto: Contexto, usuario: UsuarioAutenticado, id: string): Promise<void> {
  conferirAcesso(usuario, id);
  const existe = await contexto.prisma.cliente.findUnique({ where: { id }, select: { id: true } });
  if (!existe) throw naoEncontrado();
}

// D18: o PUT cria ou substitui o endereço inteiro; complemento ausente apaga o antigo.
export async function gravarEndereco(contexto: Contexto, usuario: UsuarioAutenticado, id: string, entrada: Endereco) {
  await exigirPaciente(contexto, usuario, id);
  const dados = { ...entrada, complemento: entrada.complemento ?? null };
  const endereco = await contexto.prisma.enderecoCliente.upsert({
    where: { clienteId: id },
    create: { clienteId: id, ...dados },
    update: dados,
  });
  return semClienteId(endereco);
}

// Sem endereço também responde 204: o resultado é o mesmo que o paciente pediu.
export async function removerEndereco(contexto: Contexto, usuario: UsuarioAutenticado, id: string): Promise<void> {
  await exigirPaciente(contexto, usuario, id);
  await contexto.prisma.enderecoCliente.deleteMany({ where: { clienteId: id } });
}
