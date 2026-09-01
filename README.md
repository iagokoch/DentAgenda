# 🦷 DentAgenda

Sistema de gerenciamento de agenda e consultas para clínicas odontológicas.

O **DentAgenda** é um projeto desenvolvido no curso de **Engenharia de Software**, com o objetivo de facilitar a organização das consultas e da agenda de clínicas odontológicas, oferecendo diferentes níveis de acesso para funcionários e clientes.

O projeto utiliza como empresa parceira a **Colzani Odontologia**, localizada na zona sul de Joinville/SC.

---

## 👥 Equipe

* Caio Rosa
* Iago Koch
* João Silva
* Pedro Israel
* William Vodzinsky

**Professor:** Edson Vaz Lopes
**Curso:** Engenharia de Software
**Período:** 6°

---

## 🎯 Objetivo do projeto

O DentAgenda busca solucionar problemas relacionados à organização das agendas e consultas de uma clínica odontológica.

O sistema deverá permitir que os funcionários autorizados da clínica, como dentistas e recepcionistas, possam:

* Marcar consultas;
* Desmarcar consultas;
* Consultar a agenda do dia;
* Consultar a agenda semanal;
* Consultar a agenda mensal;
* Visualizar informações básicas dos clientes;
* Consultar o telefone dos clientes;
* Visualizar o valor das consultas;
* Consultar o procedimento que será realizado;
* Consultar possíveis consultas anteriores.

Já os clientes terão acesso às suas próprias consultas e agenda, sem acesso às informações ou consultas de outros clientes.

---

## 🏥 Público-alvo

O sistema é destinado principalmente a:

* Clínicas odontológicas de pequeno porte;
* Clínicas odontológicas de médio porte.

A clínica utilizada como referência para o desenvolvimento é uma clínica de médio porte, com uma quantidade significativa de clientes fixos e novos clientes.

---

# 📌 PAC V

Durante o PAC V foram desenvolvidas as principais definições conceituais e visuais do projeto.

### 🎨 Protótipo

Foi desenvolvido um protótipo no **Figma**, contendo a proposta visual e o front-end planejado para o sistema.

O protótipo serve como referência para a implementação da aplicação durante o PAC VI.

### 🎤 Pitch

Também foi realizado um pitch para apresentação do projeto ao professor, permitindo definir melhor:

* A escala do sistema;
* As principais funcionalidades;
* A proposta do projeto;
* O direcionamento do desenvolvimento.

### 🤝 Validação com a empresa

A equipe realizou um alinhamento com a empresa parceira para identificar pontos positivos e negativos da proposta.

Após o pitch, foram realizados ajustes com base nesse alinhamento.

---

# 🚧 Status atual

## Situação do projeto

Atualmente, o projeto encontra-se na transição entre a fase de **prototipação** e a fase de **desenvolvimento da aplicação**.

### O que já temos

* [x] Definição do problema
* [x] Definição do público-alvo
* [x] Definição inicial das funcionalidades
* [x] Protótipo no Figma
* [x] Front-end planejado no Figma
* [x] Pitch do projeto
* [x] Alinhamento com a empresa parceira
* [x] Documentação produzida durante o PAC V

### O que ainda precisa ser desenvolvido

* [ ] Criar o repositório do projeto
* [ ] Estruturar o projeto no GitHub
* [ ] Iniciar a implementação do sistema
* [ ] Transformar o protótipo em uma aplicação funcional
* [ ] Implementar o gerenciamento de consultas
* [ ] Implementar a visualização das agendas
* [ ] Implementar os diferentes níveis de acesso
* [ ] Realizar testes
* [ ] Validar a primeira versão funcional

---

# 🚀 PAC VI

O principal objetivo do PAC VI é transformar a ideia e o protótipo desenvolvidos anteriormente em uma **primeira versão funcional do DentAgenda**.

O desenvolvimento será realizado de forma incremental, priorizando inicialmente as funcionalidades essenciais para que a aplicação consiga demonstrar o funcionamento básico do sistema.

---

# 📦 Próximo MVP

O próximo MVP terá como foco principal o **gerenciamento de consultas e agendas da clínica odontológica**.

## 1. Repositório

O primeiro passo será criar o repositório do projeto no GitHub.

O repositório será utilizado para:

* Armazenar o código;
* Controlar versões;
* Organizar o desenvolvimento da equipe;
* Registrar alterações realizadas;
* Facilitar o trabalho colaborativo;
* Documentar a evolução do projeto.

