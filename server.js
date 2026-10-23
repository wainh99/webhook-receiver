// Webhook receiver for Deplexo (free tier: 128MB RAM).
// Zero dependencies, plain node:http.
// - POST any path  -> captures headers + raw body, stores it, optionally forwards
// - GET  /         -> dashboard with recent webhooks
// - GET /health    -> health check for Deplexo
// Env: PORT (default 3000), WEBHOOK_TOKEN (optional shared secret, checked via
//        ?token= query or X-Webhook-Token header), FORWARD_URL (optional),
//        MAX_KEEP (default 200)

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || '3000', 10);
const TOKEN = process.env.WEBHOOK_TOKEN || '';
const FORWARD_URL = process.env.FORWARD_URL || '';
const MAX_KEEP = parseInt(process.env.MAX_KEEP || '200', 10);
const LOG_FILE = '/data/webhooks.log';

const recent = []; // newest first

function ensureLogDir() {
  try { fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true }); } catch (_) {}
}

function appendLog(entry) {
  try { fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n'); } catch (_) {}
}

function authorized(req, url) {
  if (!TOKEN) return true;
  if (url.searchParams.get('token') === TOKEN) return true;
  if (req.headers['x-webhook-token'] === TOKEN) return true;
  return false;
}

function forward(entry) {
  if (!FORWARD_URL) return;
  const data = JSON.stringify(entry);
  const target = new URL(FORWARD_URL);
  const mod = target.protocol === 'https:' ? require('https') : http;
  const r = mod.request({
    hostname: target.hostname,
    port: target.port || (target.protocol === 'https:' ? 443 : 80),
    path: target.pathname + target.search,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    timeout: 10000,
  });
  r.on('error', (e) => console.error('[forward] error:', e.message));
  r.end(data);
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function dashboard() {
  const rows = recent.map((e) => {
    const body = e.body.length > 2000 ? e.body.slice(0, 2000) + '…(truncated)' : e.body;
    return `<div class="card">
      <div class="meta"><b>${esc(e.time)}</b> · <code>${esc(e.method)} ${esc(e.path)}</code> · ${esc(e.ip)} · ${e.size} bytes</div>
      <details><summary>headers</summary><pre>${esc(JSON.stringify(e.headers, null, 2))}</pre></details>
      <details open><summary>body</summary><pre>${esc(body)}</pre></details>
    </div>`;
  }).join('\n') || '<p class="empty">还没有收到 webhook。把这个地址填到服务方的 webhook 设置里：<code>POST ' + esc(process.env.PUBLIC_URL || '(你的 deplexo 域名)') + '/hook</code></p>';

  return `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Webhook 接收器</title>
<style>body{font-family:system-ui,sans-serif;max-width:900px;margin:0 auto;padding:16px;background:#0f1115;color:#e6e6e6}
h1{font-size:20px}.card{background:#1a1d24;border:1px solid #2a2e38;border-radius:8px;padding:12px;margin:12px 0}
.meta{font-size:13px;color:#9aa0ae;margin-bottom:8px}code{background:#262a33;padding:2px 6px;border-radius:4px}
pre{background:#101218;padding:10px;border-radius:6px;overflow:auto;max-height:300px;font-size:12px}
details{margin-top:6px}summary{cursor:pointer;color:#7db4ff}.empty{color:#9aa0ae}
.top{color:#9aa0ae;font-size:13px}</style></head><body>
<h1>📡 Webhook 接收器</h1>
<p class="top">共收到 ${recent.length} 条（页面只保留最近 ${MAX_KEEP} 条，全部记录在 /data/webhooks.log）${FORWARD_URL ? ' · 已开启转发 → ' + esc(FORWARD_URL) : ''}</p>
${rows}
<script>setTimeout(()=>location.reload(),30000)</script>
</body></html>`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/healthz')) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('ok');
  }

  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(dashboard());
  }

  if (req.method === 'POST') {
    if (!authorized(req, url)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'unauthorized' }));
    }
    const chunks = [];
    req.on('data', (c) => {
      chunks.push(c);
      if (Buffer.concat(chunks).length > 2 * 1024 * 1024) req.destroy(); // 2MB cap
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks);
      const entry = {
        time: new Date().toISOString(),
        method: req.method,
        path: url.pathname + url.search,
        ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
        headers: req.headers,
        size: raw.length,
        body: raw.toString('utf8'),
      };
      recent.unshift(entry);
      if (recent.length > MAX_KEEP) recent.length = MAX_KEEP;
      appendLog(entry);
      forward(entry);
      console.log(`[webhook] ${entry.time} ${entry.method} ${entry.path} ${entry.size}B from ${entry.ip}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    req.on('error', () => {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'bad request' }));
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

ensureLogDir();
server.listen(PORT, '0.0.0.0', () => {
  console.log(`webhook receiver listening on :${PORT}`);
});
