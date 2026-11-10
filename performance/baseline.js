import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const base = (__ENV.BASE_URL || '').replace(/\/$/, '');
if (!base || !__ENV.PERFORMANCE_SENHA) throw new Error('Defina BASE_URL e PERFORMANCE_SENHA para um ambiente fictício autorizado.');
const referencias = JSON.parse(open(__ENV.PERFORMANCE_REFERENCIAS || './resultados/dataset.json'));
const erros = new Rate('erros_inesperados');
const leituras = new Trend('latencia_leitura', true);
const escritas = new Trend('latencia_escrita', true);
const autenticacoes = new Trend('latencia_auth', true);
const conflitos = new Counter('conflitos_esperados');
const reservas = new Counter('reservas_confirmadas');
const cenarios = {
  smoke: { executor: 'constant-vus', vus: 1, duration: '20s' },
  normal: { executor: 'constant-vus', vus: 5, duration: '15m' },
  pico: { executor: 'constant-vus', vus: 20, duration: '10m' },
  resistencia: { executor: 'constant-vus', vus: 10, duration: '2h' },
  spike: { executor: 'ramping-vus', startVUs: 5, stages: [{ duration: '1m', target: 5 }, { duration: '10s', target: 40 }, { duration: '2m', target: 40 }, { duration: '1m', target: 5 }] },
  stress: { executor: 'ramping-vus', startVUs: 5, stages: [{ duration: '2m', target: 10 }, { duration: '2m', target: 20 }, { duration: '2m', target: 40 }, { duration: '2m', target: 80 }, { duration: '1m', target: 0 }] },
  conflito: { executor: 'shared-iterations', vus: 2, iterations: 2, exec: 'disputarHorario' },
};
const nomeCenario = __ENV.CENARIO || 'smoke';
if (!cenarios[nomeCenario]) throw new Error('CENARIO desconhecido.');
export const options = {
  scenarios: { [nomeCenario]: cenarios[nomeCenario] },
  thresholds: {
    erros_inesperados: ['rate<0.01'],
    ...(nomeCenario === 'conflito' ? { reservas_confirmadas: ['count==1'], conflitos_esperados: ['count==1'] } : {
      latencia_leitura: ['p(50)<=200', 'p(95)<=500', 'p(99)<=1000'],
      latencia_escrita: ['p(95)<=1000'],
    }),
    latencia_auth: ['p(95)<=1000'],
  },
};

let sessao;
function autenticar() {
  const resposta = http.post(`${base}/api/auth/funcionario/login`, JSON.stringify({
    email: 'carga.recepcao@exemplo.invalid', senha: __ENV.PERFORMANCE_SENHA,
  }), { headers: { 'Content-Type': 'application/json' }, tags: { name: 'login' } });
  autenticacoes.add(resposta.timings.duration);
  const sucesso = resposta.status === 200;
  erros.add(!sucesso);
  check(resposta, { 'login aceito': () => sucesso });
  if (!sucesso) throw new Error('Login fictício recusado; interrompa e confira o ambiente.');
  return { token: resposta.json('accessToken'), criadoEm: Date.now() };
}

export function setup() { return autenticar(); }

function cabecalhos(inicial) {
  sessao ||= inicial;
  if (Date.now() - sessao.criadoEm > 10 * 60_000) sessao = autenticar();
  return { Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' };
}

function verificar(resposta, metrica) {
  metrica.add(resposta.timings.duration);
  const sucesso = resposta.status === 200;
  erros.add(!sucesso);
  check(resposta, { 'resposta esperada': () => sucesso });
}

export default function executar(inicial) {
  const headers = cabecalhos(inicial);
  const operacao = __ITER % 5;
  const caminhos = [
    '/api/pacientes?busca=Paciente&porPagina=20',
    `/api/consultas?de=${referencias.data}&ate=${referencias.data}&dentistaId=${referencias.dentistaId}`,
    `/api/horarios-livres?data=${referencias.data}&procedimentoId=${referencias.procedimentoId}&dentistaId=${referencias.dentistaId}`,
    `/api/consultas/${referencias.consultaId}/observacao/historico`,
  ];
  if (operacao < 4) {
    verificar(http.get(`${base}${caminhos[operacao]}`, { headers, tags: { name: `leitura_${operacao}` } }), leituras);
  } else {
    verificar(http.put(`${base}/api/consultas/${referencias.consultaId}/observacao`,
      JSON.stringify({ texto: `Carga fictícia VU ${__VU}, iteração ${__ITER}` }),
      { headers, tags: { name: 'observacao' } }), escritas);
  }
  sleep(0.5);
}

export function disputarHorario(inicial) {
  const inicio = __ENV.CONFLITO_INICIO || referencias.inicioDisputa;
  if (!inicio) throw new Error('Referência de horário livre ausente; gere o dataset atualizado.');
  const resposta = http.post(`${base}/api/consultas`, JSON.stringify({
    pacienteId: referencias.pacienteId, dentistaId: referencias.dentistaId,
    procedimentoId: referencias.procedimentoId, inicio,
  }), { headers: cabecalhos(inicial), tags: { name: 'disputa_de_horario' } });
  reservas.add(resposta.status === 201 ? 1 : 0);
  conflitos.add(resposta.status === 409 ? 1 : 0);
  erros.add(![201, 409].includes(resposta.status));
  check(resposta, { 'reserva ou conflito previsto': (valor) => [201, 409].includes(valor.status) });
}