---

## 2. Estrutura inicial da aplicação

Após a criação do repositório, será criada a estrutura inicial do sistema.

Essa etapa tem como objetivo transformar o protótipo visual desenvolvido no Figma em uma aplicação que possa ser executada e posteriormente expandida.

---

## 3. Gerenciamento de consultas

Essa será uma das funcionalidades principais do MVP.

O sistema deverá permitir que usuários autorizados possam:

* Criar uma consulta;
* Visualizar uma consulta;
* Alterar uma consulta;
* Desmarcar/cancelar uma consulta.

As consultas deverão possuir informações necessárias para identificar o atendimento e organizá-lo na agenda.

---

## 4. Visualização da agenda

O sistema deverá permitir a visualização das consultas de acordo com diferentes períodos.

Inicialmente serão considerados:

* Agenda diária;
* Agenda semanal;
* Agenda mensal.

Essa funcionalidade será especialmente importante para os funcionários da clínica, permitindo organizar os atendimentos e visualizar os compromissos.

---

## 5. Controle de acesso

O sistema deverá considerar diferentes tipos de usuários.

### Funcionários

Dentistas e funcionários autorizados poderão acessar informações relacionadas à rotina da clínica, incluindo:

* Agenda;
* Consultas;
* Dados básicos dos clientes;
* Informações do atendimento;
* Histórico de consultas, quando disponível.

### Clientes

O cliente deverá ter acesso somente às suas próprias informações e consultas.

Um cliente **não deverá conseguir visualizar a agenda ou as consultas de outros clientes**.

---

## 6. Informações das consultas

O MVP deverá contemplar as principais informações relacionadas ao atendimento, conforme definido no projeto.

Entre elas:

* Cliente;
* Telefone;
* Data e horário;
* Procedimento;
* Valor da consulta;
* Consultas anteriores, quando aplicável.

---

## 7. Interface

A implementação deverá utilizar o protótipo desenvolvido no Figma como referência visual.

O objetivo não será criar uma nova interface do zero, mas transformar o trabalho de prototipação realizado no PAC V em uma interface funcional.

---

## 8. Testes

Após a implementação das funcionalidades principais, serão realizados testes dos fluxos mais importantes do sistema.

Os principais fluxos a serem testados serão:

1. Acesso ao sistema;
2. Visualização da agenda;
3. Criação de uma consulta;
4. Alteração de uma consulta;
5. Desmarcação de uma consulta;
6. Visualização das consultas pelo cliente;
7. Restrição de acesso às consultas de outros clientes.

---

# ✅ Critério de conclusão do MVP

O próximo MVP poderá ser considerado funcional quando a equipe conseguir demonstrar o fluxo básico do DentAgenda funcionando de ponta a ponta.

O sistema deverá permitir demonstrar:

**Usuário → acesso ao sistema → agenda → consulta → informações do atendimento**

Além disso, deverá existir uma diferenciação mínima entre os acessos de funcionários e clientes, garantindo que o cliente visualize somente suas próprias consultas.

---

# 📈 Evolução futura

Funcionalidades que não forem essenciais para o primeiro MVP poderão ser desenvolvidas posteriormente.

A estratégia será priorizar primeiro o funcionamento do núcleo do sistema e, após sua validação, adicionar novas funcionalidades e melhorias.

---

## 📚 Documentação

A documentação do projeto será mantida neste repositório juntamente com o código-fonte.

Documentos produzidos durante o PAC V e PAC VI poderão ser adicionados posteriormente à pasta:

```text
/docs
```

---

## 🗂️ Estrutura inicial do repositório

A estrutura poderá seguir inicialmente o seguinte modelo:

```text
DentAgenda/
│
├── README.md
│
├── docs/
│   ├── PAC-V/
│   └── PAC-VI/
│
├── src/
│
├── tests/
│
└── .gitignore
```

---

## 📌 Histórico

### PAC V

* Definição do problema;
* Definição do público-alvo;
* Criação do protótipo;
* Desenvolvimento do front-end no Figma;
* Pitch do projeto;
* Alinhamento com a empresa parceira.

### PAC VI

* Criação do repositório;
* Início do desenvolvimento;
* Implementação do primeiro MVP funcional;
* Testes;
* Validação da aplicação;
* Evolução do sistema a partir dos resultados obtidos.

---

> **DentAgenda — Organizando a agenda da clínica para facilitar o atendimento.**
