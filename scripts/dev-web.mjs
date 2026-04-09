/**
 * Servidor local: estáticos en public/ + POST /api/chat (misma lógica que Vercel).
 * Carga siempre `dist/` (JS compilado). `npm run dev:web` ejecuta `build` antes de arrancar.
 * → http://localhost:3000
 */
import 'dotenv/config';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const publicDir = path.resolve(root, 'public');
const distChat = path.resolve(root, 'dist', 'routes', 'handleChatPost.js');
const distChatHistory = path.resolve(root, 'dist', 'routes', 'handleChatHistoryGet.js');
const distChatClear = path.resolve(root, 'dist', 'routes', 'handleChatClearPost.js');
const distResumen = path.resolve(root, 'dist', 'routes', 'handleResumenCuentasGet.js');
const distVerify = path.resolve(root, 'dist', 'services', 'verifySessionToken.js');

const API_WITH_OPTIONS = [
  '/api/chat',
  '/api/resumen-cuentas',
  '/api/chat-history',
  '/api/chat-clear',
  '/api/auth-config',
  '/api/auth-session',
];
const PREFERRED_PORT = Number(process.env.PORT) || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function safePublicPath(urlPath) {
  const rel = urlPath === '/' || urlPath === '' ? 'index.html' : urlPath.replace(/^\//, '');
  const resolved = path.resolve(publicDir, rel);
  if (!resolved.startsWith(publicDir)) {
    return null;
  }
  return resolved;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function requireAuthDev(req, res) {
  if (!fs.existsSync(distVerify)) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Falta dist/. Ejecuta antes: npm run build' }));
    return null;
  }
  const { verifyBearerToken } = await import(pathToFileURL(distVerify).href);
  const authz = req.headers.authorization;
  const result = await verifyBearerToken(typeof authz === 'string' ? authz : undefined);
  if (!result.ok) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: result.message }));
    return null;
  }
  return result.user;
}

const server = http.createServer(async (req, res) => {
  const host =
    req.headers.host || `localhost:${req.socket?.localPort ?? PREFERRED_PORT}`;
  const url = new URL(req.url || '/', `http://${host}`);

  if (req.method === 'OPTIONS' && API_WITH_OPTIONS.includes(url.pathname)) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const methods =
      url.pathname === '/api/chat' || url.pathname === '/api/chat-clear'
        ? 'POST, OPTIONS'
        : 'GET, OPTIONS';
    res.setHeader('Access-Control-Allow-Methods', methods);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.writeHead(204).end();
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/auth-config') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    const supabaseUrl = process.env.SUPABASE_URL?.trim();
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY?.trim();
    if (!supabaseUrl || !supabaseAnonKey) {
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Auth no configurado en el servidor.' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ supabaseUrl, supabaseAnonKey }));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/auth-session') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const user = await requireAuthDev(req, res);
    if (!user) {
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, email: user.email, userId: user.id }));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/resumen-cuentas') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const user = await requireAuthDev(req, res);
    if (!user) {
      return;
    }
    try {
      if (!fs.existsSync(distResumen)) {
        res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Falta dist/. Ejecuta antes: npm run build' }));
        return;
      }
      const { handleResumenCuentasGet } = await import(pathToFileURL(distResumen).href);
      const out = await handleResumenCuentasGet(user.id);
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
      });
      res.end(JSON.stringify(out));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: msg }));
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/chat') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const user = await requireAuthDev(req, res);
    if (!user) {
      return;
    }
    try {
      if (!fs.existsSync(distChat)) {
        res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(
          JSON.stringify({
            error: 'Falta dist/. Ejecuta antes: npm run build',
          }),
        );
        return;
      }

      const { handleChatPost } = await import(pathToFileURL(distChat).href);
      const raw = await readBody(req);
      let body;
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'JSON inválido' }));
        return;
      }
      const message = body.message;
      if (typeof message !== 'string' || !message.trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Falta "message" (string)' }));
        return;
      }
      const sessionId =
        typeof body.sessionId === 'string' || typeof body.session_id === 'string'
          ? String(body.sessionId ?? body.session_id).trim()
          : null;
      const out = await handleChatPost(message.trim(), {
        sessionId,
        authUserId: user.id,
        authUserEmail: user.email ?? null,
      });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(out));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: msg }));
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/chat-history') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const user = await requireAuthDev(req, res);
    if (!user) {
      return;
    }
    try {
      if (!fs.existsSync(distChatHistory)) {
        res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Falta dist/. Ejecuta antes: npm run build' }));
        return;
      }
      const { handleChatHistoryGet } = await import(pathToFileURL(distChatHistory).href);
      const sessionId = url.searchParams.get('session_id');
      const out = await handleChatHistoryGet(sessionId, user.id);
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
      });
      res.end(JSON.stringify(out));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: msg }));
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/chat-clear') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const user = await requireAuthDev(req, res);
    if (!user) {
      return;
    }
    try {
      if (!fs.existsSync(distChatClear)) {
        res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Falta dist/. Ejecuta antes: npm run build' }));
        return;
      }
      const { handleChatClearPost } = await import(pathToFileURL(distChatClear).href);
      const raw = await readBody(req);
      let body;
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'JSON inválido' }));
        return;
      }
      const sessionId =
        typeof body.session_id === 'string'
          ? body.session_id.trim()
          : typeof body.sessionId === 'string'
            ? body.sessionId.trim()
            : null;
      const out = await handleChatClearPost(sessionId, user.id);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(out));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: msg }));
    }
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }

  const filePath = safePublicPath(url.pathname);
  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No encontrado');
    return;
  }

  const ext = path.extname(filePath);
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  if (req.method === 'HEAD') {
    res.writeHead(200).end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
});

function listenOnPort(srv, port) {
  return new Promise((resolve, reject) => {
    const onErr = (e) => {
      srv.off('error', onErr);
      reject(e);
    };
    srv.once('error', onErr);
    srv.listen(port, () => {
      srv.off('error', onErr);
      resolve(port);
    });
  });
}

(async () => {
  let port = PREFERRED_PORT;
  const limit = PREFERRED_PORT + 20;
  while (port <= limit) {
    try {
      await listenOnPort(server, port);
      console.log(`[dev:web] Chat y estáticos en http://localhost:${port}`);
      if (port !== PREFERRED_PORT) {
        console.warn(
          `[dev:web] El puerto ${PREFERRED_PORT} estaba ocupado (¿otro npm run dev:web?). Usando ${port}.`,
        );
      }
      console.log(`[dev:web] Código desde dist/ (build se ejecutó al iniciar dev:web). Requiere .env.`);
      return;
    } catch (e) {
      if (e && e.code === 'EADDRINUSE') {
        console.warn(`[dev:web] Puerto ${port} en uso, probando ${port + 1}…`);
        port++;
      } else {
        console.error(e);
        process.exit(1);
      }
    }
  }
  console.error(`[dev:web] Sin puerto libre entre ${PREFERRED_PORT} y ${limit}.`);
  process.exit(1);
})();
