let filaLocal = Promise.resolve()

// Web Locks serializa operações de cookie na mesma origem, inclusive em documentos diferentes.
export const coordenacaoDaSessao = {
  get entreAbas() { return typeof globalThis.navigator?.locks?.request === 'function' },
  executar(operacao) {
    if (this.entreAbas) return globalThis.navigator.locks.request('dentagenda-sessao', { signal: AbortSignal.timeout(30_000) }, operacao)
    const pedido = filaLocal.then(operacao)
    filaLocal = pedido.catch(() => {})
    return pedido
  },
}
