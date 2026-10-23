# Acessibilidade e layout em celular

Como as telas são conferidas (issue #2, D39) e o resultado da última conferência.

## O que roda sozinho (`npm test` na raiz)

- `src/acessibilidade.test.jsx`: `axe-core` em 14 telas com dados simulados. Falha com qualquer violação, menos
  contraste, que o jsdom não consegue medir.
- `src/botoes.test.js`: nenhum `<button>` sem `onClick` nem `type="submit"` (#3).
- Testes de tela com teclado: abas do perfil (setas, Home, End) e foco preso no popup de cancelamento.

## O que se confere no navegador

Contraste e layout dependem do CSS de verdade. Com API e front rodando (README) e as contas do `db:seed:dev`:

1. **Contraste e demais regras:** em cada tela da lista abaixo, rode a extensão **axe DevTools** (ou Lighthouse →
   Acessibilidade) no Chrome/Edge. Esperado: nenhuma violação.
2. **Teclado:** só com Tab, Shift+Tab, Enter, Esc e setas: entrar, buscar paciente, marcar consulta, abrir e fechar a
   gaveta de edição (o foco não sai dela), cancelar uma consulta, trocar de aba no perfil. O contorno de foco aparece
   sempre.
3. **400px:** nas ferramentas do navegador (modo dispositivo, largura 400), percorra as mesmas telas. Esperado: sem
   rolagem horizontal da página, menu embaixo, **Sair** no topo.

Telas e papéis: login, cadastro e recuperação (anônimo); Início, Pacientes, Novo paciente, Perfil, Novo agendamento,
Detalhes da consulta e Disponibilidade (recepção); Equipe, Procedimentos e Disponibilidade (admin); Início e
Disponibilidade (dentista); Minhas consultas e Marcar consulta (paciente).

## Última conferência — 2026-10-22

Feita com `axe-core` 4.14.0 no Edge (Playwright, sem interface), 18 combinações de tela e papel, em 1280px (axe) e 400px
(rolagem horizontal e captura de tela).

| Achado | Onde | Correção |
|--------|------|----------|
| Contraste abaixo de 4,5:1 em 14 cores de texto (links, rótulos, etiquetas de status, menu ativo) | todas as telas | Cores escurecidas mantendo o tom (D39) |
| Texto de 8 a 11px | rótulos, etiquetas, menu | Mínimo de 12px |
| Foco invisível nos campos (`outline:0`) | formulários | `:focus-visible` e `:focus-within` de 2px |
| Conteúdo fora de landmark; dois `<aside>` sem nome | todas as telas logadas | Menu `aside` nomeado; topo como `header` |
| Página sem `<h1>` | Novo agendamento, Marcar consulta | `<h1>` só para leitor de tela |
| `role="table"` em `<section>` | Equipe, Procedimentos | `<div role="table">` |
| Botão **Sair** fora da barra de baixo, inalcançável | todas as telas logadas, 400px | Sair no topo no celular |
| Último item do menu cortado (admin, 6 itens) | 400px | Barra rolável |
| Cartões laterais estreitos | Perfil, Detalhes da consulta, 400px | Ocupam a largura toda |

Depois das correções: **nenhuma violação do axe** nas 18 combinações e nenhuma rolagem horizontal em 400px.
