export class ErroDeNegocio extends Error {
  readonly status: number;
  readonly codigo: string;
  readonly detalhes: Record<string, unknown> | undefined;

  constructor(status: number, codigo: string, mensagem: string, detalhes?: Record<string, unknown>) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
    this.detalhes = detalhes;
  }
}

export const naoEncontrado = () => new ErroDeNegocio(404, 'NAO_ENCONTRADO', 'Não encontrado.');
export const semPermissao = () => new ErroDeNegocio(403, 'SEM_PERMISSAO', 'Sem permissão.');
export const naoAutenticado = () => new ErroDeNegocio(401, 'NAO_AUTENTICADO', 'Faça login novamente.');
