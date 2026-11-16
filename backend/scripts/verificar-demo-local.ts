import { ambienteDemoLocal, CONTAS_DEMO } from './preparar-demo-local.ts';
import { criarPrisma } from '../src/compartilhado/banco.ts';
import { dataEmSaoPaulo, diaSeguinte } from '../src/compartilhado/datas.ts';

type Objeto = Record<string, any>;
type Sessao = { token: string; cookie: string; usuario: Objeto; encerrada: boolean };

async function verificar(): Promise<void> {
  const { databaseUrl, porta } = ambienteDemoLocal();
  const base = `http://127.0.0.1:${porta}`;
  const prisma = criarPrisma(databaseUrl);
  const sessoes: Sessao[] = [];
  const consultasCriadas = new Set<string>();
  let recepcao: Sessao | undefined;
  let etapa = 'preflight';
  let verificacoes = 0;
  function conferir(condicao: unknown): asserts condicao {
    if (!condicao) throw new Error('Verificação não satisfeita.');
  }
  const aprovar = (nome: string) => { verificacoes++; console.log(`OK: ${nome}`); };
  async function pedir(caminho: string, sessao?: Sessao, metodo = 'GET', corpo?: Objeto, extras: Record<string, string> = {}) {
    const aceitaCorpo = metodo !== 'GET' && metodo !== 'HEAD';
    conferir(!corpo || aceitaCorpo);
    const resposta = await fetch(`${base}/api${caminho}`, {
      method: metodo,
      headers: { ...(sessao ? { Authorization: `Bearer ${sessao.token}` } : {}), ...(corpo ? { 'Content-Type': 'application/json' } : {}), ...extras },
      ...(corpo && aceitaCorpo ? { body: JSON.stringify(corpo) } : {}),
      redirect: 'error', signal: AbortSignal.timeout(10_000),
    });
    const texto = await resposta.text();
    const dados: Objeto = texto ? JSON.parse(texto) : {};
    return { status: resposta.status, dados, cookie: resposta.headers.getSetCookie().find((item) => item.startsWith('dentagenda_refresh='))?.split(';')[0] ?? '' };
  }
  async function cancelarRestantes(): Promise<void> {
    if (!recepcao) return;
    for (const id of consultasCriadas) {
      const resultado = await pedir(`/consultas/${id}/cancelamento`, recepcao, 'POST', {});
      conferir(resultado.status === 200 || (resultado.status === 422 && resultado.dados.erro?.codigo === 'CONSULTA_NAO_CANCELAVEL'));
      consultasCriadas.delete(id);
    }
  }
  try {
    // Confere IDs da instância esperada antes de alterar consultas (o login grava a sessão).
    for (const [papel, conta] of Object.entries(CONTAS_DEMO)) {
      etapa = `login ${papel}`;
      const paciente = papel === 'paciente';
      const resposta = await pedir(`/auth/${paciente ? 'cliente' : 'funcionario'}/login`, undefined, 'POST', {
        ...(paciente ? { cpf: conta.cpf } : { email: (conta as typeof CONTAS_DEMO.admin).email }), senha: process.env[conta.senha],
      });
      conferir(resposta.status === 200 && typeof resposta.dados.accessToken === 'string' && resposta.cookie);
      const sessao = { token: resposta.dados.accessToken, cookie: resposta.cookie, usuario: resposta.dados.usuario, encerrada: false };
      sessoes.push(sessao);
      const esperado = paciente
        ? await prisma.cliente.findUniqueOrThrow({ where: { cpf: conta.cpf } })
        : await prisma.funcionario.findUniqueOrThrow({ where: { email: (conta as typeof CONTAS_DEMO.admin).email } });
      conferir(sessao.usuario.id === esperado.id && sessao.usuario.tipo === (paciente ? 'CLIENTE' : 'FUNCIONARIO'));
      if (!paciente) conferir(sessao.usuario.isAdmin === (papel === 'admin') && sessao.usuario.categoria === (papel === 'dentista' ? 'DENTISTA' : 'RECEPCIONISTA'));
      const eu = await pedir('/auth/eu', sessao);
      conferir(eu.status === 200 && eu.dados.usuario.id === esperado.id);
      if (papel === 'recepcao') recepcao = sessao;
      aprovar(etapa);
    }
    const [admin, r, dentista, paciente] = sessoes;
    conferir(admin && r && dentista && paciente);
    etapa = 'permissões e dados';
    conferir((await pedir('/funcionarios', admin)).status === 200);
    conferir((await pedir('/funcionarios', r)).status === 403);
    conferir((await pedir('/funcionarios', paciente)).status === 403);
    conferir((await pedir('/pacientes?busca=Marcos', r)).status === 200);
    conferir((await pedir('/pacientes?busca=Marcos', paciente)).status === 403);
    conferir((await pedir(`/pacientes/${paciente.usuario.id}`, paciente)).status === 200);
    conferir((await pedir('/consultas/pendentes', paciente)).status === 403);
    const consultasPaciente = await pedir('/consultas', paciente);
    conferir(consultasPaciente.status === 200 && Array.isArray(consultasPaciente.dados.itens));
    conferir(consultasPaciente.dados.itens.every((item: Objeto) => item.paciente?.id === paciente.usuario.id));
    const consultasDentista = await pedir('/consultas', dentista);
    conferir(consultasDentista.status === 200 && Array.isArray(consultasDentista.dados.itens));
    conferir(consultasDentista.dados.itens.every((item: Objeto) => item.dentista?.id === dentista.usuario.id));
    aprovar(etapa);

    etapa = 'disponibilidade';
    const procedimentos = await pedir('/procedimentos', paciente);
    conferir(procedimentos.status === 200 && Array.isArray(procedimentos.dados));
    const procedimento = (procedimentos.dados as unknown as Objeto[]).find((item) => item.nome === 'Limpeza' && item.ativo);
    conferir(procedimento);
    let data = diaSeguinte(diaSeguinte(dataEmSaoPaulo(new Date())));
    let vagas: Objeto[] = [];
    for (let dia = 0; dia < 14; dia++, data = diaSeguinte(data)) {
      const resposta = await pedir(`/horarios-livres?procedimentoId=${procedimento.id}&dentistaId=${dentista.usuario.id}&data=${data}`, r);
      conferir(resposta.status === 200 && Array.isArray(resposta.dados.horarios));
      vagas = resposta.dados.horarios;
      if (vagas.length >= 2) break;
    }
    conferir(vagas.length >= 2);
    aprovar(etapa);

    etapa = 'agendamento e conflito';
    const entrada = { pacienteId: paciente.usuario.id, dentistaId: dentista.usuario.id, procedimentoId: procedimento.id, inicio: vagas[0]!.inicio };
    const criada = await pedir('/consultas', r, 'POST', entrada);
    // Guarda a identidade antes das assertivas para limpar também em caso de regressão.
    if (typeof criada.dados.id === 'string') consultasCriadas.add(criada.dados.id);
    conferir(criada.status === 201 && criada.dados.status === 'CONFIRMADA');
    const detalhe = await pedir(`/consultas/${criada.dados.id}`, paciente);
    conferir(detalhe.status === 200 && detalhe.dados.id === criada.dados.id
      && detalhe.dados.paciente?.id === paciente.usuario.id && detalhe.dados.dentista?.id === dentista.usuario.id);
    const conflito = await pedir('/consultas', r, 'POST', entrada);
    if (conflito.status === 201 && typeof conflito.dados.id === 'string') consultasCriadas.add(conflito.dados.id);
    conferir(conflito.status === 409 && conflito.dados.erro?.codigo === 'HORARIO_INDISPONIVEL');
    aprovar(etapa);

    etapa = 'remarcação';
    const remarcada = await pedir(`/consultas/${criada.dados.id}/remarcacao`, r, 'POST', { inicio: vagas[1]!.inicio });
    if (typeof remarcada.dados.nova?.id === 'string') consultasCriadas.add(remarcada.dados.nova.id);
    conferir(remarcada.status === 201 && remarcada.dados.cancelada?.id === criada.dados.id
      && remarcada.dados.cancelada.status === 'CANCELADA' && remarcada.dados.nova?.status === 'CONFIRMADA');
    consultasCriadas.delete(criada.dados.id);
    aprovar(etapa);
    etapa = 'cancelamento';
    await cancelarRestantes();
    const cancelada = await pedir(`/consultas/${remarcada.dados.nova.id}`, r);
    conferir(cancelada.status === 200 && cancelada.dados.status === 'CANCELADA');
    aprovar(etapa);

    etapa = 'refresh e logout';
    for (const sessao of sessoes) {
      const renovada = await pedir('/auth/refresh', undefined, 'POST', undefined, { Cookie: sessao.cookie, 'X-DentAgenda-Refresh': '1' });
      conferir(renovada.status === 200 && renovada.cookie && renovada.cookie !== sessao.cookie && typeof renovada.dados.accessToken === 'string');
      sessao.token = renovada.dados.accessToken;
      sessao.cookie = renovada.cookie;
      conferir((await pedir('/auth/eu', sessao)).status === 200);
      conferir((await pedir('/auth/logout', sessao, 'POST')).status === 204);
      sessao.encerrada = true;
      conferir((await pedir('/auth/eu', sessao)).status === 401);
      conferir((await pedir('/auth/refresh', undefined, 'POST', undefined, { Cookie: sessao.cookie, 'X-DentAgenda-Refresh': '1' })).status === 401);
    }
    aprovar(etapa);
    console.log(`OK: ${verificacoes} grupos de verificações HTTP reais; reservas do ensaio canceladas.`);
  } catch {
    console.error(`FALHA: verificação local na etapa ${etapa}. Nenhuma credencial foi incluída neste relatório.`);
    process.exitCode = 1;
  } finally {
    try { await cancelarRestantes(); } catch {
      console.error('FALHA: confira manualmente as consultas futuras do paciente fictício; limpeza do ensaio incompleta.');
      process.exitCode = 1;
    }
    for (const sessao of sessoes.filter((item) => !item.encerrada)) {
      try { conferir((await pedir('/auth/logout', sessao, 'POST')).status === 204); } catch {
        console.error('FALHA: encerramento de uma sessão do ensaio não confirmado.');
        process.exitCode = 1;
      }
    }
    await prisma.$disconnect();
  }
}

verificar().catch(() => {
  console.error('FALHA: configuração ou conexão da demonstração local inválida.');
  process.exitCode = 1;
});
