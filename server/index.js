/**
 * 本地 / 自建服务器入口（Node ≥ 22.5）
 *   - 数据：node:sqlite 单文件数据库（data/forum.db）
 *   - 图片：data/uploads 目录
 *   - 前端：dist/ 静态资源（SPA 回退到 index.html）
 * 与 Cloudflare Workers 版本共用 core/ 里的全部业务逻辑。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { createNodeDb } from '../core/adapters.js';
import { createFsUploads } from '../core/uploads.js';
import { createApp } from '../core/router.js';
import { SCHEMA_SQL } from '../core/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.FORUM_DATA_DIR || path.join(ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'forum.db');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DIST_DIR = path.join(ROOT, 'dist');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = createNodeDb(DatabaseSync, DB_PATH);
const uploads = createFsUploads(UPLOAD_DIR, fs, path);
const app = createApp({
  db,
  uploads,
  schemaSql: SCHEMA_SQL,
  log: (msg) => console.log(`[forum] ${msg}`),
});

/* --------------------------- 请求体读取 --------------------------- */

const MAX_BODY = 6 * 1024 * 1024; // 图片上限 5MB，留一点余量

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('请求体过大（上限 5MB）'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))));
    req.on('error', reject);
  });
}

/* ----------------------------- 静态资源 ---------------------------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

function serveStatic(pathname) {
  const rel = pathname.replace(/^\/+/, '');
  const target = path.join(DIST_DIR, rel);
  if (!target.startsWith(DIST_DIR)) return null;
  if (rel && fs.existsSync(target) && fs.statSync(target).isFile()) {
    return { file: target, type: MIME[path.extname(target).toLowerCase()] ?? 'application/octet-stream' };
  }
  const index = path.join(DIST_DIR, 'index.html');
  if (fs.existsSync(index)) return { file: index, type: MIME['.html'] };
  return null;
}

/* ------------------------------- 服务 ------------------------------ */

const headerBag = (raw) => ({
  get: (name) => {
    const v = raw[String(name).toLowerCase()];
    return Array.isArray(v) ? v.join(', ') : (v ?? null);
  },
});

const server = http.createServer(async (req, res) => {
  const host = req.headers.host ?? `127.0.0.1:${PORT}`;
  const url = new URL(req.url, `${req.socket.encrypted ? 'https' : 'http'}://${host}`);

  try {
    const isApi = url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/');
    if (!isApi) {
      const found = req.method === 'GET' || req.method === 'HEAD' ? serveStatic(url.pathname) : null;
      if (found) {
        res.writeHead(200, { 'Content-Type': found.type, 'Cache-Control': url.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' });
        if (req.method === 'HEAD') return res.end();
        return fs.createReadStream(found.file).pipe(res);
      }
      if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(
          '<h1>前端尚未构建</h1><p>请先执行 <code>npm run build</code>。</p>'
        );
      }
    }

    const hasBody = !['GET', 'HEAD'].includes(req.method);
    const bodyBytes = hasBody ? await readBody(req) : null;
    const ctx = await app.handle({
      method: req.method,
      url,
      headers: headerBag(req.headers),
      bodyBytes,
      env: process.env,
    });

    const headers = {};
    for (const [k, v] of ctx._headers) {
      if (k.toLowerCase() === 'set-cookie') {
        headers['Set-Cookie'] = headers['Set-Cookie'] ? [].concat(headers['Set-Cookie'], v) : [v];
      } else {
        headers[k] = v;
      }
    }
    if (ctx._contentType) headers['Content-Type'] = ctx._contentType;
    res.writeHead(ctx._status, headers);
    if (req.method === 'HEAD') return res.end();
    res.end(ctx._body ?? '');
  } catch (err) {
    const status = err.status ?? 500;
    if (status >= 500) console.error('[forum] 请求处理失败:', err);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: err.message ?? '服务器内部错误' }));
  }
});

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
server.listen(PORT, HOST, () => {
  console.log(`[forum] 论坛已启动 → http://${HOST}:${PORT}`);
  console.log(`[forum] 数据库: ${DB_PATH}（node:sqlite）`);
  console.log(`[forum] 图片目录: ${UPLOAD_DIR}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
