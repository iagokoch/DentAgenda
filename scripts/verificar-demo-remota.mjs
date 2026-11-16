// Ensaio LOCAL da cadeia Docker: headers sintéticos enviados pela rede exclusiva do conector.
// Não comprova HTTPS externo, PIN Cloudflare ou permanência da sessão Access.
import assert from 'node:assert/strict';

const base = process.env.BASE_URL ?? 'http://front:8080';
assert.equal(base, 'http://front:8080', 'Verificador exclusivo da rede interna de demonstração.');
const contas = [
  { papel: 'admin', email: 'admin@exemplo.dev', senha: 'DEMO_ADMIN_SENHA' },
  { papel: 'recepcao', email: 'carla.souza@exemplo.dev', senha: 'DEMO_RECEPCAO_SENHA' },
  { papel: 'dentista', email: 'ana.costa@exemplo.dev', senha: 'DEMO_DENTISTA_SENHA' },
  { papel: 'paciente', cpf: '12345678909', senha: 'DEMO_PACIENTE_SENHA' },
];
const origem = {
  Host: 'demo.trycloudflare.com',
  'X-Forwarded-Proto': 'https',
  'CF-Connecting-IP': '198.51.100.20',
};
const sessoes = [];
const reservas = new Set();
let recepcao;
let etapa = 'preflight';
let grupos = 0;
const ok = () => { grupos++; console.log(`OK: ${etapa}`); };

async function pedir(caminho, sessao, metodo = 'GET', corpo, extras = {}) {
  const resposta = await fetch(`${base}${caminho}`, {
    method: metodo, redirect: 'error', signal: AbortSignal.timeout(10000),
    headers: {
      ...origem,
      ...(sessao ? { Authorization: `Bearer ${sessao.token}` } : {}),
      ...(corpo ? { 'Content-Type': 'application/json' } : {}),
      ...extras,
    },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
  });
  const texto = await resposta.text();
  const dados = resposta.headers.get('content-type')?.includes('application/json') && texto ? JSON.parse(texto) : {};
  const cookieCompleto = resposta.headers.getSetCookie().find((item) => item.startsWith('dentagenda_refresh=')) ?? '';
  return { status: resposta.status, dados, texto, cookieCompleto, cookie: cookieCompleto.split(';')[0], headers: resposta.headers };
}

async function limparReservas() {
  if (!recepcao) return;
  for (const id of reservas) {
    const resposta = await pedir(`/api/consultas/${id}/cancelamento`, recepcao, 'POST', {});
    assert.ok(resposta.status === 200 || (resposta.status === 422 && resposta.dados.erro?.codigo === 'CONSULTA_NAO_CANCELAVEL'));
    reservas.delete(id);
  }
}

