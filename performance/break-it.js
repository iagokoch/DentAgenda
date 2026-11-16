import http from 'k6/http';
import { check, fail, sleep } from 'k6';

const base = __ENV.BREAK_IT_BASE_URL || '';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base) || !__ENV.BREAK_IT_COMPROVANTE || !__ENV.BREAK_IT_ACCESS_TOKEN) {
  throw new Error('Execute somente pelo runner de carga descartável.');
}

export const options = {
  scenarios: { leitura: { executor: 'constant-vus', vus: 5, duration: '20s', gracefulStop: '2s' } },
  setupTimeout: '5s',
  thresholds: { http_req_failed: ['rate==0'], checks: ['rate==1'] },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(95)', 'p(99)'],
  discardResponseBodies: true,
};

export function setup() {
  const resposta = http.get(`${base}/__break_it/isolamento`, { timeout: '3s', responseType: 'text' });
  if (resposta.status !== 200 || resposta.json('comprovante') !== __ENV.BREAK_IT_COMPROVANTE
    || resposta.json('banco') !== 'dentagenda_break_it_performance_test') {
    fail('A API não comprovou vínculo com o ambiente descartável criado pelo runner.');
  }
}

export default function executar() {
  const caminhos = [
    '/api/pacientes?busca=Paciente&porPagina=10',
    `/api/consultas?de=${__ENV.BREAK_IT_DATA}&ate=${__ENV.BREAK_IT_DATA}&dentistaId=${__ENV.BREAK_IT_DENTISTA_ID}`,
    `/api/horarios-livres?data=${__ENV.BREAK_IT_DATA}&procedimentoId=${__ENV.BREAK_IT_PROCEDIMENTO_ID}&dentistaId=${__ENV.BREAK_IT_DENTISTA_ID}`,
    `/api/consultas/${__ENV.BREAK_IT_CONSULTA_ID}/observacao/historico`,
  ];
  const indice = __ITER % caminhos.length;
  const resposta = http.get(`${base}${caminhos[indice]}`, {
    headers: { Authorization: `Bearer ${__ENV.BREAK_IT_ACCESS_TOKEN}` },
    timeout: '3s', redirects: 0, tags: { name: `leitura_${indice}` },
  });
  check(resposta, { 'leitura autorizada responde 200': (valor) => valor.status === 200 });
  sleep(0.25);
}
