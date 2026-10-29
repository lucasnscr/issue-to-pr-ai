import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { createHash,timingSafeEqual } from 'node:crypto';
// Dedicated lab VM only. No credentials, filesystem endpoint, arbitrary URL or public bind.
const allowed = new Set(['/api/version', '/api/tags', '/api/show', '/api/ps', '/api/chat', '/v1/chat/completions', '/v1/models']);
const token=process.env.OLLAMA_GATEWAY_TOKEN;
let requests=0;
const server=createServer(async (req, res) => {
  try {
    if(token&&!timingSafeEqual(createHash('sha256').update(req.headers.authorization||'').digest(),createHash('sha256').update('Bearer '+token).digest())){res.writeHead(401).end();return;}
    if(++requests>100){res.writeHead(429).end();return;}
    if (!allowed.has(req.url) || !['POST', 'GET'].includes(req.method)) { res.writeHead(404).end(); return; }
    let body = '', bytes = 0;
    for await (const chunk of req) { bytes += chunk.length; if (bytes > 524288) throw new Error(); body += chunk; }
    if (body && JSON.parse(body).model !== 'qwen3-coder:30b') { res.writeHead(403).end(); return; }
    const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),180000);
    res.once('close',()=>{clearTimeout(timer);if(!res.writableEnded)abort.abort();});
    const response = await fetch('http://host.lima.internal:11434' + req.url, { method: req.method,
      redirect: 'error', headers: { 'content-type': 'application/json' }, ...(body ? { body } : {}), signal: abort.signal });
    res.writeHead(response.status, { 'content-type': response.headers.get('content-type') || 'application/json' });
    Readable.fromWeb(response.body).pipe(res);
  } catch { if (!res.headersSent) res.writeHead(502); res.end(); }
});
const port=Number(process.env.OLLAMA_PROXY_PORT||11434);
if(!Number.isInteger(port)||port<0||port>65535)throw Error('Invalid loopback gateway port.');
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({listening:server.address().port})));