try {
  for (const conta of contas) assert.ok((process.env[conta.senha] ?? '').length >= 12);
  etapa = 'frontend compilado, assets e fallback SPA';
  const pagina = await pedir('/');
  assert.equal(pagina.status, 200);
  assert.match(pagina.headers.get('content-type') ?? '', /text\/html/);
  assert.doesNotMatch(pagina.texto, /@vite\/client|localhost:|127\.0\.0\.1:|http:\/\//);
  const assets = [...pagina.texto.matchAll(/(?:src|href)="(\/assets\/[^"#]+)"/g)].map((m) => m[1]);
  assert.ok(assets.some((asset) => asset.endsWith('.js')));
  assert.ok(assets.some((asset) => asset.endsWith('.css')));
  for (const asset of assets) {
    const resposta = await pedir(asset);
    assert.equal(resposta.status, 200);
    assert.ok(resposta.texto.length > 0);
    assert.doesNotMatch(resposta.headers.get('content-type') ?? '', /text\/html/);
  }
  assert.equal((await pedir('/pacientes')).status, 200);
  ok();

  etapa = 'liveness, readiness e documentação privada';
  assert.equal((await pedir('/api/saude/viva')).status, 200);
  assert.equal((await pedir('/api/saude/pronta')).status, 200);
  assert.equal((await pedir('/api/docs.json')).status, 404);
  assert.equal((await pedir('/api/docs')).status, 404);
  ok();

  etapa = 'cadastro e recuperação indisponíveis sem códigos';
  for (const caminho of ['cliente/cadastro/codigo', 'cliente/cadastro/confirmar', 'cliente/recuperacao/codigo', 'cliente/recuperacao/confirmar', 'funcionario/recuperacao/codigo', 'funcionario/recuperacao/confirmar']) {
    const resposta = await pedir(`/api/auth/${caminho}`, undefined, 'POST', {});
    assert.equal(resposta.status, 503);
    assert.equal(resposta.dados.erro?.codigo, 'MENSAGERIA_INDISPONIVEL_DEMO');
    assert.deepEqual(Object.keys(resposta.dados), ['erro']);
  }
  ok();

  for (const conta of contas) {
    etapa = `login, identidade e cookie seguro: ${conta.papel}`;
    const paciente = conta.papel === 'paciente';
    const resposta = await pedir(`/api/auth/${paciente ? 'cliente' : 'funcionario'}/login`, undefined, 'POST', {
      ...(paciente ? { cpf: conta.cpf } : { email: conta.email }), senha: process.env[conta.senha],
    });
    assert.equal(resposta.status, 200);
    assert.equal(typeof resposta.dados.accessToken, 'string');
    assert.match(resposta.cookieCompleto, /;\s*Secure(?:;|$)/i);
    assert.match(resposta.cookieCompleto, /;\s*HttpOnly(?:;|$)/i);
    assert.match(resposta.cookieCompleto, /;\s*SameSite=Strict(?:;|$)/i);
    assert.match(resposta.cookieCompleto, /;\s*Path=\/api\/auth\/refresh(?:;|$)/i);
    const sessao = { token: resposta.dados.accessToken, cookie: resposta.cookie, usuario: resposta.dados.usuario, encerrada: false };
    sessoes.push(sessao);
    const eu = await pedir('/api/auth/eu', sessao);
    assert.equal(eu.status, 200);
    assert.equal(eu.dados.usuario.id, sessao.usuario.id);
    assert.equal(sessao.usuario.tipo, paciente ? 'CLIENTE' : 'FUNCIONARIO');
    if (!paciente) {
      assert.equal(sessao.usuario.isAdmin, conta.papel === 'admin');
      assert.equal(sessao.usuario.categoria, conta.papel === 'dentista' ? 'DENTISTA' : 'RECEPCIONISTA');
    }
    if (conta.papel === 'recepcao') recepcao = sessao;
    ok();
  }
  const [admin, r, dentista, paciente] = sessoes;
  etapa = 'papéis, pacientes e isolamento de consultas';
  assert.equal((await pedir('/api/funcionarios', admin)).status, 200);
  for (const sessao of [r, dentista, paciente]) assert.equal((await pedir('/api/funcionarios', sessao)).status, 403);
  assert.equal((await pedir('/api/pacientes?busca=Marcos', r)).status, 200);
  assert.equal((await pedir('/api/pacientes?busca=Marcos', paciente)).status, 403);
  assert.equal((await pedir(`/api/pacientes/${paciente.usuario.id}`, paciente)).status, 200);
  assert.equal((await pedir('/api/consultas/pendentes', paciente)).status, 403);
  for (const [sessao, chave] of [[paciente, 'paciente'], [dentista, 'dentista']]) {
    const lista = await pedir('/api/consultas', sessao);
    assert.equal(lista.status, 200);
    assert.ok(Array.isArray(lista.dados.itens));
    assert.ok(lista.dados.itens.length > 0);
    assert.ok(lista.dados.itens.every((item) => item[chave]?.id === sessao.usuario.id));
  }
  ok();

  etapa = 'disponibilidade real';
  const procedimentos = await pedir('/api/procedimentos', paciente);
  assert.equal(procedimentos.status, 200);
  const procedimento = procedimentos.dados.find((item) => item.nome === 'Limpeza' && item.ativo);
  assert.ok(procedimento);
  let vagas = [];
  const dia = new Date();
  dia.setUTCDate(dia.getUTCDate() + 2);
  for (let i = 0; i < 14; i++, dia.setUTCDate(dia.getUTCDate() + 1)) {
    const data = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(dia);
    const resposta = await pedir(`/api/horarios-livres?procedimentoId=${procedimento.id}&dentistaId=${dentista.usuario.id}&data=${data}`, r);
    assert.equal(resposta.status, 200);
    vagas = resposta.dados.horarios;
    if (vagas.length >= 2) break;
  }
  assert.ok(vagas.length >= 2);
  ok();

  etapa = 'agendamento, detalhes e conflito';
  const entrada = { pacienteId: paciente.usuario.id, dentistaId: dentista.usuario.id, procedimentoId: procedimento.id, inicio: vagas[0].inicio };
  const criada = await pedir('/api/consultas', r, 'POST', entrada);
  if (criada.dados.id) reservas.add(criada.dados.id);
  assert.equal(criada.status, 201);
  assert.equal(criada.dados.status, 'CONFIRMADA');
  const detalhe = await pedir(`/api/consultas/${criada.dados.id}`, paciente);
  assert.equal(detalhe.status, 200);
  assert.equal(detalhe.dados.id, criada.dados.id);
  const conflito = await pedir('/api/consultas', r, 'POST', entrada);
  if (conflito.status === 201 && conflito.dados.id) reservas.add(conflito.dados.id);
  assert.equal(conflito.status, 409);
  assert.equal(conflito.dados.erro?.codigo, 'HORARIO_INDISPONIVEL');
  ok();

  etapa = 'remarcação e cancelamento';
  const remarcada = await pedir(`/api/consultas/${criada.dados.id}/remarcacao`, r, 'POST', { inicio: vagas[1].inicio });
  if (remarcada.dados.nova?.id) reservas.add(remarcada.dados.nova.id);
  assert.equal(remarcada.status, 201);
  assert.equal(remarcada.dados.cancelada.id, criada.dados.id);
  assert.equal(remarcada.dados.cancelada.status, 'CANCELADA');
  assert.equal(remarcada.dados.nova.status, 'CONFIRMADA');
  reservas.delete(criada.dados.id);
  await limparReservas();
  assert.equal((await pedir(`/api/consultas/${remarcada.dados.nova.id}`, r)).dados.status, 'CANCELADA');
  ok();

  etapa = 'CSRF, rotação refresh, logout e revogação';
  assert.equal((await pedir('/api/auth/refresh', undefined, 'POST', undefined, { Cookie: paciente.cookie })).status, 401);
  for (const sessao of sessoes) {
    const renovada = await pedir('/api/auth/refresh', undefined, 'POST', undefined, { Cookie: sessao.cookie, 'X-DentAgenda-Refresh': '1' });
    assert.equal(renovada.status, 200);
    assert.ok(renovada.cookie && renovada.cookie !== sessao.cookie);
    sessao.cookie = renovada.cookie;
    sessao.token = renovada.dados.accessToken;
    assert.equal((await pedir('/api/auth/eu', sessao)).status, 200);
    assert.equal((await pedir('/api/auth/logout', sessao, 'POST')).status, 204);
    sessao.encerrada = true;
    assert.equal((await pedir('/api/auth/eu', sessao)).status, 401);
    assert.equal((await pedir('/api/auth/refresh', undefined, 'POST', undefined, { Cookie: sessao.cookie, 'X-DentAgenda-Refresh': '1' })).status, 401);
  }
  ok();
  console.log(`OK: ${grupos} grupos locais pela cadeia compilada. HTTPS/Access externo ainda não validado.`);
} catch {
  console.error(`FALHA: cadeia local na etapa ${etapa}; detalhes e credenciais omitidos.`);
  process.exitCode = 1;
} finally {
  try { await limparReservas(); } catch {
    console.error('FALHA: verificar reservas fictícias do ensaio; limpeza incompleta.');
    process.exitCode = 1;
  }
  for (const sessao of sessoes.filter((item) => !item.encerrada)) {
    try { assert.equal((await pedir('/api/auth/logout', sessao, 'POST')).status, 204); } catch {
      console.error('FALHA: encerramento de sessão de ensaio não confirmado.');
      process.exitCode = 1;
    }
  }
}
