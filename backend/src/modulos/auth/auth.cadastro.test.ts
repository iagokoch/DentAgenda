import request from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { criarContextoDeTeste } from '../../../testes/contexto-de-teste.ts';
import { criarPaciente, gerarCpfValido } from '../../../testes/fabricas.ts';
import { criarApp } from '../../app.ts';
import { dataEmSaoPaulo } from '../../compartilhado/datas.ts';

const contexto = criarContextoDeTeste();
const app = criarApp(contexto);
afterAll(() => contexto.prisma.$disconnect());

const MENSAGEM_PADRAO = 'Se os dados estiverem corretos, enviamos um código.';
const SENHA = 'senha-do-cadastro-123';

let sequenciaDeTelefone = 0;
const novoTelefone = () => `4898${String(++sequenciaDeTelefone).padStart(7, '0')}`;

const pedirCodigo = (cpf: string, telefone: string) =>
  request(app).post('/api/auth/cliente/cadastro/codigo').send({ cpf, telefone });

type Confirmacao = { cpf: string; telefone: string; codigo: string; nome?: string; email?: string; nascimento?: string };
const confirmar = (dados: Confirmacao) =>
  request(app)
    .post('/api/auth/cliente/cadastro/confirmar')
    .send({ nome: 'Marcos Oliveira', senha: SENHA, ...dados });

const codigoErrado = (certo: string) => (certo === '000000' ? '000001' : '000000');

describe('pedido de código de autocadastro', () => {
  it('CPF novo → 202 e código CADASTRO no telefone informado', async () => {
    const cpf = gerarCpfValido();
    const telefone = novoTelefone();

    const resposta = await pedirCodigo(cpf, telefone);

    expect(resposta.status).toBe(202);
    expect(contexto.enviador.ultimoCodigoPara(telefone)).toMatch(/^\d{6}$/);
    const linha = await contexto.prisma.codigoVerificacao.findFirstOrThrow({ where: { identificador: cpf } });
    expect(linha.finalidade).toBe('CADASTRO');
    expect(linha.destino).toBe(telefone);
  });

  it('CPF de paciente sem login → 202 e código ATIVACAO no telefone que a clínica tem, não no informado', async () => {
    const paciente = await criarPaciente(contexto);
    const telefoneDigitado = novoTelefone();

    const resposta = await pedirCodigo(paciente.cpf, telefoneDigitado);

    expect(resposta.status).toBe(202);
    expect(contexto.enviador.ultimoCodigoPara(paciente.telefone)).toMatch(/^\d{6}$/);
    expect(contexto.enviador.mensagens.some((mensagem) => mensagem.destino === telefoneDigitado)).toBe(false);
    const linha = await contexto.prisma.codigoVerificacao.findFirstOrThrow({ where: { identificador: paciente.cpf } });
    expect(linha.finalidade).toBe('ATIVACAO');
  });

  it('CPF com login → 202 e SMS de orientação ao telefone cadastrado, sem código válido', async () => {
    const paciente = await criarPaciente(contexto, {}, { comLogin: true });
    const telefoneDigitado = novoTelefone();

    const resposta = await pedirCodigo(paciente.cpf, telefoneDigitado);

    expect(resposta.status).toBe(202);
    const enviadas = contexto.enviador.mensagens.filter((mensagem) => mensagem.destino === paciente.telefone);
    expect(enviadas).toHaveLength(1);
    expect(enviadas[0]?.texto).toContain('Recuperar senha');
    expect(enviadas[0]?.texto).not.toMatch(/\d{6}/);
    expect(contexto.enviador.mensagens.some((mensagem) => mensagem.destino === telefoneDigitado)).toBe(false);
    const linha = await contexto.prisma.codigoVerificacao.findFirstOrThrow({ where: { identificador: paciente.cpf } });
    expect(linha.destino).toBeNull();
  });

  it('as três respostas têm corpo idêntico', async () => {
    const semLogin = await criarPaciente(contexto);
    const comLogin = await criarPaciente(contexto, {}, { comLogin: true });

    const respostas = await Promise.all([
      pedirCodigo(gerarCpfValido(), novoTelefone()),
      pedirCodigo(semLogin.cpf, novoTelefone()),
      pedirCodigo(comLogin.cpf, novoTelefone()),
    ]);

    for (const resposta of respostas) {
      expect(resposta.status).toBe(202);
      expect(resposta.body).toEqual({ mensagem: MENSAGEM_PADRAO });
    }
  });

  it('CPF com dígito verificador errado → 400 ENTRADA_INVALIDA', async () => {
    const cpf = gerarCpfValido();
    const cpfErrado = cpf.slice(0, 10) + String((Number(cpf[10]) + 1) % 10);

    const resposta = await pedirCodigo(cpfErrado, novoTelefone());

    expect(resposta.status).toBe(400);
    expect(resposta.body.erro.codigo).toBe('ENTRADA_INVALIDA');
  });

  it('4º pedido na hora → 429', async () => {
    const cpf = gerarCpfValido();
    const telefone = novoTelefone();
    for (let pedido = 0; pedido < 3; pedido++) await pedirCodigo(cpf, telefone);

    const resposta = await pedirCodigo(cpf, telefone);

    expect(resposta.status).toBe(429);
    expect(resposta.body.erro.codigo).toBe('LIMITE_DE_CODIGOS');
  });
});

