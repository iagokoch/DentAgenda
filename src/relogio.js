import { createContext, useContext } from 'react'

// #7 (D39): toda tela lê "agora" daqui. Fora dos testes é o relógio do navegador; os testes de tela passam um relógio
// fixo pelo RelogioContexto, sem depender da hora da máquina nem de timers falsos.
export const relogioDoNavegador = { agora: () => new Date() }

export const RelogioContexto = createContext(relogioDoNavegador)

export const useRelogio = () => useContext(RelogioContexto)
