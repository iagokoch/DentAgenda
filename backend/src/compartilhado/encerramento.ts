export type DependenciasDoEncerramento = {
  iniciar: () => void;
  fechar: (concluiu: (erro?: Error) => void) => void;
  forcarFechamento: () => void;
  desconectar: () => Promise<void>;
  registrar: (sucesso: boolean) => void;
  finalizar: (codigo: number) => void;
  prazoMs?: number;
};

export function criarEncerramento(dependencias: DependenciasDoEncerramento): () => Promise<void> {
  let encerramento: Promise<void> | undefined;
  return () => {
    if (encerramento) return encerramento;
    dependencias.iniciar();
    encerramento = new Promise<void>((resolve) => {
      let terminado = false;
      const terminar = (codigo: number) => {
        if (terminado) return;
        terminado = true;
        clearTimeout(temporizador);
        dependencias.registrar(codigo === 0);
        dependencias.finalizar(codigo);
        resolve();
      };
      const temporizador = setTimeout(() => {
        dependencias.forcarFechamento();
        terminar(1);
      }, dependencias.prazoMs ?? 10_000);
      const desconectar = async (erro?: Error) => {
        try {
          await dependencias.desconectar();
          terminar(erro ? 1 : 0);
        } catch {
          terminar(1);
        }
      };
      try {
        dependencias.fechar((erro) => { void desconectar(erro); });
      } catch {
        void desconectar(new Error('falha ao fechar servidor'));
      }
    });
    return encerramento;
  };
}
