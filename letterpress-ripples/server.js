// 零依赖静态服务器：npm run dev -- --port 7100 --host 127.0.0.1
const http = require('http');
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const eq = argv.find(a => a.startsWith('--' + name + '='));
  if (eq) return eq.split('=')[1];
  const i = argv.indexOf('--' + name);
  if (i > -1 && argv[i + 1] && !argv[i + 1].startsWith('--')) return argv[i + 1];
  return fallback;
}

const port = parseInt(arg('port', '7100'), 10);
const host = arg('host', '127.0.0.1');
const root = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/' || p === '') p = '/index.html';
  const file = path.normalize(path.join(root, p));
  if (!file.startsWith(root)) {
    res.writeHead(403); res.end('forbidden'); return;
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(port, host, () => {
  console.log('dev server: http://' + host + ':' + port + '/');
});
