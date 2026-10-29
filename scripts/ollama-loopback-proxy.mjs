import { createServer } from 'node:http';
import { Readable } from 'node:stream';
// Dedicated lab VM only. No credentials, filesystem endpoint, arbitrary URL or public bind.
const allowed = new Set(['/api/version', '/api/tags', '/api/show', '/api/ps', '/api/chat', '/v1/chat/completions', '/v1/models']);
createServer(async (req, res) => {
  try {
    if (!allowed.has(req.url) || !['POST', 'GET'].includes(req.method)) { res.writeHead(404).end(); return; }
    let body = '', bytes = 0;
    for await (const chunk of req) { bytes += chunk.length; if (bytes > 524288) throw new Error(); body += chunk; }
    if (body && JSON.parse(body).model !== 'qwen3-coder:30b') { res.writeHead(403).end(); return; }
    const response = await fetch('http://host.lima.internal:11434' + req.url, { method: req.method,
      redirect: 'error', headers: { 'content-type': 'application/json' }, ...(body ? { body } : {}), signal: AbortSignal.timeout(180000) });
    res.writeHead(response.status, { 'content-type': response.headers.get('content-type') || 'application/json' });
    Readable.fromWeb(response.body).pipe(res);
  } catch { if (!res.headersSent) res.writeHead(502); res.end(); }
}).listen(11434, '127.0.0.1');
