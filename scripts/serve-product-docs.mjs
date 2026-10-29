import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
const files = new Map([
  ['/', ['../docs/product/index.html', 'text/html']],
  ['/product.css', ['../docs/product/product.css', 'text/css']],
  ['/product.js', ['../docs/product/product.js', 'text/javascript']],
  ['/phases.js', ['../docs/product/phases.js', 'text/javascript']],
  ['/changelog', ['../docs/changelogs/ollama-integration.md', 'text/plain']],
  ['/changelogs/ollama-integration.md', ['../docs/changelogs/ollama-integration.md', 'text/plain']],
]);
createServer((req, res) => {
  const target = files.get(new URL(req.url, 'http://localhost').pathname);
  if (!target || req.method !== 'GET') { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': target[1] + '; charset=utf-8',
    'content-security-policy': "default-src 'self'; object-src 'none'; base-uri 'none'", 'x-content-type-options': 'nosniff' });
  res.end(readFileSync(new URL(target[0], import.meta.url)));
}).listen(Number(process.env.PORT || 4330), '127.0.0.1', () => console.log('Documentação: http://127.0.0.1:' + (process.env.PORT || 4330)));
