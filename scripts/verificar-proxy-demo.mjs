// Fixture EXCLUSIVA do ensaio local Docker. Não é importada nem servida pela API real.
import assert from 'node:assert/strict';
import http from 'node:http';

if (process.argv[2] === 'api') {
  http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ headers: req.headers }));
  }).listen(3000, '0.0.0.0');
} else {
  function pedir(headers = {}, caminho = '/api/inspecionar') {
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: 'front', port: 8080, path: caminho,
        headers: {
          Host: 'demo.trycloudflare.com',
          'CF-Connecting-IP': '198.51.100.20',
          'X-Forwarded-Proto': 'https',
          ...headers,
        },
        timeout: 5000,
      }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, body }));
      });
      req.on('timeout', () => req.destroy(new Error('Proxy não respondeu no prazo.')));
      req.on('error', reject);
      req.end();
    });
  }
  try {
    if (process.argv[2] === 'nao-confiavel') {
      assert.equal((await pedir()).status, 403);
      assert.equal((await pedir({}, '/')).status, 403);
      console.log('OK: peer não confiável rejeitado na página e API.');
    } else {
      let pronto = false;
      for (let tentativa = 0; tentativa < 30; tentativa++) {
        try { pronto = (await pedir({}, '/saude')).status === 200; } catch { /* aguarda somente fixture */ }
        if (pronto) break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      assert.ok(pronto, 'Fixture não ficou pronta.');
      for (const ip of ['198.51.100.20', '2001:db8::1234', '::ffff:192.0.2.7']) {
        const resposta = await pedir({
          'CF-Connecting-IP': ip,
          'X-Forwarded-For': '1.1.1.1, 2.2.2.2',
          'X-Forwarded-Host': 'host-forjado.invalid',
          Forwarded: 'for=1.1.1.1;proto=http;host=forjado.invalid',
          'X-Real-IP': '1.1.1.1',
          'True-Client-IP': '1.1.1.1',
          'CF-Connecting-IPv6': '2001:db8::bad',
        });
        assert.equal(resposta.status, 200, `IP válido recusado: ${ip}`);
        const { headers } = JSON.parse(resposta.body);
        // As duas serializações de IPv4-mapped representam o mesmo endereço.
        if (ip === '::ffff:192.0.2.7') assert.ok(['::ffff:192.0.2.7', '192.0.2.7'].includes(headers['x-forwarded-for']));
        else assert.equal(headers['x-forwarded-for'], ip);
        assert.equal(headers['x-forwarded-proto'], 'https');
        assert.equal(headers['x-forwarded-host'], 'demo.trycloudflare.com');
        assert.equal(headers.host, 'demo.trycloudflare.com');
        for (const removido of ['forwarded', 'x-real-ip', 'cf-connecting-ip', 'cf-connecting-ipv6', 'true-client-ip']) {
          assert.equal(headers[removido], undefined, `Header não removido: ${removido}`);
        }
      }
      console.log('OK: IPv4, IPv6, IPv4-mapped e normalização dos headers do visitante.');
      for (const ip of ['', '999.1.1.1', '::gg', '1.2.3.4:80', '[2001:db8::1]:80', '198.51.100.20, 198.51.100.21', '172.30.247.2']) {
        assert.equal((await pedir({ 'CF-Connecting-IP': ip })).status, 400, 'IP inválido não rejeitado.');
        assert.equal((await pedir({ 'CF-Connecting-IP': ip }, '/')).status, 400, 'Página não protege IP inválido.');
      }
      assert.equal((await pedir({ 'CF-Connecting-IP': ['198.51.100.20', '198.51.100.21'] })).status, 400);
      for (const protocolo of ['', 'http', 'https,http', 'HTTPS']) {
        assert.equal((await pedir({ 'X-Forwarded-Proto': protocolo })).status, 400);
      }
      assert.equal((await pedir({ 'X-Forwarded-Proto': ['https', 'http'] })).status, 400);
      console.log('OK: IP inválido, lista, duplicação de headers e protocolo incompatível rejeitados.');
    }
  } catch (error) {
    console.error(`FALHA no ensaio local do proxy: ${error.message}`);
    process.exitCode = 1;
  }
}
