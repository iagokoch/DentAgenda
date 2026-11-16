import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Consultas feitas pela tela "Consultas" da clínica (visões Dia e Lista de 30 dias). Mesmas regras do baseline.js:
// ambiente fictício isolado, banco *_performance_test e rate limit de autenticação preservado.
const base = (__ENV.BASE_URL || '').replace(/\/$/, '');
if (!base || !__ENV.PERFORMANCE_SENHA) throw new Error('Defina BASE_URL e PERFORMANCE_SENHA para um ambiente fictício autorizado.');
const referencias = JSON.parse(open(__ENV.PERFORMANCE_REFERENCIAS || './resultados/dataset.json'));
const erros = new Rate('erros_inesperados');
const dia = new Trend('latencia_dia', true);
const lista = new Trend('latencia_lista_30_dias', true);
const dentistas = new Trend('latencia_dentistas', true);

export const options = {
  scenarios: { tela: { executor: 'constant-vus', vus: Number(__ENV.VUS || 10), duration: __ENV.DURACAO || '3m' } },
  thresholds: {
    erros_inesperados: ['rate<0.01'],
    latencia_dia: ['p(95)<=500', 'p(99)<=1000'],
    latencia_lista_30_dias: ['p(95)<=500', 'p(99)<=1000'],
    latencia_dentistas: ['p(95)<=500'],
  },
};

const somarDias = (data, dias) => new Date(Date.parse(`${data}T12:00:00Z`) + dias * 86400000).toISOString().slice(0, 10);

export function setup() {
  const resposta = http.post(`${base}/api/auth/funcionario/login`, JSON.stringify({ email: 'carga.recepcao@exemplo.invalid', senha: __ENV.PERFORMANCE_SENHA }), { headers: { 'Content-Type': 'application/json' } });
  if (!check(resposta, { 'login aceito': (r) => r.status === 200 })) throw new Error('Login de carga recusado.');
  return { token: resposta.json('accessToken') };
}

export default function (dados) {
  const cabecalho = { headers: { Authorization: `Bearer ${dados.token}` } };
  const dataDoDia = referencias.data.slice(0, 10);
  const pedidos = [
    [dia, `/api/consultas?de=${dataDoDia}&ate=${dataDoDia}&porPagina=100`],
    [lista, `/api/consultas?de=${dataDoDia}&ate=${somarDias(dataDoDia, 30)}&porPagina=100`],
    [dentistas, '/api/dentistas'],
  ];
  for (const [metrica, caminho] of pedidos) {
    const resposta = http.get(`${base}${caminho}`, cabecalho);
    metrica.add(resposta.timings.duration);
    erros.add(!check(resposta, { 'resposta esperada': (r) => r.status === 200 }));
  }
  sleep(1);
}