describe('confirmação do autocadastro', () => {
  it('confirmar CADASTRO → 201 logado; cria Cliente e Login; pacienteDesde = hoje', async () => {
    const cpf = gerarCpfValido();
    const telefone = novoTelefone();
    await pedirCodigo(cpf, telefone);

    const resposta = await confirmar({
      cpf,
      telefone,
      codigo: contexto.enviador.ultimoCodigoPara(telefone),
      email: 'Marcos@Email.com',
      nascimento: '1985-05-15',
    });

    expect(resposta.status).toBe(201);
    expect(resposta.body.accessToken).toEqual(expect.any(String));
    expect(resposta.body.usuario).toEqual({ id: expect.any(String), tipo: 'CLIENTE', nome: 'Marcos Oliveira' });
    expect(resposta.headers['set-cookie']?.[0]).toMatch(/^dentagenda_refresh=/);
    const cliente = await contexto.prisma.cliente.findUniqueOrThrow({ where: { cpf }, include: { login: true } });
    expect(cliente.id).toBe(resposta.body.usuario.id);
    expect(cliente.telefone).toBe(telefone);
    expect(cliente.email).toBe('marcos@email.com');
    expect(cliente.nascimento?.toISOString().slice(0, 10)).toBe('1985-05-15');
    expect(cliente.pacienteDesde.toISOString().slice(0, 10)).toBe(dataEmSaoPaulo(contexto.relogio.agora()));
    expect(cliente.login).not.toBeNull();
  });

  it('confirmar CADASTRO com telefone diferente do que recebeu o código → 400 CODIGO_INVALIDO', async () => {
    const cpf = gerarCpfValido();
    const telefone = novoTelefone();
    await pedirCodigo(cpf, telefone);

    const resposta = await confirmar({ cpf, telefone: novoTelefone(), codigo: contexto.enviador.ultimoCodigoPara(telefone) });

    expect(resposta.status).toBe(400);
    expect(resposta.body.erro.codigo).toBe('CODIGO_INVALIDO');
    expect(await contexto.prisma.cliente.count({ where: { cpf } })).toBe(0);
  });

  it('confirmar ATIVACAO cria só o Login; nome e telefone digitados não sobrescrevem', async () => {
    const paciente = await criarPaciente(contexto, { nome: 'Nome da Clínica' });
    await pedirCodigo(paciente.cpf, novoTelefone());

    const resposta = await confirmar({
      cpf: paciente.cpf,
      telefone: novoTelefone(),
      nome: 'Nome Digitado',
      codigo: contexto.enviador.ultimoCodigoPara(paciente.telefone),
    });

    expect(resposta.status).toBe(201);
    expect(resposta.body.usuario).toEqual({ id: paciente.id, tipo: 'CLIENTE', nome: 'Nome da Clínica' });
    const depois = await contexto.prisma.cliente.findUniqueOrThrow({ where: { id: paciente.id }, include: { login: true } });
    expect(depois.nome).toBe('Nome da Clínica');
    expect(depois.telefone).toBe(paciente.telefone);
    expect(depois.login).not.toBeNull();
  });

  it('CPF com login: confirmar com qualquer código → 400 CODIGO_INVALIDO', async () => {
    const paciente = await criarPaciente(contexto, {}, { comLogin: true });
    await pedirCodigo(paciente.cpf, paciente.telefone);

    const resposta = await confirmar({ cpf: paciente.cpf, telefone: paciente.telefone, codigo: '123456' });

    expect(resposta.status).toBe(400);
    expect(resposta.body.erro.codigo).toBe('CODIGO_INVALIDO');
  });

  it('CPF cadastrado pela recepção entre o pedido e a confirmação → 400 CODIGO_INVALIDO', async () => {
    const cpf = gerarCpfValido();
    const telefone = novoTelefone();
    await pedirCodigo(cpf, telefone);
    const codigo = contexto.enviador.ultimoCodigoPara(telefone);
    const daRecepcao = await criarPaciente(contexto, { cpf, nome: 'Cadastro da Recepção' });

    const resposta = await confirmar({ cpf, telefone, codigo });

    expect(resposta.status).toBe(400);
    expect(resposta.body.erro.codigo).toBe('CODIGO_INVALIDO');
    expect(await contexto.prisma.login.count({ where: { clienteId: daRecepcao.id } })).toBe(0);
  });

  it('CPF gravado pela recepção entre a leitura e a escrita → 400 CODIGO_INVALIDO (UNIQUE do banco)', async () => {
    const cpf = gerarCpfValido();
    const telefone = novoTelefone();
    await pedirCodigo(cpf, telefone);
    const codigo = contexto.enviador.ultimoCodigoPara(telefone);
    await criarPaciente(contexto, { cpf });
    // Simula a corrida: a leitura do service acontece antes do cadastro da recepção.
    const leitura = vi.spyOn(contexto.prisma.cliente, 'findUnique').mockResolvedValueOnce(null);

    const resposta = await confirmar({ cpf, telefone, codigo });
    leitura.mockRestore();

    expect(resposta.status).toBe(400);
    expect(resposta.body.erro.codigo).toBe('CODIGO_INVALIDO');
  });

  it('código errado não cria nada', async () => {
    const cpf = gerarCpfValido();
    const telefone = novoTelefone();
    await pedirCodigo(cpf, telefone);

    const resposta = await confirmar({ cpf, telefone, codigo: codigoErrado(contexto.enviador.ultimoCodigoPara(telefone)) });

    expect(resposta.status).toBe(400);
    expect(resposta.body.erro.codigo).toBe('CODIGO_INVALIDO');
    expect(await contexto.prisma.cliente.count({ where: { cpf } })).toBe(0);
  });
});
