const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const test = require('node:test');

function request(port, target) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: target }, res => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.setTimeout(3000, () => req.destroy(new Error('request timeout')));
    req.on('error', reject);
  });
}

test('malformed paths return 400 and leave the preview server available', async t => {
  const reservation = net.createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const child = spawn(process.execPath, [path.join(__dirname, 'server.js'), '--port', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => child.kill());
  await Promise.race([
    once(child.stdout, 'data'),
    once(child, 'exit').then(() => { throw new Error('server exited before startup'); })
  ]);
  assert.equal(await request(port, '/'), 200);
  for (const target of ['/%', '/%FF', '/%E0%A4%A', '/%00', '/index.html%00.js']) {
    assert.equal(await request(port, target), 400, target);
    assert.equal(await request(port, '/index.html?preview=1'), 200);
    assert.equal(child.exitCode, null);
  }
  assert.equal(await request(port, '/not-a-real-file'), 404);
});
